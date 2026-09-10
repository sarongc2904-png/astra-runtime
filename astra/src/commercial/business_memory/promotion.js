'use strict';
// [ASTRA-11L §11] Learning promotion policy. A RESULT becomes a LEARNING ONLY when every
// strict condition is met. A HYPOTHESIS never auto-promotes. An INCONCLUSIVE /
// INSUFFICIENT_EVIDENCE / INVALIDATED result never becomes a positive learning.
// The learning preserves causal_status / statistical_status / limitations. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const { isForbiddenAutoTransition } = require('./types');

const PROMOTION_STATUS = Object.freeze(['LEARNING_PROMOTED', 'LEARNING_PROMOTION_NOT_PERMITTED']);

// evaluatePromotion({ candidate, evidenceBinding, source: { experiment_status, evaluation_status,
//   decision, guardrail_status, contamination_status, causal_status, statistical_status,
//   primary_movement }, scopeValidation })
function evaluatePromotion(x) {
  const c = x.candidate || {};
  const s = x.source || {};
  const blockers = [];

  // rule 0: type gate — the SOURCE that is being promoted must be a RESULT/EXPERIMENT, never
  //   a HYPOTHESIS / OBSERVATION / DIAGNOSIS / DECISION / PREFERENCE / PRIORITY.
  const fromType = String((s.source_memory_type || s.from_type || 'RESULT')).toUpperCase();
  if (!['RESULT', 'EXPERIMENT'].includes(fromType)) blockers.push('SOURCE_TYPE_NOT_PROMOTABLE');
  if (isForbiddenAutoTransition(fromType, 'LEARNING')) blockers.push('FORBIDDEN_AUTO_TRANSITION');

  // rule 1: evidence valid
  if (!x.evidenceBinding || x.evidenceBinding.evidence_status !== 'EVIDENCE_VALID') blockers.push('EVIDENCE_NOT_VALID');

  // rule 2: experiment / result valid
  if (s.experiment_status && ['INVALIDATED', 'INSUFFICIENT_DATA', 'DRAFT', 'RUNNING'].includes(String(s.experiment_status).toUpperCase())) blockers.push('EXPERIMENT_NOT_COMPLETE');
  if (s.evaluation_status && ['OUTCOME_INCOMPLETE', 'EVALUATION_NOT_PERMITTED', 'EVIDENCE_INSUFFICIENT'].includes(String(s.evaluation_status).toUpperCase())) blockers.push('EVALUATION_NOT_VALID');

  // rule 3: decision compatible (a REJECT/HOLD/ITERATE/RETEST is a learning about NOT doing
  //   the thing, but never a positive adoption learning) — ADOPT / a clean REJECT are OK
  const dec = s.decision ? String(s.decision).toUpperCase() : null;
  if (dec && ['INSUFFICIENT_EVIDENCE', 'INCONCLUSIVE'].includes(dec)) blockers.push('DECISION_INCONCLUSIVE');

  // rule 4: scope explicit
  if (x.scopeValidation && !x.scopeValidation.valid) blockers.push('SCOPE_NOT_EXPLICIT');

  // rule 5: no critical guardrail breach
  if (s.guardrail_status && String(s.guardrail_status).toUpperCase() === 'PRIMARY_METRIC_IMPROVED_GUARDRAIL_BREACH') blockers.push('GUARDRAIL_BREACH');

  // rule 6: no unresolved contamination
  if (s.contamination_status && String(s.contamination_status).toUpperCase() === 'MULTI_VARIABLE_CONTAMINATION') blockers.push('UNRESOLVED_CONTAMINATION');

  // rule 7: not inconclusive
  if (s.primary_movement && String(s.primary_movement).toUpperCase() === 'UNKNOWN') blockers.push('PRIMARY_MOVEMENT_UNKNOWN');

  const permitted = blockers.length === 0;
  const body = {
    schema_version: 'ucdm-business-memory-1.0.0', kind: 'LearningPromotion',
    candidate_id: c.candidate_id || null,
    status: permitted ? 'LEARNING_PROMOTED' : 'LEARNING_PROMOTION_NOT_PERMITTED',
    blockers: [...new Set(blockers)].sort(),
    learning_scope: permitted ? (c.scope || {}) : null,
    preserved_causal_status: c.causal_status || (s.causal_status || 'UNKNOWN'),
    preserved_statistical_status: c.statistical_status || (s.statistical_status || 'UNKNOWN'),
    preserved_limitations: [...new Set((x.limitations || []).map(String))].sort(),
    is_positive_learning: permitted && dec === 'ADOPT',
    note: permitted
      ? 'promotion permitted — the LEARNING retains its causal/statistical status, scope and limitations; it is not a universal fact'
      : `promotion blocked: ${[...new Set(blockers)].sort().join(', ')}`,
    generated_by: 'deterministic:ucdm/business_memory',
  };
  body.promotion_id = 'bmpr_' + sha256Hex(canonicalize({ ...body, promotion_id: undefined }));
  return deepFreeze(body);
}

function validatePromotion(p) {
  const errors = [];
  if (!PROMOTION_STATUS.includes(p.status)) errors.push(`bad promotion status "${p.status}"`);
  if (p.status === 'LEARNING_PROMOTED' && p.blockers.length > 0) errors.push('a promoted learning cannot carry blockers');
  if (p.status === 'LEARNING_PROMOTED' && !p.learning_scope) errors.push('a promoted learning needs an explicit scope');
  if (p.is_positive_learning && p.status !== 'LEARNING_PROMOTED') errors.push('a positive learning requires a permitted promotion');
  return { valid: errors.length === 0, errors };
}

module.exports = { PROMOTION_STATUS, evaluatePromotion, validatePromotion };
