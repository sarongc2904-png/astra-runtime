'use strict';
// [ASTRA-11L §16] BusinessMemoryReport. ~34 structured sections. Deterministic report_id.
// No free text as memory. No LLM, no web, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const SECTION_NAMES = Object.freeze([
  'report_metadata', 'business_identity', 'memory_candidates', 'accepted_memories', 'rejected_memories',
  'evidence_bindings', 'scope_bindings', 'provenance', 'duplicates', 'conflicts', 'conditional_differences',
  'supersessions', 'invalidations', 'staleness', 'active_memories', 'stale_memories', 'expired_memories',
  'learnings', 'learning_promotions', 'hypotheses', 'decisions', 'experiments', 'results', 'constraints',
  'offers', 'segments', 'channels', 'funnel_state', 'unit_economics', 'retrieval_status', 'resolution_status',
  'snapshot', 'limitations', 'integrity', 'boundary', 'evidence_appendix', 'section_index',
]);

function sec(v) {
  const empty = v == null || (Array.isArray(v) && v.length === 0) || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0);
  return empty ? { status: 'NONE' } : v;
}

function buildReport(x) {
  const {
    referenceTime = null, businessId = null, candidates = [], records = [], evidenceBindings = [],
    provenances = [], conflicts = [], supersessions = [], invalidationResult = null, stalenessById = {},
    promotions = [], retrievals = [], resolutions = [], snapshot = null, integrity = null,
  } = x;

  const accepted = records.filter(m => m.record_status === 'ACCEPTED');
  const rejected = records.filter(m => m.record_status === 'REJECTED');
  const byType = (t) => accepted.filter(m => m.memory_type === t).map(m => m.memory_id).sort();

  const appendixRefs = [...new Set(records.flatMap(m => m.evidence_refs))].sort();
  const entries = appendixRefs.map(er => ({ evidence_ref: er, memory_ids: records.filter(m => m.evidence_refs.includes(er)).map(m => m.memory_id).sort() }));

  const graphErrors = [];
  for (const m of accepted) if (m.evidence_refs.length === 0) graphErrors.push(`accepted memory ${m.memory_id} has no evidence`);
  for (const m of accepted) if (m.memory_type === 'LEARNING' && !promotions.some(p => p.status === 'LEARNING_PROMOTED')) graphErrors.push(`LEARNING ${m.memory_id} accepted without a permitted promotion`);

  const report = {
    schema_version: 'ucdm-business-memory-1.0.0',
    downstream_schema_versions: { ucdm: 'ucdm-1.0.0', funnel_revenue: 'ucdm-funnel-revenue-1.0.0', experiment: 'ucdm-experiment-1.0.0' },
    reference_time: referenceTime,
    generated_by: 'deterministic:ucdm/business_memory',
    sections: {
      report_metadata: { engine: 'ASTRA-11L Business Memory', reference_time: referenceTime, deterministic: true },
      business_identity: sec(businessId ? { business_id: businessId } : null),
      memory_candidates: sec(candidates.map(c => ({ candidate_id: c.candidate_id, memory_type: c.memory_type, status: c.status, reject_code: c.reject_code, missing_fields: c.missing_fields }))),
      accepted_memories: sec(accepted.map(m => ({ memory_id: m.memory_id, memory_type: m.memory_type, temporal_status: m.temporal_status, staleness: m.staleness_class, identity_status: m.identity_status, supersession_status: m.supersession_status, conflict_state: m.conflict_state }))),
      rejected_memories: sec(rejected.map(m => ({ memory_id: m.memory_id, memory_type: m.memory_type, reject_reasons: m.reject_reasons }))),
      evidence_bindings: sec(evidenceBindings.map(e => ({ evidence_binding_id: e.evidence_binding_id, status: e.evidence_status, refs: e.evidence_refs.length }))),
      scope_bindings: sec(accepted.map(m => ({ memory_id: m.memory_id, scope: m.scope }))),
      provenance: sec(provenances.map(p => ({ provenance_id: p.provenance_id, source_engine: p.source_engine, source_report_id: p.source_report_id, complete: p.complete, missing: p.missing }))),
      duplicates: sec(records.filter(m => m.identity_status === 'DUPLICATE_MEMORY').map(m => ({ memory_id: m.memory_id, matched: m.identity_related_ids }))),
      conflicts: sec(conflicts.filter(c => c.conflict_type === 'DIRECT_CONFLICT' || c.conflict_type === 'UNRESOLVED_CONFLICT' || c.conflict_type === 'TEMPORAL_CHANGE').map(c => ({ conflict_id: c.conflict_id, type: c.conflict_type, memory_a: c.memory_a, memory_b: c.memory_b }))),
      conditional_differences: sec(conflicts.filter(c => c.conflict_type === 'SCOPE_CONDITIONAL_DIFFERENCE').map(c => ({ conflict_id: c.conflict_id, memory_a: c.memory_a, memory_b: c.memory_b, scope: c.scope_comparison.mismatched_fields }))),
      supersessions: sec(supersessions.filter(s => s.status !== 'NOT_SUPERSEDED').map(s => ({ resolution_id: s.resolution_id, new_memory_id: s.new_memory_id, status: s.status, supersedes: s.supersedes }))),
      invalidations: sec(invalidationResult ? invalidationResult.records.map(r => ({ memory_id: r.memory_id, reason: r.invalidation_reason, by: r.invalidated_by })) : null),
      staleness: sec(Object.entries(stalenessById).map(([mid, s]) => ({ memory_id: mid, staleness_class: s.staleness_class, reasons: s.reasons }))),
      active_memories: sec(accepted.filter(m => m.temporal_status === 'ACTIVE').map(m => m.memory_id).sort()),
      stale_memories: sec(accepted.filter(m => m.temporal_status === 'STALE' || m.staleness_class === 'STALE').map(m => m.memory_id).sort()),
      expired_memories: sec(accepted.filter(m => m.temporal_status === 'EXPIRED').map(m => m.memory_id).sort()),
      learnings: sec(byType('LEARNING')),
      learning_promotions: sec(promotions.map(p => ({ promotion_id: p.promotion_id, status: p.status, blockers: p.blockers, is_positive_learning: p.is_positive_learning }))),
      hypotheses: sec(byType('HYPOTHESIS')),
      decisions: sec(byType('DECISION')),
      experiments: sec(byType('EXPERIMENT')),
      results: sec(byType('RESULT')),
      constraints: sec(byType('CONSTRAINT')),
      offers: sec(byType('OFFER')),
      segments: sec(byType('SEGMENT')),
      channels: sec(byType('CHANNEL')),
      funnel_state: sec(byType('FUNNEL_STATE')),
      unit_economics: sec(byType('UNIT_ECONOMICS')),
      retrieval_status: sec(retrievals.map(r => ({ retrieval_id: r.retrieval_id, result_count: r.result_count, ordering: r.ordering, uses_llm: r.uses_llm, uses_embeddings: r.uses_embeddings }))),
      resolution_status: sec(resolutions.map(r => ({ resolution_result_id: r.resolution_result_id, status: r.status, selected: r.selected, arbitrary_selection: r.arbitrary_selection }))),
      snapshot: sec(snapshot ? { snapshot_id: snapshot.snapshot_id, counts: snapshot.counts, is_absolute_truth: snapshot.is_absolute_truth } : null),
      limitations: sec([
        rejected.length ? `${rejected.length} candidate(s) rejected` : null,
        conflicts.some(c => c.conflict_type === 'UNRESOLVED_CONFLICT') ? 'unresolved conflicts present' : null,
        Object.values(stalenessById).some(s => s.staleness_class === 'UNKNOWN') ? 'some memories have UNKNOWN staleness (no policy)' : null,
        accepted.some(m => m.evidence_status !== 'EVIDENCE_VALID') ? 'some accepted memories have non-VALID evidence (weak types only)' : null,
      ].filter(Boolean)),
      integrity: sec(integrity ? { network_calls: integrity.network_calls, llm_calls: integrity.llm_calls, production_db_writes: integrity.production_db_writes, external_storage_writes: integrity.external_storage_writes, deploys: integrity.deploys, cost_usd: integrity.cost_usd, clean: integrity.clean } : null),
      boundary: {
        no_supabase_persistence: true, no_vector_db: true, no_embeddings: true, no_llm: true,
        no_crm: true, no_meta: true, no_experiment_execution: true, no_campaign_modification: true,
        no_commercial_action: true, no_deploy: true, no_production_routing: true, no_autonomous_long_term_memory: true,
      },
      evidence_appendix: { count: entries.length, entries },
      section_index: SECTION_NAMES,
    },
    evidence_graph_valid: graphErrors.length === 0,
    evidence_graph_errors: graphErrors.sort(),
    caveats: [
      'No memory without evidence — a candidate with no evidence_refs is rejected (MEMORY_EVIDENCE_REQUIRED).',
      'A HYPOTHESIS is never auto-promoted to FACT or LEARNING.',
      'An INCONCLUSIVE / INSUFFICIENT_EVIDENCE / INVALIDATED result never becomes a positive learning.',
      'A result about one scope is never silently generalised to a global business claim.',
      'New evidence never silently overwrites a prior memory — it coexists / supersedes / conflicts explicitly.',
      'Every memory has a temporal state; expiry dates are never invented (STALENESS_UNKNOWN without a policy).',
      'Conflicting memories are never resolved by arbitrary selection.',
      'Retrieval is deterministic — no embeddings, no vector similarity, no LLM.',
      'A snapshot is currently-valid evidence-backed memory, not absolute truth.',
      'ASTRA-11L persists nothing and takes no commercial action. No production routing. No autonomous action.',
    ],
  };
  report.section_names = Object.keys(report.sections);
  report.report_id = 'bmr_report_' + sha256Hex(canonicalize({ ...report, report_id: undefined }));
  report.content_hash = report.report_id;
  return deepFreeze(report);
}

module.exports = { SECTION_NAMES, buildReport };
