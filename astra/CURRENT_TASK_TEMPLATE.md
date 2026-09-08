# CURRENT_TASK — <task_id>

> Live task state. Update after every material change. Keep it accurate enough that a cold agent can resume from it.

## Task id
<e.g. ASTRA-02_ROUTER_CORE_IMPLEMENTATION>

## Objective
<one-paragraph goal of this task>

## Authorized scope
<exactly what this gate may touch; e.g. "create astra/router/*, astra/contracts/*, astra/methods/loader; no specialists; no Agent V1 change">

## Completed work
- [ ] <item> — <status/notes>
- [x] <item> — done <date>

## Files changed (this task)
- `path` — <what changed> (<created|edited>)

## Files inspected (read-only, for context)
- `path` — <why relevant>

## Decisions made
- <decision> — <rationale> (<date>)

## Tests already run
- `command` → <result>

## Tests pending
- <what still needs testing and how>

## Blockers
- <blocker, or "none">

## EXACT next step
<the single next action a resuming agent should take — concrete, file-level>

## Prohibited actions
- Do NOT modify Agent V1 runtime / Strategy-F / classifier / decision cache / corpus / embeddings / Supabase / benchmark / answer policy / evaluator.
- Do NOT implement specialists (unless this gate authorizes them).
- Do NOT hardcode any method as universally best.
- Do NOT let retrieval scores alone choose frameworks.
- Do NOT merge conflicting methods silently.

## Current git diff summary
<`git diff --stat` style summary, or "not a git repo — file list + shas">

## Current runtime state
- Required env: `STRATEGY_F_PYTHON=…`, `PYTHONIOENCODING=utf-8`, `PYTHONUTF8=1`
- Agent V1 frozen shas (verify): knowledge.js <sha>, classifier_decision_cache.js <sha>, retrieval_strategy_f.py <sha>
- Cache entries: <n>

## Unresolved questions
- <question needing a human or later decision>
