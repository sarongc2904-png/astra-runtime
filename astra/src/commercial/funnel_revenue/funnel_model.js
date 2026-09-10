'use strict';
// [ASTRA-11J §A] Canonical CommercialFunnel. Configurable stages — there is NO single
// universal funnel. No stage is mandatory except those explicitly declared in scope.
// Pure data + validators. No LLM, no I/O, no clock.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const FUNNEL_REVENUE_SCHEMA_VERSION = 'ucdm-funnel-revenue-1.0.0';

const STAGE_TYPES = Object.freeze([
  'IMPRESSION', 'REACH', 'CLICK', 'VISIT', 'PRODUCT_VIEW', 'ADD_TO_CART', 'LEAD', 'CONVERSATION',
  'CONTACTED', 'QUALIFIED', 'OPPORTUNITY', 'BOOKED', 'ATTENDED', 'PROPOSAL', 'CHECKOUT', 'PURCHASE',
  'SOLD', 'PAYMENT', 'ACTIVATED', 'RETAINED', 'RENEWED', 'REPEAT_PURCHASE', 'UPSELL', 'CROSS_SELL',
  'REFERRAL', 'CHURN', 'WON', 'LOST', 'WEBINAR', 'OFFER', 'CUSTOM', 'UNKNOWN',
]);

const FUNNEL_KINDS = Object.freeze(['B2C', 'B2B', 'LOCAL_SERVICE', 'BOOKING', 'ECOMMERCE', 'WEBINAR', 'SUBSCRIPTION', 'CUSTOM']);

// A canonical conventional ordering — used ONLY to describe a transition as forward/backward,
// never to require a stage or to fabricate one.
const CONVENTIONAL_ORDER = Object.freeze(Object.fromEntries(STAGE_TYPES.map((s, i) => [s, i])));

function makeFunnel(x) {
  const stages = (x.stages || []).map((s, i) => {
    const stage = typeof s === 'string' ? s : s.stage;
    const known = STAGE_TYPES.includes(String(stage));
    return {
      stage: known ? String(stage) : 'CUSTOM',
      label: typeof s === 'object' && s.label ? String(s.label) : String(stage),
      in_scope: typeof s === 'object' && 'in_scope' in s ? !!s.in_scope : true,
      position: i,
      // an unrecognised stage keeps its original name as custom_key so observations still key to it
      custom_key: typeof s === 'object' && s.custom_key ? String(s.custom_key) : (known ? null : String(stage)),
    };
  });
  const body = {
    schema_version: FUNNEL_REVENUE_SCHEMA_VERSION, kind: 'CommercialFunnel',
    funnel_kind: FUNNEL_KINDS.includes(x.funnel_kind) ? x.funnel_kind : 'CUSTOM',
    label: String(x.label || x.funnel_kind || 'funnel'),
    stages,
    in_scope_stages: stages.filter(s => s.in_scope).map(s => s.custom_key || s.stage),
    generated_by: 'deterministic:ucdm/funnel_revenue',
  };
  body.funnel_id = 'fn_' + sha256Hex(canonicalize({ ...body, funnel_id: undefined }));
  return deepFreeze(body);
}

// stageKey — a stable per-stage identity (custom_key disambiguates repeated CUSTOM stages)
function stageKey(s) { return s.custom_key || s.stage; }

function relation(funnel, fromKey, toKey) {
  const byKey = Object.fromEntries(funnel.stages.map(s => [stageKey(s), s]));
  const a = byKey[fromKey], b = byKey[toKey];
  if (!a || !b) return 'UNKNOWN';
  if (a.position === b.position) return 'SAME';
  return b.position > a.position ? 'FORWARD' : 'BACKWARD';
}

function validateFunnel(f) {
  const errors = [];
  if (!FUNNEL_KINDS.includes(f.funnel_kind)) errors.push(`bad funnel_kind "${f.funnel_kind}"`);
  if (!Array.isArray(f.stages) || f.stages.length < 2) errors.push('a funnel needs at least 2 stages');
  for (const s of f.stages) if (!STAGE_TYPES.includes(s.stage)) errors.push(`uncontrolled stage "${s.stage}"`);
  if (f.in_scope_stages.length === 0) errors.push('a funnel needs at least one in-scope stage');
  const keys = f.stages.map(stageKey);
  if (new Set(keys).size !== keys.length) errors.push('stage keys must be unique (use custom_key for repeated CUSTOM stages)');
  return { valid: errors.length === 0, errors };
}

module.exports = {
  FUNNEL_REVENUE_SCHEMA_VERSION, STAGE_TYPES, FUNNEL_KINDS, CONVENTIONAL_ORDER,
  makeFunnel, stageKey, relation, validateFunnel,
};
