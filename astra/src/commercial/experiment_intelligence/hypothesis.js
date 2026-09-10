'use strict';
// [ASTRA-11K §2] Hypothesis contract — IF (variable changed) / FOR (population) / THEN
// (observable result) / BECAUSE (hypothesised mechanism). BECAUSE is NEVER presented as
// proven causality. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const EXPECTED_DIRECTION = Object.freeze(['INCREASE', 'DECREASE', 'CHANGE', 'UNKNOWN']);
const HYPOTHESIS_STATUS = Object.freeze(['DRAFT', 'WELL_FORMED', 'MALFORMED']);

function makeHypothesis(x) {
  const iv = x.independent_variable ? String(x.independent_variable) : null;
  const pop = x.target_population ? String(x.target_population) : null;
  const pm = x.primary_metric ? String(x.primary_metric) : null;
  const dir = EXPECTED_DIRECTION.includes(String(x.expected_direction).toUpperCase()) ? String(x.expected_direction).toUpperCase() : 'UNKNOWN';
  const mech = x.mechanism_hypothesis ? String(x.mechanism_hypothesis) : null;

  const missing = [];
  if (!iv) missing.push('independent_variable');
  if (!pop) missing.push('target_population');
  if (!pm) missing.push('primary_metric');
  if (dir === 'UNKNOWN') missing.push('expected_direction');
  if (!mech) missing.push('mechanism_hypothesis');

  const body = {
    schema_version: 'ucdm-experiment-1.0.0', kind: 'Hypothesis',
    opportunity_id: x.opportunity_id == null ? null : String(x.opportunity_id),
    if_change: iv,
    for_population: pop,
    then_expect: { metric: pm, direction: dir, observable_result: x.observable_result ? String(x.observable_result) : (pm && dir !== 'UNKNOWN' ? `${dir.toLowerCase()} in ${pm}` : null) },
    because_mechanism: mech,
    mechanism_is_proven_causality: false,
    independent_variable: iv,
    target_population: pop,
    expected_direction: dir,
    primary_metric: pm,
    mechanism_hypothesis: mech,
    evidence_basis: [...new Set((x.evidence_basis || x.evidence_refs || []).map(String))].sort(),
    missing_fields: missing.sort(),
    status: missing.length === 0 ? 'WELL_FORMED' : 'MALFORMED',
    generated_by: 'deterministic:ucdm/experiment',
  };
  body.hypothesis_id = 'exhy_' + sha256Hex(canonicalize({ ...body, hypothesis_id: undefined }));
  return deepFreeze(body);
}

const CAUSAL_LANGUAGE_RE = /\b(proves|proven|causes|caused by|will definitely|guarantee[sd]?|because it always|is the reason)\b/i;

function validateHypothesis(h) {
  const errors = [];
  if (!HYPOTHESIS_STATUS.includes(h.status)) errors.push(`bad hypothesis status "${h.status}"`);
  if (h.mechanism_is_proven_causality !== false) errors.push('a hypothesis mechanism is never proven causality');
  if (h.because_mechanism && CAUSAL_LANGUAGE_RE.test(h.because_mechanism)) errors.push('the BECAUSE mechanism must not assert proven causality');
  if (h.status === 'WELL_FORMED' && h.missing_fields.length > 0) errors.push('a WELL_FORMED hypothesis has no missing fields');
  return { valid: errors.length === 0, errors };
}

module.exports = { EXPECTED_DIRECTION, HYPOTHESIS_STATUS, makeHypothesis, validateHypothesis };
