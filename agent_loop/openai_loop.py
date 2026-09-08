from __future__ import annotations

import argparse
from dataclasses import dataclass
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone
import unicodedata

# ``openai`` is imported lazily inside main() so that this module can be imported
# (and the environment preflight can run and report ENVIRONMENT_BLOCKED) even when
# the package is missing. ``OpenAI`` below appears only in string annotations
# (``from __future__ import annotations`` is active), so it is never evaluated here.
if False:  # pragma: no cover - typing only
    from openai import OpenAI

# Hardening layer. Dual import so this works both as an imported package
# (``agent_loop.openai_loop`` in tests) and as a script (``python agent_loop/openai_loop.py``,
# where the script's own directory is on sys.path).
try:  # pragma: no cover - import shim
    from agent_loop import autonomous
except ImportError:  # pragma: no cover - import shim
    import autonomous


BASE = Path(__file__).resolve().parent.parent
LOOP_DIR = BASE / "agent_loop"
CLAUDE_MD = BASE / "CLAUDE.md"
STATE_CANDIDATES = (LOOP_DIR / "AGENT_STATE.md", BASE / "AGENT_STATE.md")
STATE_FILE = next((path for path in STATE_CANDIDATES if path.is_file()), STATE_CANDIDATES[0])
HANDOFF_FILE = LOOP_DIR / "HANDOFF_LATEST.md"
TASK_FILE = BASE / "CLAUDE_TASK.md"
LOCK_FILE = LOOP_DIR / ".agent-loop.lock"
LOG_DIR = LOOP_DIR / "logs"
RUNTIME_DIR = LOOP_DIR / "runtime"

MOJIBAKE_MARKERS = ("ÃƒÂ¡", "ÃƒÂ©", "ÃƒÂ­", "ÃƒÂ³", "ÃƒÂº", "ÃƒÂ±", "Ã‚Â¿", "Ã‚Â¡")
AUTHORIZATION_TITLE_MARKERS = (
    "HUMAN_AUTHORIZATION",
    "AUTORIZACION_HUMANA",
    "AUTORIZACION HUMANA",
    "NUEVA AUTORIZACION HUMANA",
)
COMPLETION_TITLE_MARKERS = (
    "EXECUTION", "EJECUCION", "RESULT", "RESULTADO", "VALIDATION",
    "VALIDACION", "COMPLETION", "COMPLETADO", "CIERRE",
)
COMPLETION_BODY_RE = re.compile(
    r"(?:\bPASS\b|\bCOMPLETAD[AO]\b|\bVALIDAD[AO]\b|\ball_pass\s*[:=]\s*true\b)",
    re.IGNORECASE,
)
REVIEWER_RE = re.compile(r"(?im)^\s*Reviewer\s*:\s*(?P<value>[^\r\n]+?)\s*$")
DATE_RE = re.compile(r"(?im)^\s*Date\s*:\s*(?P<value>[^\r\n]+?)\s*$")
DECISION_RE = re.compile(r"(?im)^\s*Decision\s*:\s*(?P<value>[^\r\n]+?)\s*$")
SCOPE_RE = re.compile(
    r"\b(?:authoriz(?:e|es|ed|ation)|autoriza(?:cion|do|da|expresamente)?|"
    r"authorized|autorizado|alcance|scope|ejecutar|execution)\b",
    re.IGNORECASE,
)
NON_HUMAN_REVIEWER_PREFIXES = ("agent", "agente", "assistant", "claude", "openai", "system")


@dataclass(frozen=True)
class MarkdownSection:
    title: str
    body: str
    source: str
    order: int


@dataclass(frozen=True)
class ActiveTaskResolution:
    required_action: str
    active_task: str
    authorization_id: str | None
    reason: str


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def read_utf8(path: Path) -> str:
    try:
        value = path.read_text(encoding="utf-8")
    except UnicodeDecodeError as exc:
        raise RuntimeError(f"{path} no es UTF-8 vÃ¡lido: {exc}") from exc
    found = sorted(marker for marker in MOJIBAKE_MARKERS if marker in value)
    if found:
        raise RuntimeError(
            f"{path} contiene texto posiblemente mal codificado: {', '.join(found)}"
        )
    return value


