'use strict';
// [ASTRA-11D] MarketClaim (spec section E). An analytical proposition backed by MarketFacts.
// Deterministic status + a hard scope gate: NO global claim from insufficient local evidence.
// The claim STATEMENT is templated deterministically here (no LLM in the core engine).
// No LLM, no web, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const { SCOPE_RANK } = require('./plan');

const CLAIM_STATUS = Object.freeze(['SUPPORTED', 'PARTIALLY_SUPPORTED', 'CONFLICTED', 'INSUFFICIENT']);

// Broader-than-SAMPLE claims need more independent corroboration.
const SCOPE_MIN_SOURCES = { SAMPLE: 2, LOCAL: 3, CATEGORY: 5, GLOBAL: 8 };

function templateStatement(agg, computedFact) {
  const subj = agg.subject_ref.replace(/^subject:/, '');
  if (agg.distribution.kind === 'CATEGORICAL' && computedFact) {
    const v = computedFact.value;
    return `${v.present_count} of ${v.sample_size} observed items for ${agg.fact_type} (${subj}) show "${v.pattern}".`;
  }
  if (agg.distribution.kind === 'NUMERIC') {
    const d = agg.distribution;
    return `Observed ${agg.fact_type} for ${subj} ranges ${d.min}-${d.max} (mean ${d.mean}) across ${d.n} data points.`;
  }
  return `${agg.fact_count} observation(s) recorded for ${agg.fact_type} (${subj}).`;
}

// formClaims({ aggregates, computedFacts, conflicts, plan }) -> claims[]
function formClaims({ aggregates, computedFacts = [], conflicts = [], plan }) {
  const conflictByKey = new Map();
  for (const c of conflicts) conflictByKey.set(`${c.fact_type}::${c.subject_ref}`, c);
  const computedByKey = new Map();
  for (const f of computedFacts) computedByKey.set(`${f.fact_type}::${f.subject_ref}`, f);

  const requestedScope = plan ? plan.scope : 'SAMPLE';
  const minCoverage = plan ? plan.min_evidence_coverage : 0.6;
  const claims = [];

  for (const agg of aggregates) {
    const key = `${agg.fact_type}::${agg.subject_ref}`;
    const conflict = conflictByKey.get(key) || null;
    const cf = computedByKey.get(key) || null;

    // per-objective thresholds from the plan, else defaults
    const need = (plan && plan.evidence_needed || []).find(e => (e.fact_types || []).includes(agg.fact_type)) || { min_facts: 3, min_distinct_sources: 2 };

    let scope = requestedScope;
    const warnings = [];
    // scope gate
    const minSrc = SCOPE_MIN_SOURCES[scope] || 2;
    let status;
    if (agg.fact_count < need.min_facts || agg.distinct_source_count < need.min_distinct_sources) {
      status = 'INSUFFICIENT';
    } else if (conflict) {
      status = 'CONFLICTED';
    } else if (agg.conflict_count > 0 && agg.conflict_count < agg.fact_count) {
      status = 'PARTIALLY_SUPPORTED';
    } else {
      status = 'SUPPORTED';
    }
    // NO global/category claim from thin evidence
    if (SCOPE_RANK[scope] > SCOPE_RANK.SAMPLE && (agg.distinct_source_count < minSrc || (agg.confidence.score < minCoverage))) {
      warnings.push(`insufficient corroboration for ${scope} scope (sources=${agg.distinct_source_count} < ${minSrc}) — downgraded to SAMPLE`);
      scope = 'SAMPLE';
      if (status === 'SUPPORTED') status = 'PARTIALLY_SUPPORTED';
    }

    const supporting = cf ? [cf.fact_id, ...agg.fact_ids] : [...agg.fact_ids];
    const contradicting = conflict ? conflict.fact_refs.filter(id => agg.fact_ids.includes(id)) : [];

    const claim = {
      schema_version: 'ucdm-research-1.0.0',
      fact_type: agg.fact_type,
      subject_ref: agg.subject_ref,
      statement: templateStatement(agg, cf),
      statement_source: 'deterministic:ucdm/research', // NOT LLM in the core engine
      supporting_fact_refs: [...new Set(supporting)].sort(),
      contradicting_fact_refs: [...new Set(contradicting)].sort(),
      conflict_refs: conflict ? [conflict.conflict_id] : [],
      coverage: {
        fact_count: agg.fact_count,
        distinct_sources: agg.distinct_source_count,
        required_facts: need.min_facts,
        required_sources: need.min_distinct_sources,
        met: agg.fact_count >= need.min_facts && agg.distinct_source_count >= need.min_distinct_sources,
      },
      confidence: agg.confidence,
      scope,
      requested_scope: requestedScope,
      warnings,
      status,
      aggregate_ref: agg.aggregate_id,
    };
    claim.claim_id = 'mcl_' + sha256Hex(canonicalize({ ...claim, claim_id: undefined, confidence: agg.confidence.content_hash }));
    claims.push(deepFreeze(claim));
  }
  return claims;
}

function validateClaim(c) {
  const errors = [];
  if (!CLAIM_STATUS.includes(c.status)) errors.push(`bad claim status "${c.status}"`);
  if (c.status !== 'INSUFFICIENT' && c.supporting_fact_refs.length === 0) errors.push('a non-INSUFFICIENT claim needs supporting facts');
  if (SCOPE_RANK[c.scope] > SCOPE_RANK[c.requested_scope]) errors.push('claim scope exceeds requested scope');
  if (c.statement_source !== 'deterministic:ucdm/research') errors.push('core-engine claim statement must be deterministic');
  return { valid: errors.length === 0, errors };
}

module.exports = { CLAIM_STATUS, SCOPE_MIN_SOURCES, formClaims, validateClaim };
