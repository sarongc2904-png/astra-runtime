'use strict';
// [ASTRA-11D] ResearchPlan (spec section B). Deterministic contract. If an experimental LLM
// planner is used (benchmark harness only), enforceAuthorizedScope() is the deterministic
// gate that guarantees the LLM cannot silently change the research objective or widen scope.
// No LLM in this module. No web, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const { RESEARCH_OBJECTIVES } = require('./request');
const { SOURCE_CATEGORIES } = require('../ingestion/raw_source');

const SCOPE_LEVELS = Object.freeze(['SAMPLE', 'LOCAL', 'CATEGORY', 'GLOBAL']);
const SCOPE_RANK = { SAMPLE: 0, LOCAL: 1, CATEGORY: 2, GLOBAL: 3 };

// makePlan({ request, questions, evidence_needed, preferred_source_categories,
//            min_evidence_coverage, geographic_requirements, temporal_requirements, stopping_criteria })
function makeResearchPlan(input) {
  const req = input.request;
  if (!req || !req.request_id) throw new Error('[ASTRA-11D] makeResearchPlan: a valid request is required');
  const errors = [];

  const questions = (input.questions || req.research_questions || []).map(String);
  const evidence_needed = (input.evidence_needed || []).map(e => ({
    for_objective: String(e.for_objective),
    fact_types: (e.fact_types || []).map(String),
    min_facts: Number.isFinite(e.min_facts) ? e.min_facts : 3,
    min_distinct_sources: Number.isFinite(e.min_distinct_sources) ? e.min_distinct_sources : 2,
  }));
  const preferred = (input.preferred_source_categories || []).map(String);
  for (const c of preferred) if (!SOURCE_CATEGORIES.includes(c)) errors.push(`preferred source category "${c}" is not an ASTRA-11C category`);
  for (const e of evidence_needed) if (e.for_objective !== 'UNKNOWN' && !RESEARCH_OBJECTIVES.includes(e.for_objective)) errors.push(`evidence_needed for unknown objective "${e.for_objective}"`);

  // The plan may only pursue objectives the request authorized.
  const reqObjSet = new Set(req.objectives);
  for (const e of evidence_needed) if (!reqObjSet.has(e.for_objective) && e.for_objective !== 'UNKNOWN') errors.push(`plan pursues objective "${e.for_objective}" not in the request`);

  const plan = {
    schema_version: 'ucdm-research-1.0.0',
    request_id: req.request_id,
    objectives: [...req.objectives],
    scope: (input.scope || (req.research_scope && req.research_scope.scope) || 'SAMPLE'),
    questions,
    evidence_needed: evidence_needed.length ? evidence_needed : req.objectives.map(o => ({ for_objective: o, fact_types: [], min_facts: 3, min_distinct_sources: 2 })),
    preferred_source_categories: preferred,
    min_evidence_coverage: Number.isFinite(input.min_evidence_coverage) ? input.min_evidence_coverage : 0.6,
    geographic_requirements: input.geographic_requirements != null ? input.geographic_requirements : (req.geography !== 'UNKNOWN' ? { geography: req.geography } : null),
    temporal_requirements: input.temporal_requirements != null ? input.temporal_requirements : (req.time_window || null),
    stopping_criteria: input.stopping_criteria != null ? input.stopping_criteria : { max_sources: 50, coverage_target: 0.8, max_conflicts_unresolved: 999 },
  };
  if (!SCOPE_LEVELS.includes(plan.scope)) errors.push(`invalid scope "${plan.scope}"`);
  if (SCOPE_RANK[plan.scope] > SCOPE_RANK[(req.research_scope && req.research_scope.scope) || 'SAMPLE']) {
    errors.push(`plan scope "${plan.scope}" exceeds the request scope "${(req.research_scope && req.research_scope.scope) || 'SAMPLE'}"`);
  }
  if (errors.length) throw new Error(`[ASTRA-11D] invalid ResearchPlan: ${errors.join(' | ')}`);
  plan.plan_id = 'mrp_' + sha256Hex(canonicalize({ ...plan, plan_id: undefined }));
  return deepFreeze(plan);
}

// Deterministic scope gate for an EXPERIMENTAL LLM-authored plan (benchmark harness only).
// Returns { authorized, violations[] }. Fails closed: any drift from the request => not authorized.
function enforceAuthorizedScope(candidatePlan, request) {
  const violations = [];
  if (candidatePlan.request_id !== request.request_id) violations.push('plan.request_id does not match the request');
  const reqObj = new Set(request.objectives);
  for (const o of candidatePlan.objectives || []) if (o !== 'UNKNOWN' && !reqObj.has(o)) violations.push(`plan added unauthorized objective "${o}"`);
  for (const o of request.objectives) if (!(candidatePlan.objectives || []).includes(o)) violations.push(`plan dropped required objective "${o}"`);
  const reqScope = (request.research_scope && request.research_scope.scope) || 'SAMPLE';
  if (SCOPE_RANK[candidatePlan.scope] > SCOPE_RANK[reqScope]) violations.push(`plan widened scope ${reqScope} -> ${candidatePlan.scope}`);
  for (const e of candidatePlan.evidence_needed || []) {
    if (e.for_objective !== 'UNKNOWN' && !reqObj.has(e.for_objective)) violations.push(`evidence_needed targets unauthorized objective "${e.for_objective}"`);
    if (Number(e.min_facts) < 1 || Number(e.min_distinct_sources) < 1) violations.push(`evidence_needed for "${e.for_objective}" sets a sub-minimum threshold`);
  }
  for (const c of candidatePlan.preferred_source_categories || []) if (!SOURCE_CATEGORIES.includes(c)) violations.push(`non-canonical source category "${c}"`);
  return { authorized: violations.length === 0, violations };
}

module.exports = { SCOPE_LEVELS, SCOPE_RANK, makeResearchPlan, enforceAuthorizedScope };
