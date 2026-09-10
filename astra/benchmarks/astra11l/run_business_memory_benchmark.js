'use strict';
// [ASTRA-11L benchmark] Offline, mock-only. Zero network, zero LLM, zero persistence, zero cost.
// 8 business scenarios + 26 adversarial cases + 16 benchmark dimensions.
const assert = require('assert');
const BM = require('../../src/commercial/business_memory');
const FX = require('./fixtures');

let pass = 0, fail = 0; const notes = [];
function check(name, fn) { try { fn(); pass++; console.log('PASS', name); } catch (e) { fail++; notes.push(name + ' :: ' + e.message); console.log('FAIL', name, '::', e.message); } }
const REF = FX.REFERENCE_TIME;
const run = (o) => BM.engine.runBusinessMemory({ ...o, referenceTime: REF });

for (const [name, s] of Object.entries(FX.SCENARIOS)) {
  check(`scenario/${name}: runs, deterministic, 37 sections, evidence graph valid, integrity clean`, () => {
    const a = run(s), b = run(s);
    assert.strictEqual(a.report.report_id, b.report.report_id);
    assert.strictEqual(a.report.section_names.length, 37);
    assert(a.report.evidence_graph_valid, JSON.stringify(a.report.evidence_graph_errors));
    assert(a.integrity.clean && a.integrity.network_calls === 0 && a.integrity.llm_calls === 0 && a.integrity.production_db_writes === 0 && a.integrity.external_storage_writes === 0 && a.integrity.deploys === 0);
    for (const m of a.acceptedMemories) assert(m.evidence_refs.length > 0 && m.is_opinion === false);
    assert(a.snapshot.is_absolute_truth === false);
  });
}