def atomic_write(path: Path, content: str) -> None:
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(content, encoding="utf-8", newline="\n")
    os.replace(temporary, path)


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def normalize_marker(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    without_accents = "".join(char for char in normalized if not unicodedata.combining(char))
    return re.sub(r"\s+", " ", without_accents).strip().upper()


def markdown_sections(value: str, source: str, order_offset: int = 0) -> list[MarkdownSection]:
    """Split append-only state/task documents into level-two sections."""
    matches = list(re.finditer(r"(?m)^##\s+(.+?)\s*$", value))
    sections: list[MarkdownSection] = []
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(value)
        sections.append(
            MarkdownSection(
                title=match.group(1).strip(),
                body=value[match.start():end].strip(),
                source=source,
                order=order_offset + index,
            )
        )
    return sections


def is_authorization_section(section: MarkdownSection) -> bool:
    title = normalize_marker(section.title).replace("-", "_")
    return any(marker in title for marker in AUTHORIZATION_TITLE_MARKERS)


def authorization_id(section: MarkdownSection) -> str:
    return normalize_marker(section.title).replace(" ", "_")


def validate_human_authorization(section: MarkdownSection) -> list[str]:
    """Validate only explicit, attributed authorizations; ambiguity fails closed."""
    errors: list[str] = []
    reviewer_match = REVIEWER_RE.search(section.body)
    date_match = DATE_RE.search(section.body)
    decision_match = DECISION_RE.search(section.body)
    reviewer = reviewer_match.group("value").strip() if reviewer_match else ""
    if not reviewer:
        errors.append("missing_reviewer")
    elif normalize_marker(reviewer).casefold().startswith(NON_HUMAN_REVIEWER_PREFIXES):
        errors.append("reviewer_not_human")
    if not date_match:
        errors.append("missing_date")
    else:
        try:
            datetime.fromisoformat(date_match.group("value").strip().replace("Z", "+00:00"))
        except ValueError:
            errors.append("invalid_date")
    decision = normalize_marker(decision_match.group("value")) if decision_match else ""
    if decision != "AUTHORIZED":
        errors.append("decision_not_authorized")
    scope_body = re.sub(r"(?m)^##\s+.+?$", "", section.body, count=1)
    scope_body = REVIEWER_RE.sub("", scope_body)
    scope_body = DATE_RE.sub("", scope_body)
    scope_body = DECISION_RE.sub("", scope_body)
    if len(scope_body.strip()) < 30 or not SCOPE_RE.search(normalize_marker(scope_body)):
        errors.append("missing_explicit_scope")
    return errors


def completion_sections(state: str, task: str) -> list[MarkdownSection]:
    state_sections = markdown_sections(state, "AGENT_STATE.md")
    task_sections = markdown_sections(task, "CLAUDE_TASK.md", len(state_sections))
    return [
        section
        for section in state_sections + task_sections
        if not is_authorization_section(section)
        and any(marker in normalize_marker(section.title) for marker in COMPLETION_TITLE_MARKERS)
        and COMPLETION_BODY_RE.search(normalize_marker(section.body))
    ]


def authorization_is_completed(
    authorization: MarkdownSection,
    completions: list[MarkdownSection],
) -> bool:
    """A reused authorization id remains closed, even if copied after a historical STOP."""
    identifier = authorization_id(authorization)
    return any(identifier in normalize_marker(section.body).replace(" ", "_") for section in completions)


def resolve_active_task(task: str, state: str) -> ActiveTaskResolution:
    """Resolve the newest authorization before asking the model for a task.

    AGENT_STATE is append-only canonical context. CLAUDE_TASK is ordered after it so
    a genuinely later human block can reactivate work, but only with a new, valid
    authorization id. HANDOFF is intentionally excluded from authority resolution.
    """
    state_sections = markdown_sections(state, "AGENT_STATE.md")
    task_sections = markdown_sections(task, "CLAUDE_TASK.md", len(state_sections))
    candidates = [
        section for section in state_sections + task_sections if is_authorization_section(section)
    ]
    if not candidates:
        return ActiveTaskResolution("STOP", "NONE", None, "no_explicit_human_authorization")
    newest = candidates[-1]
    identifier = authorization_id(newest)
    errors = validate_human_authorization(newest)
    if errors:
        return ActiveTaskResolution(
            "STOP", "NONE", identifier,
            "ambiguous_latest_authorization:" + ",".join(errors),
        )
    if authorization_is_completed(newest, completion_sections(state, task)):
        return ActiveTaskResolution(
            "STOP", "NONE", identifier, "latest_authorized_task_already_completed"
        )
    active = (
        f"SOURCE: {newest.source}\n"
        f"AUTHORIZATION_ID: {identifier}\n"
        f"STATUS: AUTHORIZED_AND_NOT_COMPLETED\n\n"
        f"{newest.body}"
    )
    return ActiveTaskResolution("RUN", active, identifier, "latest_authorized_task_is_active")


# Explicit closure phrases accepted as completion evidence in addition to a
# PASS/COMPLETADO/VALIDADO/all_pass signal (COMPLETION_BODY_RE). A gate may legitimately
# close without the literal word "PASS", so an explicit "cerrada/closed" also counts.
COMPLETION_CLOSURE_RE = re.compile(r"\bcerrad[ao]\b|\bclosed\b", re.IGNORECASE)


def completion_recorded_for(authorization_id: str | None, state: str, task: str) -> bool:
    """True if AGENT_STATE/CLAUDE_TASK record a completion for this authorization id.

    Gate-agnostic and robust to heading style: it scans every level-two section of the
    canonical documents and accepts one as completion evidence when the section BOTH
      * names this authorization id, AND
      * shows a completion signal in the same section â€” a PASS/COMPLETADO/VALIDADO/
        all_pass token (``COMPLETION_BODY_RE``) or an explicit closure ("cerrada"/
        "closed", ``COMPLETION_CLOSURE_RE``).

    Unlike the deterministic gate's ``completion_sections`` (which keys on a marker word
    in the section TITLE), this does not require the completion block to be titled with a
    marker â€” real completion blocks are often titled by the gate name itself. Detection
    only broadens (it can recognise more closures), and it is used solely by the post-cycle
    verifier; it never changes resolve_active_task's authority.
    """
    if not authorization_id:
        return False
    identifier = normalize_marker(authorization_id).replace(" ", "_")
    sections = markdown_sections(state, "AGENT_STATE.md")
    sections += markdown_sections(task, "CLAUDE_TASK.md", len(sections))
    for section in sections:
        if identifier not in normalize_marker(section.body).replace(" ", "_"):
            continue
        if COMPLETION_BODY_RE.search(section.body) or COMPLETION_BODY_RE.search(
            normalize_marker(section.body)
        ):
            return True
        if COMPLETION_CLOSURE_RE.search(section.body):
            return True
    return False


def dedicated_handoff_exists(authorization_id: str | None) -> bool:
    """Advisory only: True if a dedicated ``HANDOFF_<GATE>.md`` names this authorization.

    Never a completion requirement â€” it is accepted as *additional* evidence for
    traceability. ``HANDOFF_LATEST.md`` is explicitly excluded from this scan.
    """
    if not authorization_id:
        return False
    identifier = normalize_marker(authorization_id).replace(" ", "_")
    try:
        candidates = sorted(LOOP_DIR.glob("HANDOFF_*.md"))
    except OSError:
        return False
    for path in candidates:
        if path.name == "HANDOFF_LATEST.md":
            continue
        try:
            content = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        if identifier in normalize_marker(content).replace(" ", "_"):
            return True
    return False


def verify_gate_completion(
    authorization_id: str | None, state: str, task: str
) -> tuple[bool, str]:
    """Deterministic, gate-agnostic completion check. Fail-closed.

    Completion authority is AGENT_STATE.md + CLAUDE_TASK.md via resolve_active_task â€”
    NOT HANDOFF_LATEST.md. A SUCCESS cycle is only accepted when BOTH hold:

      1. AGENT_STATE/CLAUDE_TASK record a completion for this authorization id
         (``completion_recorded_for``); and
      2. resolve_active_task no longer keeps this same authorization id RUN-active
         (the gate is closed and will not rerun).

    Returns ``(ok, reason)``:
      * ``(False, "no_authorization_id")``      â€” nothing to verify against.
      * ``(False, "evidence_not_updated")``     â€” no canonical completion recorded.
      * ``(False, "authorization_still_active")`` â€” recorded, yet gate still active.
      * ``(True,  "canonical_completion")``     â€” closed; PASS regardless of HANDOFF.
    """
    if not authorization_id:
        return False, "no_authorization_id"
    recorded = completion_recorded_for(authorization_id, state, task)
    resolution = resolve_active_task(task, state)
    still_active = (
        resolution.required_action == "RUN"
        and resolution.authorization_id == authorization_id
    )
    if not recorded:
        return False, "evidence_not_updated"
    if still_active:
        return False, "authorization_still_active"
    return True, "canonical_completion"


def enforce_required_action(required_action: str, model_action: str) -> None:
    """Reject model output that would bypass the deterministic task-resolution gate."""
    if model_action != required_action:
        raise RuntimeError(
            "OpenAI contradijo el pre-gate determinista: "
            f"esperado ACTION={required_action}, recibido ACTION={model_action}."
        )


def acquire_lock() -> int:
    try:
        descriptor = os.open(LOCK_FILE, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError as exc:
        owner = LOCK_FILE.read_text(encoding="utf-8", errors="replace").strip()
        raise RuntimeError(
            "Ya existe otro loop activo o quedÃ³ un lock pendiente: "
            f"{LOCK_FILE} ({owner or 'sin datos'})"
        ) from exc
    os.write(descriptor, f"pid={os.getpid()} started={utc_now()}\n".encode("utf-8"))
    return descriptor


def release_lock(descriptor: int) -> None:
    os.close(descriptor)
    try:
        LOCK_FILE.unlink()
    except FileNotFoundError:
        pass


def build_prompt(
    claude_md: str,
    state: str,
    handoff: str,
    task: str,
) -> tuple[str, ActiveTaskResolution]:
    resolution = resolve_active_task(task, state)
    prompt = f"""ActÃºa como controlador del loop OpenAI â†’ Claude Code.

El pre-gate determinista ya separÃ³ la tarea vigente del historial.
REQUIRED_ACTION: {resolution.required_action}
RESOLUTION_REASON: {resolution.reason}

Regla de precedencia obligatoria:
1. EvalÃºa primero CURRENT_ACTIVE_TASK.
2. HISTORICAL_CONTEXT conserva trazabilidad, pero no contiene instrucciones operativas vigentes.
3. Un STOP histÃ³rico no cancela una autorizaciÃ³n humana explÃ­cita posterior y aÃºn abierta.
4. Una autorizaciÃ³n cerrada no puede reutilizarse para repetir un gate.
5. Si CURRENT_ACTIVE_TASK es NONE, si la autorizaciÃ³n es ambigua o si ya fue completada,
   debes responder ACTION: STOP.
6. Si CURRENT_ACTIVE_TASK estÃ¡ AUTHORIZED_AND_NOT_COMPLETED, debes responder ACTION: RUN
   y redactar Ãºnicamente la siguiente tarea limitada a esa autorizaciÃ³n.

EvalÃºa Ãºnicamente la evidencia incluida y redacta la siguiente tarea exacta.

La respuesta debe comenzar con dos lÃ­neas. La primera debe ser exactamente una de:
DECISION: PASS
DECISION: PARTIAL
DECISION: BLOCKED

La segunda debe ser exactamente una de:
ACTION: RUN
ACTION: STOP

DespuÃ©s escribe el contenido completo y directamente ejecutable de CLAUDE_TASK.md.
ACTION debe coincidir exactamente con REQUIRED_ACTION; cualquier discrepancia serÃ¡
rechazada de forma fail-closed antes de ejecutar Claude.

Reglas duras:
- No inventar evidencia ni declarar PASS por intenciÃ³n, ejecuciÃ³n parcial o ausencia de error.
- No avanzar de gate si falta validaciÃ³n explÃ­cita y verificable.
- No permitir Supabase, kb_chunks, freeze, cambios destructivos ni visiÃ³n masiva,
  salvo autorizaciÃ³n explÃ­cita en CURRENT_ACTIVE_TASK.
- Si el resultado anterior es PARTIAL o BLOCKED, resolver primero ese bloqueo.
- No repetir trabajo cerrado.
- Diferenciar ejecuciÃ³n tÃ©cnica, evidencia obtenida y validaciÃ³n del gate.
- Si hay contradicciÃ³n, priorizar evidencia verificable y pedir resolverla.
- No revelar ni copiar secretos, claves o tokens en la tarea.
- No envolver la respuesta en bloques de cÃ³digo Markdown.
- No incluir explicaciones fuera de CLAUDE_TASK.md.

===== CURRENT_ACTIVE_TASK =====
{resolution.active_task}

===== GOVERNING_RULES_CLAUDE.md =====
{claude_md}

===== HISTORICAL_CONTEXT / CLAUDE_TASK.md =====
{task}

===== HISTORICAL_CONTEXT / AGENT_STATE.md =====
{state}

===== HISTORICAL_CONTEXT / HANDOFF_LATEST.md (MAY BE STALE) =====
{handoff}
"""
    return prompt, resolution


def generate_task(client: "OpenAI", model: str) -> tuple[str, str, str, ActiveTaskResolution]:
    prompt, resolution = build_prompt(
        read_utf8(CLAUDE_MD),
        read_utf8(STATE_FILE),
        read_utf8(HANDOFF_FILE),
        read_utf8(TASK_FILE) if TASK_FILE.is_file() else "",
    )
    last_error: Exception | None = None
    for attempt in range(1, 4):
        try:
            response = client.responses.create(model=model, input=prompt)
            output = response.output_text.strip()
            if not output:
                raise RuntimeError("OpenAI devolviÃ³ una tarea vacÃ­a.")
            lines = output.splitlines()
            if len(lines) < 3 or not lines[0].startswith("DECISION:") or not lines[1].startswith("ACTION:"):
                raise RuntimeError("La respuesta no contiene los encabezados DECISION/ACTION requeridos.")
            decision = lines[0].split(":", 1)[1].strip()
            action = lines[1].split(":", 1)[1].strip()
            if decision not in {"PASS", "PARTIAL", "BLOCKED"}:
                raise RuntimeError(f"DECISION invÃ¡lida: {decision}")
            if action not in {"RUN", "STOP"}:
                raise RuntimeError(f"ACTION invÃ¡lida: {action}")
            enforce_required_action(resolution.required_action, action)
            return output + "\n", decision, action, resolution
        except Exception as exc:
            last_error = exc
            if attempt < 3:
                time.sleep(2**attempt)
    raise RuntimeError(f"OpenAI fallÃ³ despuÃ©s de 3 intentos: {last_error}") from last_error


def run_claude(timeout_minutes: int, max_turns: int, cycle: int) -> tuple[Path, "autonomous.Outcome"]:
    """Run one Claude Code invocation.

    Never raises on a Claude-side failure: it always writes a cycle log and returns
    a classified :class:`autonomous.Outcome` so the controller can decide what to do
    (retry, continue, stop cleanly, or fail). Only a truly missing executable â€” an
    environment fault â€” raises, and that is caught by the environment preflight.
    """
    executable = shutil.which("claude")
    if not executable:
        raise RuntimeError("No se encontrÃ³ 'claude' en PATH. Ejecuta: claude --version")

    prompt = (
        "Lee CLAUDE_TASK.md y ejecÃºtalo exactamente dentro de este proyecto. "
        "Respeta CLAUDE.md y AGENT_STATE.md. No avances gates sin evidencia. "
        "Al terminar, actualiza agent_loop/HANDOFF_LATEST.md con resultado, evidencia, "
        "archivos modificados, validaciones y estado PASS/PARTIAL/BLOCKED."
    )
    command = [
        executable,
        "-p",
        prompt,
        "--permission-mode",
        "auto",
        "--output-format",
        "json",
        "--max-turns",
        str(max_turns),
    ]

    LOG_DIR.mkdir(parents=True, exist_ok=True)
    log_path = LOG_DIR / f"cycle-{cycle:03d}-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
    try:
        completed = subprocess.run(
            command,
            cwd=BASE,
            text=True,
            encoding="utf-8",
            errors="replace",
            capture_output=True,
            timeout=timeout_minutes * 60,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        def timeout_text(value: object) -> str:
            if isinstance(value, bytes):
                return value.decode("utf-8", errors="replace")
            return str(value or "")

        stdout_text = timeout_text(exc.stdout)
        stderr_text = timeout_text(exc.stderr)
        outcome = autonomous.classify_claude_outcome(124, stdout_text, stderr_text, timed_out=True)
        timeout_log = {
            "timestamp": utc_now(),
            "status": "TIMEOUT",
            "timeout_minutes": timeout_minutes,
            "returncode": 124,
            "classification": {"category": outcome.category, "reason": outcome.reason},
            "stdout": stdout_text,
            "stderr": stderr_text,
        }
        atomic_write(log_path, json.dumps(timeout_log, ensure_ascii=False, indent=2) + "\n")
        return log_path, outcome

    outcome = autonomous.classify_claude_outcome(
        completed.returncode, completed.stdout or "", completed.stderr or ""
    )
    record = {
        "timestamp": utc_now(),
        "status": "COMPLETED" if completed.returncode == 0 else "FAILED",
        "returncode": completed.returncode,
        "classification": {
            "category": outcome.category,
            "reason": outcome.reason,
            "cost_usd": outcome.cost_usd,
            "num_turns": outcome.num_turns,
            "api_error_status": outcome.api_error_status,
        },
        "stdout": completed.stdout,
        "stderr": completed.stderr,
    }
    atomic_write(log_path, json.dumps(record, ensure_ascii=False, indent=2) + "\n")
    return log_path, outcome


def validate_files() -> None:
    missing = [str(path) for path in (CLAUDE_MD, STATE_FILE, HANDOFF_FILE) if not path.is_file()]
    if missing:
        raise RuntimeError("Faltan archivos obligatorios:\n- " + "\n- ".join(missing))
    for path in (CLAUDE_MD, STATE_FILE, HANDOFF_FILE):
        read_utf8(path)
    if not os.environ.get("OPENAI_API_KEY"):
        raise RuntimeError("Falta OPENAI_API_KEY en el entorno.")


class LoopWiring:
    """Concrete collaborators for :class:`autonomous.LoopController` (real OpenAI + Claude)."""

    def __init__(self, client: "OpenAI", model: str, runtime: "autonomous.RuntimeState",
                 max_turns: int):
        self.client = client
        self.model = model
        self.runtime = runtime
        self.max_turns = max_turns
        self._handoff_before: str | None = None
        self._active_authorization_id: str | None = None

    def gate(self) -> "autonomous.GateDecision":
        task, decision, action, resolution = generate_task(self.client, self.model)
        atomic_write(TASK_FILE, task)
        self._active_authorization_id = resolution.authorization_id
        print(
            f"[{utc_now()}] GATE: DECISION={decision} ACTION={resolution.required_action} "
            f"AUTH={resolution.authorization_id} REASON={resolution.reason}",
            flush=True,
        )
        return autonomous.GateDecision(
            action=resolution.required_action,
            authorization_id=resolution.authorization_id,
            reason=resolution.reason,
            decision=decision,
        )

    def claude(self, cycle: int, timeout_minutes: int):
        self._handoff_before = digest(HANDOFF_FILE) if HANDOFF_FILE.is_file() else None
        holder: dict = {}

        def once(attempt: int) -> "autonomous.Outcome":
            log_path, outcome = run_claude(timeout_minutes, self.max_turns, cycle)
            holder["log_path"] = log_path
            print(
                f"[{utc_now()}] CLAUDE cycle={cycle} attempt={attempt} "
                f"-> {outcome.category}:{outcome.reason} cost={outcome.cost_usd}",
                flush=True,
            )
            return outcome

        def on_retry(attempt: int, outcome: "autonomous.Outcome") -> None:
            self.runtime.append_event("RETRY", cycle=cycle, attempt=attempt,
                                      reason=outcome.reason)

        outcome = autonomous.run_with_retries(once, max_retries=3, base_delay=2.0,
                                              on_retry=on_retry)
        return holder.get("log_path"), outcome

    def verify_completion(self) -> tuple[bool, str]:
        """Canonical, gate-agnostic completion check (AGENT_STATE + resolve_active_task).

        HANDOFF_LATEST.md is never required. Its change and any dedicated
        ``HANDOFF_<GATE>.md`` are recorded only as advisory observability.
        """
        state = read_utf8(STATE_FILE)
        task = read_utf8(TASK_FILE) if TASK_FILE.is_file() else ""
        auth_id = self._active_authorization_id
        ok, reason = verify_gate_completion(auth_id, state, task)
        handoff_latest_changed = (
            HANDOFF_FILE.is_file() and digest(HANDOFF_FILE) != self._handoff_before
        )
        self.runtime.append_event(
            "COMPLETION_CHECK",
            authorization_id=auth_id,
            ok=ok,
            reason=reason,
            canonical_completion_recorded=completion_recorded_for(auth_id, state, task),
            dedicated_handoff_present=dedicated_handoff_exists(auth_id),
            handoff_latest_changed=handoff_latest_changed,
        )
        return ok, reason


def _env_exit_code(reason: str | None) -> int:
    return autonomous.EXIT_ENVIRONMENT_BLOCKED


def main() -> int:
    parser = argparse.ArgumentParser(description="Loop controlado OpenAI â†’ Claude Code")
    parser.add_argument("--model", default="gpt-5.6-sol")
    parser.add_argument("--max-cycles", type=int, default=50)
    parser.add_argument("--timeout-minutes", type=int, default=45)
    parser.add_argument("--max-runtime-minutes", type=int, default=480)
    parser.add_argument("--max-turns", type=int, default=60)
    parser.add_argument("--max-cost-usd", type=float, default=autonomous.LoopConfig.max_cost_usd)
    parser.add_argument("--max-cost-per-cycle-usd", type=float,
                        default=autonomous.LoopConfig.max_cost_per_cycle_usd)
    parser.add_argument("--unattended", action="store_true")
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if (
        args.max_cycles < 1
        or args.timeout_minutes < 1
        or args.max_runtime_minutes < 1
        or args.max_turns < 1
        or args.max_cost_usd <= 0
        or args.max_cost_per_cycle_usd <= 0
    ):
        parser.error("Los lÃ­mites deben ser mayores que cero.")

    runtime = autonomous.RuntimeState(RUNTIME_DIR)

    # --- Environment preflight (read-only; never installs) ---
    env = autonomous.check_environment((CLAUDE_MD, STATE_FILE, HANDOFF_FILE), require_openai=True)
    if not env.ok:
        runtime.update_status(status="ENVIRONMENT_BLOCKED", last_error=env.reason)
        runtime.append_event("FAIL", reason=env.reason, env=env.to_public_dict())
        print(f"ENVIRONMENT_BLOCKED: {env.reason}", file=sys.stderr)
        return _env_exit_code(env.reason)
    # Fail-closed UTF-8 / mojibake validation before touching anything.
    for path in (CLAUDE_MD, STATE_FILE, HANDOFF_FILE):
        read_utf8(path)

    # --- Execution lock with stale recovery ---
    lock = autonomous.LockManager(
        LOCK_FILE,
        on_recover=lambda info: runtime.append_event(
            "STOP", reason="stale_lock_recovered", **info
        ),
    )
    try:
        lock.acquire()
    except autonomous.LockError as exc:
        runtime.update_status(status="LOCK_HELD", last_error=str(exc))
        runtime.append_event("FAIL", reason="lock_held", detail=str(exc))
        print(str(exc), file=sys.stderr)
        return autonomous.EXIT_LOCK_HELD

    try:
        from openai import OpenAI  # lazy: only needed for a real run

        client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
        runtime.update_status(status="STARTED", last_action="env_ok",
                              gate=None, authorization_id=None)
        config = autonomous.LoopConfig(
            max_cycles=args.max_cycles,
            timeout_minutes=args.timeout_minutes,
            max_runtime_minutes=args.max_runtime_minutes,
            max_turns=args.max_turns,
            once=args.once,
            dry_run=args.dry_run,
            unattended=args.unattended,
            max_cost_usd=args.max_cost_usd,
            max_cost_per_cycle_usd=args.max_cost_per_cycle_usd,
        )
        wiring = LoopWiring(client, args.model, runtime, args.max_turns)
        controller = autonomous.LoopController(
            config, wiring.gate, wiring.claude, runtime,
            completion_fn=wiring.verify_completion,
        )
        result = controller.run()
        print(
            f"RESULT: {result.stop_reason} exit={result.exit_code} "
            f"cycles={result.cycles_run} cost_usd={result.total_cost_usd:.4f}",
            flush=True,
        )
        return result.exit_code
    finally:
        lock.release()


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("Loop cancelado por el usuario.", file=sys.stderr)
        raise SystemExit(130)
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)

