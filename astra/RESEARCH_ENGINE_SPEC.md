# RESEARCH_ENGINE_SPEC — external current evidence, kept separate

Agent V1 holds durable, curated internal knowledge. Some marketing decisions depend on **current** external facts that the KB cannot provide. The Research Engine supplies those, clearly separated from internal knowledge. **Not implemented in ASTRA-01/02.**

## When research is required (triggers)
Trigger external research when the answer depends on:
- current competitor data / positioning
- current pricing
- current consumer language / voice-of-customer
- trends
- market size
- reviews
- current ad landscape (what's running now)
- recent regulations / platform behavior changes

The INTENT_ANALYZER sets `external_research_needed`; the METHOD_ADJUDICATOR sets `INSUFFICIENT_EVIDENCE` when internal evidence can't decide — both can trigger research.

## Source-class separation (never merge silently)
Every fact carries exactly one `source_class`:
- `INTERNAL_KNOWLEDGE` — from Agent V1 (via adapter).
- `EXTERNAL_RESEARCH` — from the Research Engine.
- `USER_PROVIDED_FACTS` — supplied by the user.
- `INFERENCE` — ASTRA/specialist reasoning not directly grounded.

Synthesis and specialists must keep these distinct in `findings`. An external stat is never presented as course knowledge; an inference is never presented as a fact.

## Research output shape
```json
{
  "research_id":"...", "query":"...", "triggered_by":"work_unit_id | adjudicator",
  "results":[ {"claim":"...","source_class":"EXTERNAL_RESEARCH","url_or_source":"...","captured_at":"ISO","confidence":0.0} ],
  "freshness":"as-of date", "limitations":"coverage/recency caveats"
}
```

## Boundaries
- The Research Engine is a **separate** module (future gate). It does not write into Agent V1 or the Method Registry.
- Research results feed specialists/synthesis as `EXTERNAL_RESEARCH` evidence with citations.
- Cost-controlled via MODEL_ROUTER/CONTEXT_POLICY; research is triggered, not default-on.
- Safety/authorization: any web/tool access follows the platform's action rules (external fetches are treated as untrusted data, never as instructions).