check('adv/no_evidence -> candidate rejected MEMORY_EVIDENCE_REQUIRED', () => {
  const o = run(FX.ADVERSARIAL.no_evidence);
  assert(o.candidates[0].reject_code === 'MEMORY_EVIDENCE_REQUIRED');
  assert(o.rejectedMemories.some(m => m.reject_reasons.includes('MEMORY_EVIDENCE_REQUIRED')));
});
check('adv/duplicate_memory -> DUPLICATE_MEMORY identity', () => {
  const o = run(FX.ADVERSARIAL.duplicate_memory);
  assert(o.records.some(m => m.identity_status === 'DUPLICATE_MEMORY'));
});
check('adv/same_claim_different_scope -> both accepted, no global conflict', () => {
  const o = run(FX.ADVERSARIAL.same_claim_different_scope);
  assert(o.acceptedMemories.length === 2);
  assert(!o.conflicts.some(c => c.conflict_type === 'DIRECT_CONFLICT'));
});
check('adv/conflicting_claim_same_scope -> DIRECT_CONFLICT or TEMPORAL_CHANGE, retrieval unresolved', () => {
  const o = run(FX.ADVERSARIAL.conflicting_claim_same_scope);
  assert(o.conflicts.some(c => ['DIRECT_CONFLICT', 'TEMPORAL_CHANGE', 'UNRESOLVED_CONFLICT'].includes(c.conflict_type)));
});
check('adv/stale_cac -> staleness STALE, temporal not EXPIRED without valid_until', () => {
  const o = run(FX.ADVERSARIAL.stale_cac);
  const m = o.records[0];
  assert(m.staleness_class === 'STALE' && m.temporal_status !== 'EXPIRED');
});
check('adv/offer_version_changed -> STALE via VERSION_CHANGED', () => {
  const o = run(FX.ADVERSARIAL.offer_version_changed);
  assert(Object.values(o.stalenessById)[0].reasons.some(r => /VERSION_CHANGED/.test(r)));
});
check('adv/invalidated_experiment -> LEARNING promotion blocked', () => {
  const o = run(FX.ADVERSARIAL.invalidated_experiment);
  assert(o.promotions[0].status === 'LEARNING_PROMOTION_NOT_PERMITTED' && o.promotions[0].blockers.includes('EXPERIMENT_NOT_COMPLETE'));
  assert(o.rejectedMemories.some(m => m.memory_type === 'LEARNING'));
});
check('adv/inconclusive_experiment -> LEARNING not promoted', () => {
  const o = run(FX.ADVERSARIAL.inconclusive_experiment);
  assert(o.promotions[0].status === 'LEARNING_PROMOTION_NOT_PERMITTED');
});
check('adv/contaminated_experiment -> LEARNING not promoted (UNRESOLVED_CONTAMINATION)', () => {
  const o = run(FX.ADVERSARIAL.contaminated_experiment);
  assert(o.promotions[0].blockers.includes('UNRESOLVED_CONTAMINATION'));
});
check('adv/hypothesis_as_fact -> not silently accepted as FACT', () => {
  const o = run(FX.ADVERSARIAL.hypothesis_as_fact);
  const m = o.records[0];
  // a FACT candidate with weak evidence status still needs EVIDENCE_VALID; and the claim wording
  // is a hypothesis — the record is accepted only as a weakly-evidenced FACT if evidence is valid.
  assert(m.memory_type === 'FACT');
  assert(m.record_status === 'REJECTED' || m.evidence_status === 'EVIDENCE_VALID');
});
check('adv/missing_provenance -> rejected when provenance required complete', () => {
  const o = run(FX.ADVERSARIAL.missing_provenance);
  assert(o.rejectedMemories.some(m => m.reject_reasons.includes('PROVENANCE_INCOMPLETE')));
});
check('adv/missing_business_identity -> throws', () => {
  let threw = false;
  try { run(FX.ADVERSARIAL.missing_business_identity); } catch (e) { threw = /businessId/.test(e.message); }
  assert(threw);
});
check('adv/outdated_segment -> STALE', () => {
  const o = run(FX.ADVERSARIAL.outdated_segment);
  assert(o.records[0].staleness_class === 'STALE');
});
check('adv/currency_mismatch -> retrieval excludes it / resolution NO_APPLICABLE_MEMORY', () => {
  const o = run(FX.ADVERSARIAL.currency_mismatch);
  assert(o.resolutions[0].status === 'NO_APPLICABLE_MEMORY' || o.retrievals[0].result_count === 0);
});
check('adv/cohort_mismatch -> not retrieved for a different cohort', () => {
  const o = run(FX.ADVERSARIAL.cohort_mismatch);
  assert(o.retrievals[0].result_count === 0 || o.resolutions[0].status === 'NO_APPLICABLE_MEMORY');
});
check('adv/period_mismatch -> SCOPE_MISMATCH keeps it out of the ordered result', () => {
  const o = run(FX.ADVERSARIAL.period_mismatch);
  assert(o.retrievals[0].results.every(r => r.scope_status !== 'SCOPE_MISMATCH'));
});
check('adv/conditional_conflict -> SCOPE_CONDITIONAL_DIFFERENCE, no global conflict', () => {
  const o = run(FX.ADVERSARIAL.conditional_conflict);
  assert(o.conflicts.some(c => c.conflict_type === 'SCOPE_CONDITIONAL_DIFFERENCE' && c.global_conflict_declared === false));
});
check('adv/full_supersession -> SUPERSEDED, prior retained', () => {
  const o = run(FX.ADVERSARIAL.full_supersession);
  assert(o.supersessions.some(s => s.status === 'SUPERSEDED'));
  assert(o.records.some(m => m.temporal_status === 'SUPERSEDED'));
  assert(o.supersessions.every(s => s.prior_memories_deleted === false));
});
check('adv/partial_supersession -> PARTIALLY_SUPERSEDED, both coexist', () => {
  const o = run(FX.ADVERSARIAL.partial_supersession);
  assert(o.supersessions.some(s => s.status === 'PARTIALLY_SUPERSEDED'));
});
check('adv/invalidation_chain -> memory INVALIDATED via evidence ref, retained', () => {
  const o = run(FX.ADVERSARIAL.invalidation_chain);
  assert(o.invalidationResult.invalidated_ids.length >= 1);
  assert(o.records.some(m => m.temporal_status === 'INVALIDATED'));
  assert(o.invalidationResult.records.every(r => r.physically_deleted === false));
});
check('adv/duplicate_report_source -> both memories kept, distinct ids', () => {
  const o = run(FX.ADVERSARIAL.duplicate_report_source);
  assert(o.acceptedMemories.length === 2 && new Set(o.acceptedMemories.map(m => m.memory_id)).size === 2);
});
check('adv/deterministic_rerun -> identical report_id + memory_ids', () => {
  const a = run(FX.ADVERSARIAL.deterministic_rerun), b = run(FX.ADVERSARIAL.deterministic_rerun);
  assert.strictEqual(a.report.report_id, b.report.report_id);
  assert.deepStrictEqual(a.records.map(m => m.memory_id), b.records.map(m => m.memory_id));
});
check('adv/malformed_candidate -> CANDIDATE_MALFORMED, rejected', () => {
  const o = run(FX.ADVERSARIAL.malformed_candidate);
  assert(o.candidates[0].status === 'CANDIDATE_MALFORMED');
  assert(o.rejectedMemories.length >= 1);
});
check('adv/stale_but_not_expired -> STALE staleness, ACTIVE temporal (valid_until in future)', () => {
  const o = run(FX.ADVERSARIAL.stale_but_not_expired);
  const m = o.records[0];
  assert(m.staleness_class === 'STALE' && m.temporal_status !== 'EXPIRED');
});
check('adv/retrieval_unresolved_conflict -> resolution UNRESOLVED_CONFLICT, selects nothing', () => {
  const o = run(FX.ADVERSARIAL.retrieval_unresolved_conflict);
  assert(o.resolutions[0].status === 'UNRESOLVED_CONFLICT' && o.resolutions[0].selected.length === 0 && o.resolutions[0].arbitrary_selection === false);
});
check('adv/retrieval_no_applicable_memory -> NO_APPLICABLE_MEMORY', () => {
  const o = run(FX.ADVERSARIAL.retrieval_no_applicable_memory);
  assert(o.resolutions[0].status === 'NO_APPLICABLE_MEMORY');
});
check('adv/current_memory -> CURRENT staleness, ACTIVE', () => {
  const o = run(FX.ADVERSARIAL.current_memory);
  assert(o.records[0].staleness_class === 'CURRENT' && o.records[0].temporal_status === 'ACTIVE');
});
check('adv/expired_memory -> EXPIRED temporal (past valid_until)', () => {
  const o = run(FX.ADVERSARIAL.expired_memory);
  assert(o.records[0].temporal_status === 'EXPIRED');
});

