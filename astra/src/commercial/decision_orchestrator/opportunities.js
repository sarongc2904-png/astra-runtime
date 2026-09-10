'use strict';
// [ASTRA-11M §2] Opportunity normalization. Turns raw ASTRA-11J diagnostics and ASTRA-11K
// experiment opportunities into a single OpportunityNormalized shape. Scopes are NOT merged
// across incompatible boundaries. No fabricated impact / time / probability. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze, nfcLF } = require('../validation/canonical');
const C = require('./contracts');

function normStr(v) { return v == null ? null : String(v); }
function normScope(s) {
  if (!s || typeof s !== 'object') return {};
  const o = {};
  for (const k of Object.keys(s).sort()) if (s[k] != null && s[k] !== '') o[k] = typeof s[k] === 'string' ? nfcLF(s[k]) : s[k];
  return o;
}

function normalizeOpportunity(x) {
  x = x || {};
  const missing = [];
  if (!x.source_engine) missing.push('source_engine');
  if (!x.affected_metric && !x.affected_funnel_transition) missing.push('affected_metric|affected_funnel_transition');
  const evidence_refs = [...new Set((x.evidence_refs || []).map(String))].sort();
  if (evidence_refs.length === 0) missing.push('evidence_refs');

  const es = C.EVIDENCE_STRENGTH.includes(x.evidence_strength) ? x.evidence_strength
    : (evidence_refs.length === 0 ? 'EVIDENCE_NONE' : 'EVIDENCE_WEAK');

  const body = {
    schema_version: C.DECISION_SCHEMA_VERSION, kind: 'OpportunityNormalized',
    source_opportunity_id: normStr(x.opportunity_id || x.source_opportunity_id),
    source_engine: normStr(x.source_engine),
    source_report_id: normStr(x.source_report_id),
    affected_metric: normStr(x.affected_metric),
    affected_funnel_transition: normStr(x.affected_funnel_transition),
    scope: normScope(x.scope),
    evidence_refs,
    evidence_strength: es,
    impact_basis: x.impact_basis == null ? null : (typeof x.impact_basis === 'object' ? { ...x.impact_basis } : String(x.impact_basis)),
    time_to_signal: C.TIME_TO_SIGNAL.includes(x.time_to_signal) ? x.time_to_signal : 'UNKNOWN',
    risk: normStr(x.risk),
    reversibility: C.REVERSIBILITY.includes(x.reversibility) ? x.reversibility : 'UNKNOWN',
    dependencies: [...new Set((x.dependencies || []).map(String))].sort(),
    resource_requirements: x.resource_requirements == null ? null : (typeof x.resource_requirements === 'object' ? { ...x.resource_requirements } : String(x.resource_requirements)),
    hypothesis_only: x.hypothesis_only === true,
    experiment_ref: normStr(x.experiment_ref),
    missing_fields: missing.sort(),
    status: missing.length === 0 ? 'OPPORTUNITY_NORMALIZED' : 'OPPORTUNITY_MALFORMED',
    generated_by: 'deterministic:ucdm/decision_orchestrator/opportunities',
  };
  body.opportunity_id = 'dopp_' + sha256Hex(canonicalize({ ...body, opportunity_id: undefined })).slice(0, 44);
  return deepFreeze(body);
}

function validateOpportunity(o) {
  const errors = [];
  if (!C.OPPORTUNITY_STATUS.includes(o.status)) errors.push(`bad opportunity status "${o.status}"`);
  if (o.status === 'OPPORTUNITY_NORMALIZED' && o.evidence_refs.length === 0) errors.push('normalized opportunity without evidence');
  if (!C.EVIDENCE_STRENGTH.includes(o.evidence_strength)) errors.push('bad evidence_strength');
  return { valid: errors.length === 0, errors };
}

// scopes are compatible only if every shared key is equal (currency/cohort/period drift = incompatible)
function scopesCompatible(a, b) {
  const ka = Object.keys(a || {}), kb = Object.keys(b || {});
  const shared = ka.filter(k => kb.includes(k));
  if (shared.length === 0) return true;
  return shared.every(k => canonicalize(a[k]) === canonicalize(b[k]));
}

module.exports = { normalizeOpportunity, validateOpportunity, scopesCompatible };
