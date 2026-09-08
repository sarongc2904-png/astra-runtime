# CLAUDE_CODE ↔ CODEX HANDOFF PROTOCOL (mandatory)

ASTRA will be built using BOTH Claude Code and Codex. Claude Code credits may run out mid-task. This protocol lets Codex (or a fresh Claude Code session) resume unfinished work **without** rereading the whole repo or chat history.

## Two canonical files
- **`CURRENT_TASK.md`** — the live state of the task in progress (updated continuously).
- **`HANDOFF_LATEST.md`** — a self-contained resume brief written before a session ends.

Recommended location: repo root or `agent_loop/` (same place the project already keeps `HANDOFF_LATEST.md`). Keep exactly one of each as the live pointer; historical copies go under `astra/handoffs/` if needed. Templates: `astra/CURRENT_TASK_TEMPLATE.md`, `astra/HANDOFF_TEMPLATE.md`.

## The rules
**BEFORE any coding session:**
1. Read `HANDOFF_LATEST.md`.
2. Read `CURRENT_TASK.md`.
3. Inspect ONLY the files those documents reference. Do not re-explore the repo.

**AFTER any material change** (file edited/created, test run, decision made):
- Update `CURRENT_TASK.md` (append to completed work, files changed, decisions, tests, next step).

**BEFORE the session ends** (including when stopping due to credits):
- Write `HANDOFF_LATEST.md` so another agent can continue from exactly the next step.

## Credit-exhaustion / interruption path
If Claude Code stops (credits or otherwise), the last `HANDOFF_LATEST.md` + `CURRENT_TASK.md` MUST be sufficient for Codex to:
- know the objective and authorized scope,
- see completed work and the exact next step,
- know prohibited actions and protected components,
- reproduce the runtime/env,
without restarting the task. If they are not sufficient, that is a protocol defect to fix immediately.

## Content requirements (see templates)
`CURRENT_TASK.md` must carry: task id, objective, authorized scope, completed work, files changed, files inspected, decisions made, tests already run, tests pending, blockers, **exact next step**, prohibited actions, current git-diff summary, current runtime state, unresolved questions.

`HANDOFF_LATEST.md` must let a cold agent continue by reading only it + `CURRENT_TASK.md` + the referenced files.

## Safety constraints carried across the handoff
Every handoff repeats the ASTRA prohibitions: do not touch Agent V1 runtime / Strategy-F / classifier / cache / corpus / embeddings / Supabase / benchmark / answer policy / evaluator; do not implement specialists before their gate; do not hardcode a method as universally best; do not let retrieval scores alone select frameworks; do not merge conflicting methods silently. A resuming agent inherits these verbatim.

## Determinism / integrity
Handoff docs are additive and dated. When a handoff references runtime state (shas, cache entries, env), the resuming agent re-verifies those before continuing (fail-closed if they diverge unexpectedly).