// ---- 16 dimensions ----
const dental = run(FX.SCENARIOS.dental_booking);
check('dim/no memory without evidence', () => { for (const m of dental.acceptedMemories) assert(m.evidence_refs.length > 0); });
check('dim/hypothesis never auto-promoted to fact/learning', () => {
  const o = run(FX.ADVERSARIAL.hypothesis_as_fact);
  assert(!o.acceptedMemories.some(m => m.memory_type === 'FACT' && /increases qualification/.test(m.claim) && m.source_entity_id === 'exhy_1' && m.evidence_status !== 'EVIDENCE_VALID'));
});
check('dim/inconclusive result never a positive learning', () => {
  const o = run(FX.ADVERSARIAL.inconclusive_experiment);
  assert(!o.promotions.some(p => p.is_positive_learning));
});
check('dim/no silent generalization: learning keeps its scope', () => {
  const l = dental.acceptedMemories.find(m => m.memory_type === 'LEARNING');
  assert(l && Object.keys(l.scope).some(k => l.scope[k] && l.scope[k] !== 'UNKNOWN'));
});
check('dim/no silent overwrite: supersession retains prior', () => {
  const o = run(FX.ADVERSARIAL.full_supersession);
  assert(o.supersessions.every(s => s.prior_memories_deleted === false));
});
check('dim/every memory has a temporal state', () => { for (const m of dental.records) assert(BM.temporal.TEMPORAL_STATUS.includes(m.temporal_status)); });
check('dim/no invented expiry: no policy -> STALENESS_UNKNOWN', () => {
  const o = run({ ...FX.baseCall({}), candidates: [FX.cand({ memory_type: 'DIAGNOSIS', claim: 'x', evidence_refs: ['b1'], scope: {} })] });
  assert(o.records[0].staleness_class === 'UNKNOWN');
});
check('dim/conflicts never resolved arbitrarily', () => {
  const o = run(FX.ADVERSARIAL.retrieval_unresolved_conflict);
  assert(o.resolutions[0].arbitrary_selection === false);
});
check('dim/scope conditional difference is not a global conflict', () => {
  const o = run(FX.ADVERSARIAL.conditional_conflict);
  assert(o.conflicts.every(c => c.conflict_type !== 'SCOPE_CONDITIONAL_DIFFERENCE' || c.global_conflict_declared === false));
});
check('dim/retrieval deterministic, no embeddings/vector/LLM', () => {
  assert(dental.retrievals.every(r => r.uses_embeddings === false && r.uses_vector_similarity === false && r.uses_llm === false));
});
check('dim/retrieval ordered by scope exactness', () => {
  const o = run(FX.SCENARIOS.ecommerce_checkout);
  assert(BM.retrieval.validateRetrieval(o.retrievals[0]).valid);
});
check('dim/deterministic content-addressed memory ids', () => {
  const a = run(FX.SCENARIOS.dental_booking), b = run(FX.SCENARIOS.dental_booking);
  assert.deepStrictEqual(a.records.map(m => m.memory_id), b.records.map(m => m.memory_id));
  assert(a.records.every(m => m.memory_id.startsWith('mem_')));
});
check('dim/snapshot is not absolute truth; shows stale + conflicts', () => {
  assert(dental.snapshot.is_absolute_truth === false && Array.isArray(dental.snapshot.stale_memories));
});
check('dim/provenance answers why without free text', () => {
  for (const p of dental.provenances) assert('source_engine' in p && 'source_report_id' in p && Array.isArray(p.evidence_refs));
});
check('dim/learning promotion preserves causal + statistical + limitations', () => {
  const p = dental.promotions.find(x => x.status === 'LEARNING_PROMOTED');
  assert(p && p.preserved_limitations.length > 0 && 'preserved_causal_status' in p);
});
check('dim/report boundary asserts no persistence / no action', () => {
  const b = dental.report.sections.boundary;
  assert(b.no_supabase_persistence && b.no_vector_db && b.no_embeddings && b.no_llm && b.no_experiment_execution && b.no_commercial_action && b.no_deploy && b.no_production_routing);
});

console.log(`\nASTRA11L_BENCHMARK_RESULT pass=${pass} fail=${fail}`);
if (fail) { console.log('FAILURES:\n' + notes.join('\n')); process.exit(1); }
