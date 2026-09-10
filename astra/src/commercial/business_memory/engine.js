'use strict';
// [ASTRA-11L] Business Memory Engine — deterministic pipeline orchestrator.
//   Validated ASTRA-11B..11K evidence -> MemoryCandidate -> type classification ->
//   evidence binding -> scope binding -> provenance -> temporal validity -> conflict
//   detection -> supersession resolution -> staleness -> MemoryRecord -> retrieval ->
//   resolution -> BusinessMemoryReport.
// Fully deterministic. NO LLM, NO web, NO I/O (beyond the integrity self-scan), NO clock.
// ASTRA-11L persists nothing and takes no commercial action.
const CAND = require('./candidate');
const EVID = require('./evidence');
const SCOPE = require('./scope');
const PROV = require('./provenance');
const IDN = require('./identity');
const TMP = require('./temporal');
const STL = require('./staleness');
const CONF = require('./conflicts');
const SUP = require('./supersession');
const PROM = require('./promotion');
const INV = require('./invalidation');
const REC = require('./record');
const RETR = require('./retrieval');
const RES = require('./resolution');
const SNAP = require('./snapshot');
const IG = require('./integrity');
const REP = require('./report');

// runBusinessMemory({ businessId, candidates[], existingMemories[], invalidations[],
//                     retrievalQueries[], referenceTime, knownValidEvidenceRefs, invalidatedEvidenceRefs,
//                     provenanceRequireComplete })
function runBusinessMemory(opts) {
  const referenceTime = opts.referenceTime;
  if (!referenceTime) throw new Error('[ASTRA-11L] referenceTime is required (no implicit clock)');
  const businessId = opts.businessId;
  if (!businessId) throw new Error('[ASTRA-11L] businessId is required');

  const knownValid = opts.knownValidEvidenceRefs ? new Set(opts.knownValidEvidenceRefs.map(String)) : null;
  const invalidatedRefs = opts.invalidatedEvidenceRefs || [];
  const supersededRefs = opts.supersededEvidenceRefs || [];

  // ---- CANDIDATES (§1) ----
  const candidates = (opts.candidates || []).map(CAND.makeCandidate);
  for (const c of candidates) { const v = CAND.validateCandidate(c); if (!v.valid && c.status === 'CANDIDATE_VALID') throw new Error(`[ASTRA-11L] invalid MemoryCandidate: ${v.errors.join(' | ')}`); }

  const existing = (opts.existingMemories || []).slice();
  const records = [], evidenceBindings = [], provenances = [], stalenessById = {}, promotions = [];
  const supersessions = [];
  const acceptedSoFar = existing.filter(m => m.record_status === 'ACCEPTED');

  for (const c of candidates) {
    // ---- EVIDENCE BINDING (§3) ----
    const eb = EVID.bindEvidence({ evidence_refs: c.evidence_refs, source_engine: c.source_engine, source_report_id: c.source_report_id, source_entity_id: c.source_entity_id, known_valid_refs: knownValid, invalidated_refs: invalidatedRefs, superseded_refs: supersededRefs });
    { const v = EVID.validateEvidenceBinding(eb); if (!v.valid) throw new Error(`[ASTRA-11L] invalid EvidenceBinding: ${v.errors.join(' | ')}`); }
    evidenceBindings.push(eb);

    // ---- PROVENANCE (§5) ----
    const provenance = PROV.buildProvenance({ source_engine: c.source_engine, source_report_id: c.source_report_id, source_entity_id: c.source_entity_id, source_timestamp: c.observed_at || c.created_at, source_content: (c.metadata && c.metadata.source_content) || null, evidence_refs: c.evidence_refs, input_scope: c.scope });
    { const v = PROV.validateProvenance(provenance, {}); if (!v.valid && c.status === 'CANDIDATE_VALID') { /* soft: still record, report shows incomplete */ } }
    provenances.push(provenance);

    // ---- SCOPE binding validation (§4) ----
    const requiredScope = (c.metadata && c.metadata.required_scope_fields) || [];
    const scopeValidation = SCOPE.validateScope(c.scope, { requiredFields: requiredScope });

    // ---- STALENESS (§8) ----
    const st = STL.assessStaleness({
      age_days: c.observed_at ? Number(((Date.parse(referenceTime) - Date.parse(c.observed_at)) / 86400000).toFixed(2)) : null,
      staleness_policy: (c.metadata && c.metadata.staleness_policy) || null,
      business_cadence: (c.metadata && c.metadata.business_cadence) || null,
      market_volatility: (c.metadata && c.metadata.market_volatility) || null,
      experiment_recency_days: c.metadata && c.metadata.experiment_recency_days,
      offer_version: c.metadata && c.metadata.offer_version, offer_version_at_memory: c.metadata && c.metadata.offer_version_at_memory,
      campaign_version: c.metadata && c.metadata.campaign_version, campaign_version_at_memory: c.metadata && c.metadata.campaign_version_at_memory,
      funnel_version: c.metadata && c.metadata.funnel_version, funnel_version_at_memory: c.metadata && c.metadata.funnel_version_at_memory,
    });
    { const v = STL.validateStaleness(st); if (!v.valid) throw new Error(`[ASTRA-11L] invalid StalenessAssessment: ${v.errors.join(' | ')}`); }

    // ---- TEMPORAL (§7) ----
    const temporal = TMP.buildTemporal({
      created_at: c.created_at, observed_at: c.observed_at, valid_from: c.valid_from, valid_until: c.valid_until,
      last_confirmed_at: (c.metadata && c.metadata.last_confirmed_at) || null,
      staleness_policy: (c.metadata && c.metadata.staleness_policy) || null,
      referenceTime, stalenessClass: st.staleness_class === 'STALE' ? 'STALE' : null,
    });
    { const v = TMP.validateTemporal(temporal); if (!v.valid) throw new Error(`[ASTRA-11L] invalid MemoryTemporal: ${v.errors.join(' | ')}`); }

    // ---- IDENTITY (§6) — build a provisional record just for its id/semantic key ----
    const provisional = { memory_id: IDN.memoryId({ business_id: c.business_id, memory_type: c.memory_type, normalized_claim: c.normalized_claim, scope: c.scope, source_engine: c.source_engine, source_entity_id: c.source_entity_id, evidence_refs: c.evidence_refs }), semantic_key: IDN.semanticKey({ business_id: c.business_id, memory_type: c.memory_type, semantic_target: c.semantic_target, normalized_claim: c.normalized_claim, scope: c.scope }), normalized_claim: c.normalized_claim };
    const identityClass = IDN.classifyIdentity(provisional, acceptedSoFar);

    // ---- SUPERSESSION (§10) ----
    const supRes = SUP.resolveSupersession({ ...provisional, business_id: c.business_id, memory_type: c.memory_type, semantic_target: c.semantic_target, scope: c.scope, observed_at: c.observed_at, replaces: (c.metadata && c.metadata.replaces) || [] }, acceptedSoFar, { referenceTime });
    { const v = SUP.validateSupersession(supRes); if (!v.valid) throw new Error(`[ASTRA-11L] invalid SupersessionResolution: ${v.errors.join(' | ')}`); }
    supersessions.push(supRes);

    // ---- CONFLICTS (§9) vs already-accepted memories with the same semantic target ----
    const candForConflict = { memory_id: provisional.memory_id, business_id: c.business_id, memory_type: c.memory_type, normalized_claim: c.normalized_claim, semantic_target: c.semantic_target, metric: (c.metadata && c.metadata.metric) || c.semantic_target, comparison: (c.metadata && c.metadata.comparison) || null, scope: c.scope, observed_at: c.observed_at };
    const candConflicts = acceptedSoFar
      .filter(m => m.memory_type === c.memory_type && m.business_id === c.business_id && !supRes.supersedes.includes(m.memory_id))
      .map(m => CONF.detectConflict(candForConflict, m, { referenceTime }))
      .filter(x2 => x2.conflict_type !== 'NO_CONFLICT');

    // ---- LEARNING PROMOTION (§11) ----
    let promotion = null;
    if (c.memory_type === 'LEARNING') {
      promotion = PROM.evaluatePromotion({ candidate: c, evidenceBinding: eb, source: (c.metadata && c.metadata.promotion_source) || {}, scopeValidation: SCOPE.validateScope(c.scope, { requiredFields: (c.metadata && c.metadata.required_scope_fields) || ['segment', 'offer'] }), limitations: (c.metadata && c.metadata.limitations) || [] });
      { const v = PROM.validatePromotion(promotion); if (!v.valid) throw new Error(`[ASTRA-11L] invalid LearningPromotion: ${v.errors.join(' | ')}`); }
      promotions.push(promotion);
    }

    // ---- MEMORY RECORD ----
    const record = REC.buildMemoryRecord({ candidate: c, evidenceBinding: eb, provenance, temporal, staleness: st, identityClass, supersession: supRes, promotion, conflicts: candConflicts, provenanceRequireComplete: opts.provenanceRequireComplete === true, referenceTime });
    { const v = REC.validateMemoryRecord(record); if (!v.valid) throw new Error(`[ASTRA-11L] invalid MemoryRecord: ${v.errors.join(' | ')}`); }
    records.push(record);
    stalenessById[record.memory_id] = st;
    if (record.record_status === 'ACCEPTED' && record.identity_status !== 'DUPLICATE_MEMORY') acceptedSoFar.push(record);
  }

  const allMemories = [...existing, ...records];

  // ---- mark superseded prior memories (retained, status updated) ----
  const supersededIds = new Set(supersessions.flatMap(s => s.status === 'SUPERSEDED' ? s.supersedes : []));
  const withSupersedeMarks = allMemories.map(m => supersededIds.has(m.memory_id) && m.record_status === 'ACCEPTED'
    ? Object.freeze({ ...m, temporal_status: 'SUPERSEDED', supersession_status: 'SUPERSEDED', superseded_by_memory_id: (supersessions.find(s => s.supersedes.includes(m.memory_id)) || {}).new_memory_id || null })
    : m);

  // ---- INVALIDATIONS (§12) ----
  const invalidationResult = INV.applyInvalidations(withSupersedeMarks, opts.invalidations || []);
  const invalidSet = new Set(invalidationResult.invalidated_ids);
  const finalMemories = withSupersedeMarks.map(m => invalidSet.has(m.memory_id) && m.record_status === 'ACCEPTED'
    ? Object.freeze({ ...m, temporal_status: 'INVALIDATED' }) : m);

  // ---- CONFLICT SET over the final accepted memories ----
  const acceptedFinal = finalMemories.filter(m => m.record_status === 'ACCEPTED');
  const conflicts = CONF.detectAllConflicts(acceptedFinal, { referenceTime });
  for (const cf of conflicts) { const v = CONF.validateConflict(cf); if (!v.valid) throw new Error(`[ASTRA-11L] invalid ConflictAssessment: ${v.errors.join(' | ')}`); }

  // ---- RETRIEVAL (§13) + RESOLUTION (§14) ----
  const memoriesById = Object.fromEntries(acceptedFinal.map(m => [m.memory_id, m]));
  const retrievals = [], resolutions = [];
  for (const q of (opts.retrievalQueries || [])) {
    const rr = RETR.retrieve({ memories: acceptedFinal, query: { business_id: businessId, ...q } });
    { const v = RETR.validateRetrieval(rr); if (!v.valid) throw new Error(`[ASTRA-11L] invalid RetrievalResult: ${v.errors.join(' | ')}`); }
    retrievals.push(rr);
    const rs = RES.resolve({ retrievalResult: rr, memoriesById, conflicts });
    { const v = RES.validateResolution(rs); if (!v.valid) throw new Error(`[ASTRA-11L] invalid ResolutionResult: ${v.errors.join(' | ')}`); }
    resolutions.push(rs);
  }

  // ---- SNAPSHOT (§15) ----
  const snapshot = SNAP.buildSnapshot({ businessId, memories: acceptedFinal, conflicts, supersessions, invalidatedIds: invalidationResult.invalidated_ids, referenceTime });
  { const v = SNAP.validateSnapshot(snapshot); if (!v.valid) throw new Error(`[ASTRA-11L] invalid BusinessMemorySnapshot: ${v.errors.join(' | ')}`); }

  // ---- INTEGRITY + REPORT ----
  const integrity = IG.attestIntegrity();
  const report = REP.buildReport({
    referenceTime, businessId, candidates, records: finalMemories, evidenceBindings, provenances,
    conflicts, supersessions, invalidationResult, stalenessById, promotions, retrievals, resolutions,
    snapshot, integrity,
  });

  return {
    report, candidates, records: finalMemories, acceptedMemories: acceptedFinal,
    rejectedMemories: finalMemories.filter(m => m.record_status === 'REJECTED'),
    evidenceBindings, provenances, conflicts, supersessions, invalidationResult, stalenessById,
    promotions, retrievals, resolutions, snapshot, integrity,
    provenance_note: 'ASTRA-11L deterministic offline memory engine. No memory without evidence. Hypotheses and inconclusive results are never silently promoted. Scope is preserved. Conflicts, supersession and staleness are explicit. Retrieval is deterministic (no embeddings / vector / LLM). Nothing is persisted. No production routing. No autonomous action.',
  };
}

module.exports = { runBusinessMemory };
