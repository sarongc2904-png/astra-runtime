'use strict';
// [ASTRA-11E §B] Evidence-backed competitor attributes. Every OBSERVED attribute carries
// evidence_refs. INFERRED material is explicitly kind:'ANALYTICAL'. No LLM, no web, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const { assess } = require('../validation/confidence');

const ATTRIBUTES = Object.freeze([
  'audience', 'category', 'promise', 'value_proposition', 'mechanism', 'differentiator',
  'price', 'pricing_model', 'offer', 'guarantee', 'financing', 'trial', 'bonus', 'delivery_time',
  'proof', 'testimonial', 'rating', 'review_count', 'cta', 'channel', 'funnel_step',
  'headline', 'message', 'pain', 'desired_outcome', 'objection_addressed', 'identity_language',
  'creative_angle', 'creative_format',
]);
const KIND = Object.freeze(['OBSERVED', 'ANALYTICAL']);

// map ASTRA-11D fact_type / message_field / offer_component -> attribute name
const FACT_TYPE_ATTR = { COMPETITOR_PRICE: 'price', ADVERTISED_PROMISE: 'promise', PUBLISHED_CLAIM: 'promise', OBSERVED_GUARANTEE: 'guarantee', OBSERVED_CTA: 'cta', RATING: 'rating', REVIEW_COUNT: 'review_count', PRODUCT_CATEGORY: 'category', LOCATION_SERVED: 'channel', OFFER_COMPONENT: 'offer' };
const MSG_FIELD_ATTR = { headline: 'headline', promise: 'promise', pain: 'pain', desired_outcome: 'desired_outcome', mechanism: 'mechanism', proof: 'proof', cta: 'cta', objection_addressed: 'objection_addressed', identity_language: 'identity_language' };
const OFFER_COMP_ATTR = { core_product_service: 'offer', guarantee: 'guarantee', financing: 'financing', trial: 'trial', bonus: 'bonus', delivery_time: 'delivery_time' };

function mk(attribute, value, opts) {
  const b = {
    schema_version: 'ucdm-competitor-1.0.0',
    attribute, value,
    kind: opts.kind || 'OBSERVED',
    evidence_refs: [...new Set(opts.evidence_refs || [])].sort(),
    source_refs: [...new Set(opts.source_refs || [])].sort(),
    observed_at: opts.observed_at || null,
    verbatim_hash: opts.verbatim_hash || null,
    confidence: opts.confidence || null,
    note: opts.note || null,
  };
  b.attribute_id = 'cma_' + sha256Hex(canonicalize({ ...b, attribute_id: undefined, confidence: b.confidence && b.confidence.content_hash }));
  return deepFreeze(b);
}

// extractAttributes({ profile, facts, messageObs, offerItems }) -> [CompetitorAttribute]
function extractAttributes({ profile, facts = [], messageObs = [], offerItems = [] }) {
  const ref = profile.competitor_ref;
  const out = [];
  const conf = () => assess({ evidence_count: 1, distinct_sources: 1, newest_evidence_age_days: 90, coverage: 1, agree_count: 1, conflict_count: 0, data_quality: 0.6 });

  for (const f of facts.filter(f => f.subject_ref === ref)) {
    const attr = FACT_TYPE_ATTR[f.fact_type];
    if (!attr) continue;
    out.push(mk(attr, f.value, { evidence_refs: f.evidence_refs, source_refs: [f.source_ref], observed_at: f.observed_at, confidence: f.confidence, note: `from MarketFact ${f.fact_type}` }));
  }
  for (const m of messageObs.filter(m => m.subject_ref === ref)) {
    const attr = MSG_FIELD_ATTR[m.message_field];
    if (!attr) continue;
    out.push(mk(attr, { text: m.verbatim_text }, { evidence_refs: m.evidence_refs, source_refs: [m.source_ref], verbatim_hash: m.verbatim_hash, confidence: conf(), note: `from message_field ${m.message_field}` }));
  }
  for (const it of offerItems.filter(o => o.subject_ref === ref)) {
    const attr = OFFER_COMP_ATTR[it.component] || 'offer';
    out.push(mk(attr, { component: it.component, detail: it.detail_text }, { evidence_refs: it.evidence_refs, source_refs: [it.source_ref], confidence: conf(), note: `from offer_component ${it.component}` }));
  }

  // A single ANALYTICAL attribute example: pricing_model inferred from observed price kinds.
  const priceAttrs = out.filter(a => a.attribute === 'price');
  if (priceAttrs.length) {
    out.push(mk('pricing_model', { inferred: 'has observed prices' }, { kind: 'ANALYTICAL', evidence_refs: priceAttrs.flatMap(a => a.evidence_refs), source_refs: priceAttrs.flatMap(a => a.source_refs), confidence: conf(), note: 'ANALYTICAL — inferred from observed price attributes, not directly observed' }));
  }
  return out;
}

function validateAttribute(a) {
  const errors = [];
  if (!ATTRIBUTES.includes(a.attribute)) errors.push(`unknown attribute "${a.attribute}"`);
  if (!KIND.includes(a.kind)) errors.push(`bad kind "${a.kind}"`);
  if (a.kind === 'OBSERVED' && a.evidence_refs.length === 0) errors.push(`OBSERVED attribute "${a.attribute}" has no evidence_refs`);
  return { valid: errors.length === 0, errors };
}

module.exports = { ATTRIBUTES, KIND, extractAttributes, validateAttribute, FACT_TYPE_ATTR };
