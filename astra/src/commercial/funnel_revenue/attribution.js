'use strict';
// [ASTRA-11J §I] Attribution discipline. ASTRA NEVER fabricates multi-touch attribution and
// NEVER infers causality from sequence alone. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const ATTRIBUTION_BASIS = Object.freeze(['SOURCE_REPORTED', 'FIRST_TOUCH', 'LAST_TOUCH', 'USER_PROVIDED', 'UNKNOWN']);

// resolveAttribution(businessInput) -> frozen AttributionContext
function resolveAttribution(businessInput = {}) {
  const raw = String(businessInput.attribution_basis || '').toUpperCase();
  const basis = ATTRIBUTION_BASIS.includes(raw) ? raw : 'UNKNOWN';
  const body = {
    schema_version: 'ucdm-funnel-revenue-1.0.0', kind: 'AttributionContext',
    basis,
    multi_touch_model: 'NOT_FABRICATED',
    causal: false,
    note: basis === 'UNKNOWN'
      ? 'no attribution basis supplied — channel-level revenue/ROAS is UNKNOWN'
      : `attribution basis is ${basis} — a reported/positional basis, NOT a causal model`,
    generated_by: 'deterministic:ucdm/funnel_revenue',
  };
  body.attribution_id = 'at_' + sha256Hex(canonicalize({ ...body, attribution_id: undefined }));
  return deepFreeze(body);
}

function validateAttribution(a) {
  const errors = [];
  if (!ATTRIBUTION_BASIS.includes(a.basis)) errors.push(`bad attribution basis "${a.basis}"`);
  if (a.multi_touch_model !== 'NOT_FABRICATED') errors.push('multi-touch attribution must never be fabricated');
  if (a.causal !== false) errors.push('attribution is never treated as causal');
  return { valid: errors.length === 0, errors };
}

module.exports = { ATTRIBUTION_BASIS, resolveAttribution, validateAttribution };
