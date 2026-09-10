# VERSIONING_CONTRACT — ASTRA-11B

Implemented by `astra/src/commercial/schema/versioning.js` +
`astra/src/commercial/validation/canonical.js`.

## 1. Identity

| id | formula | property |
|---|---|---|
| **entity_id** | `"ent_" + sha256(canonical({entity_type, natural_key}))[:40]` | stable across every version of the same logical entity; natural-key string values are NFC/LF-normalized so trivial text variation does not fork identity |
| **version_id** | `"ver_" + sha256(canonical({entity_id, content_hash, effective_at, supersedes}))[:40]` | immutable; a different effective time or a different lineage → a different version |
| **content_hash** | `sha256(canonical(body))` | key-order independent, whitespace independent, `undefined` dropped, non-finite numbers rejected |

`canonical()` is a standalone re-implementation of the discipline proven in the frozen
`classifier_decision_cache.js` (sorted keys, no insignificant whitespace, SHA-256) — the
frozen file is **not** imported or touched.

## 2. Version record

```
{
  _meta: {
    entity_type, entity_kind,            // ANALYTICAL_SNAPSHOT | OPERATIONAL_STATE
    entity_id, version_id, content_hash, schema_version,
    created_at, effective_at,
    supersedes, previous_version,        // prior version_id or null
    actor, reason,
    immutable                            // true for ANALYTICAL_SNAPSHOT
  },
  body: { ...canonical fields... }
}
```

`makeVersion(entityType, body, {effective_at, supersedes, actor, reason, evidenceGraph})`
validates the body first (refuses to version an invalid entity) and returns the record.

## 3. Mutable operational state vs append-only analytical snapshots

| entity_kind | entities | mutation policy |
|---|---|---|
| **OPERATIONAL_STATE** | Business, Product, Channel, Campaign, Creative, Lead, Conversation, Appointment, Opportunity, Sale, Experiment | may be **re-materialized** — a new `makeVersion` replaces the working value. The record's `_meta` is frozen; the `body` object is never mutated in place. Prior versions are still retained (append-only store), but "latest" is expected to move. |
| **ANALYTICAL_SNAPSHOT** | Market, MarketObservation, Competitor, Segment, Persona, ICP, VoiceOfCustomerObservation, JTBD, CustomerJourney(+Stage), Positioning, Offer, Funnel(+Stage/Transition), Metric, Insight, Recommendation, RevenueEvent, RetentionEvent, UpsellEvent, ExperimentResult, BusinessLearning, and all PROVENANCE entities | **deep-frozen and append-only.** A change is a *new* version that `supersedes` the prior one. Test 7 proves mutation throws `TypeError`. |

Rationale: operational records track a live world (a lead moves stages); intelligence
objects are evidence-bound conclusions — overwriting one loses its provenance and makes
drift unauditable (ASTRA-11A risk R11).

## 4. Supersession + conflict

- `supersede(priorRecord, newBody, {effective_at, reason, actor})` → a new version with
  `supersedes = prior.version_id`. Linear lineage.
- `detectConflict(a, b)` returns `{conflict:true, versions:[...], status:'OPEN'}` when two
  versions share an `entity_id`, neither supersedes the other, and their content differs.
  **Conflicts are surfaced, never auto-resolved** — same discipline as the frozen decision
  cache's "singular winner, never overwrite".
- `verifyVersion(record)` recomputes all three hashes and fails closed on any mismatch
  (tamper / drift detection).

## 5. `schema_version`

`ucdm-1.0.0` (from `entities.js`). Every version record carries it. A future schema change
bumps this; migration is an ASTRA-11C+ concern with its own gate.

## 6. Tests

| test | asserts |
|---|---|
| 7 | analytical snapshot is deep-frozen; `body`/`_meta` mutation throws |
| 8 | content_hash + version_id + entity_id stable across calls; key-order independent; `verifyVersion` passes |
| "versioning: supersede…" | append-only lineage (`v2.supersedes === v1.version_id`, same `entity_id`); linear supersession is not a conflict; an independent divergent version **is** a surfaced `OPEN` conflict |
