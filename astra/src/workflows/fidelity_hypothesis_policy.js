'use strict';

// Campaign360 hypothesis-mode fidelity policy.
// Canonical user facts remain hard constraints. Ambiguous/generated marketing claims
// do not terminate the report; they are surfaced explicitly as hypotheses to validate.
const HARD_TYPES = new Set([
  'BUYER_ROLE_INVERSION',
  'KNOWN_FACT_DENIAL',
  'DEMO_DURATION_SUBSTITUTION',
]);

function isHardViolation(v) {
  if (!v) return false;
  const type = String(v.type || '');
  if (HARD_TYPES.has(type)) return true;
  if (/_SUBSTITUTION$/.test(type)) return true;
  return false;
}

function asHypothesis(v, node) {
  return {
    status: 'HYPOTHESIS_TO_VALIDATE',
    node: node == null ? (v && v.node) || null : node,
    type: v && v.type || 'FIDELITY_ADVISORY',
    category: v && v.category || null,
    field_key: v && v.field_key || null,
    path: v && v.path || null,
    local_clause: v && v.local_clause || null,
    matched_text: v && v.matched_text || null,
    reason: 'Generated content is not treated as a verified business fact; validate before operational use.',
  };
}

function classify(violations, node) {
  const hard = [];
  const hypotheses = [];
  for (const v of Array.isArray(violations) ? violations : []) {
    if (isHardViolation(v)) hard.push(v);
    else hypotheses.push(asHypothesis(v, node));
  }
  return { hard, hypotheses };
}

module.exports = { HARD_TYPES, isHardViolation, asHypothesis, classify };
