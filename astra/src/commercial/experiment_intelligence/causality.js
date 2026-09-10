'use strict';
// [ASTRA-11K §14] Causal claim policy. Causality is NEVER inferred from correlation, simple
// before/after, simultaneous multi-variable changes, different cohorts, incompatible periods,
// attribution reports, or incomplete data. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const CAUSAL_POLICY = Object.freeze(['CAUSAL_CLAIM_PERMITTED', 'CAUSAL_CLAIM_NOT_PERMITTED', 'CAUSAL_ATTRIBUTION_NOT_IDENTIFIABLE']);

// assessCausality({ design, variableMap, baseline, statistics, evaluation })
function assessCausality({ design = null, variableMap = null, baseline = null, statistics = null }) {
  const blockers = [];

  if (variableMap && variableMap.contamination_status === 'MULTI_VARIABLE_CONTAMINATION') blockers.push('MULTI_VARIABLE_CONTAMINATION');
  if (!design || !design.is_controlled) blockers.push('DESIGN_NOT_CONTROLLED');
  if (design && design.causal_blockers && design.causal_blockers.length) for (const b of design.causal_blockers) blockers.push(b);
  if (baseline && baseline.required && baseline.status !== 'BASELINE_VALID') blockers.push('BASELINE_' + baseline.status.replace(/^BASELINE_/, ''));
  if (statistics && statistics.status === 'STATISTICAL_CLAIM_NOT_PERMITTED') blockers.push('STATISTICAL_CLAIM_NOT_PERMITTED');

  let policy;
  if (blockers.includes('MULTI_VARIABLE_CONTAMINATION')) policy = 'CAUSAL_ATTRIBUTION_NOT_IDENTIFIABLE';
  else if (blockers.length === 0 && design && design.conclusion_permitted.causal_evaluation) policy = 'CAUSAL_CLAIM_PERMITTED';
  else policy = 'CAUSAL_CLAIM_NOT_PERMITTED';

  const body = {
    schema_version: 'ucdm-experiment-1.0.0', kind: 'CausalPolicy',
    policy,
    blockers: [...new Set(blockers)].sort(),
    inferred_from_correlation: false,
    inferred_from_before_after: false,
    inferred_from_attribution_report: false,
    note: policy === 'CAUSAL_CLAIM_PERMITTED'
      ? 'a controlled design with an isolated variable, valid baseline and permitted inferential basis — a causal claim MAY be made if the evaluation supports it'
      : policy === 'CAUSAL_ATTRIBUTION_NOT_IDENTIFIABLE'
        ? 'two or more variables changed without isolation — which one caused the effect cannot be identified'
        : 'a causal claim is not permitted for this experiment',
    generated_by: 'deterministic:ucdm/experiment',
  };
  body.causal_policy_id = 'excp_' + sha256Hex(canonicalize({ ...body, causal_policy_id: undefined }));
  return deepFreeze(body);
}

function validateCausality(c) {
  const errors = [];
  if (!CAUSAL_POLICY.includes(c.policy)) errors.push(`bad causal policy "${c.policy}"`);
  if (c.policy === 'CAUSAL_CLAIM_PERMITTED' && c.blockers.length > 0) errors.push('CAUSAL_CLAIM_PERMITTED cannot carry blockers');
  if (c.blockers.includes('MULTI_VARIABLE_CONTAMINATION') && c.policy !== 'CAUSAL_ATTRIBUTION_NOT_IDENTIFIABLE') errors.push('contamination must yield CAUSAL_ATTRIBUTION_NOT_IDENTIFIABLE');
  if (c.inferred_from_correlation !== false || c.inferred_from_before_after !== false || c.inferred_from_attribution_report !== false) errors.push('causality must never be inferred from correlation / before-after / attribution');
  return { valid: errors.length === 0, errors };
}

module.exports = { CAUSAL_POLICY, assessCausality, validateCausality };
