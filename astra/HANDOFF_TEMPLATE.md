# HANDOFF_LATEST — <task_id> — <date>

> Self-contained resume brief. A cold agent (Codex or fresh Claude Code) should continue by reading ONLY this file + `CURRENT_TASK.md` + the files referenced below. Do not re-explore the repo.

## Where we are
<2–4 sentences: what this task is, how far it got, what remains>

## Objective & authorized scope
<copy from CURRENT_TASK.md>

## How to resume in one step
1. Read `CURRENT_TASK.md`.
2. Inspect only: <explicit file list>.
3. Do: <the exact next step>.

## Files to inspect (and only these)
- `path` — <why>

## What is done / not done
- Done: <bullets>
- Not done: <bullets>

## Decisions already locked
- <decision + rationale>

## Runtime / env to reproduce
```
STRATEGY_F_PYTHON=C:\Users\saro_\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe
PYTHONIOENCODING=utf-8
PYTHONUTF8=1
```
Agent V1 frozen (verify before continuing): knowledge.js <sha>, classifier_decision_cache.js <sha>, retrieval_strategy_f.py <sha>, benchmark ddb566fd, evidence 02cbd455.

## Tests
- Run: <commands to re-establish green state>
- Pending: <what to test next>

## Blockers / open questions
- <items>

## Prohibitions (inherited — do not violate)
No changes to Agent V1 runtime / Strategy-F / classifier / decision cache / corpus / embeddings / Supabase / benchmark / answer policy / evaluator. No specialists before their gate. No method hardcoded as universally best. No retrieval-score-only framework selection. No silent merging of conflicting methods.

## If you are Codex resuming after Claude Code credits ran out
This handoff is designed to be sufficient on its own. If anything needed is missing, note it in `CURRENT_TASK.md` under "Unresolved questions" and proceed conservatively (fail closed) rather than guessing.
