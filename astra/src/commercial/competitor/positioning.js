'use strict';
// [ASTRA-11E §D] CompetitorPositioning. Observed elements are facts (evidence-backed);
// the synthesized positioning_statement is ANALYTICAL and NEVER stamped observed.
// No LLM, no web, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const { assess } = require('../validation/confidence');

const PRICE_POSITION = Object.freeze(['PREMIUM', 'MID', 'ECONOMY', 'UNKNOWN']);

function el(value, evidence_refs) { return value == null ? { status: 'UNKNOWN' } : { value, evidence_refs: [...new Set(evidence_refs || [])].sort(), source_class: 'OBSERVED' }; }

// buildPositioning({ profile, attributes, pricingObs, sampleMedianByCurrency })
function buildPositioning({ profile, attributes = [], pricingObs = [], sampleMedianByCurrency = {} }) {
  const attr = (name) => attributes.find(a => a.attribute === name && a.kind === 'OBSERVED');
  const promiseA = attr('promise'), mechA = attr('mechanism'), diffA = attr('differentiator'), idA = attr('identity_language'), proofA = attr('proof');

  // deterministic price_position: this competitor's median price vs the sample median (per currency)
  const prices = pricingObs.filter(p => p.subject_ref === profile.competitor_ref);
  let price_position = 'UNKNOWN', priceEv = [];
  if (prices.length) {
    const cur = prices[0].currency;
    const mine = median(prices.map(p => p.amount).sort((a, b) => a - b));
    const sample = sampleMedianByCurrency[cur];
    priceEv = [...new Set(prices.flatMap(p => p.evidence_refs))].sort();
    if (sample != null && mine != null) {
      const r = mine / sample;
      price_position = r >= 1.25 ? 'PREMIUM' : r <= 0.8 ? 'ECONOMY' : 'MID';
    }
  }

  const observed_elements = {
    target_customer: el(profile.audience !== 'UNKNOWN' ? profile.audience : null, profile.evidence_refs),
    category_frame: el(profile.category !== 'UNKNOWN' ? profile.category : null, profile.evidence_refs),
    primary_promise: el(promiseA && promiseA.value, promiseA && promiseA.evidence_refs),
    value_proposition: el(promiseA && promiseA.value, promiseA && promiseA.evidence_refs),
    mechanism: el(mechA && mechA.value, mechA && mechA.evidence_refs),
    differentiation_claim: el(diffA && diffA.value, diffA && diffA.evidence_refs),
    identity: el(idA && idA.value, idA && idA.evidence_refs),
    proof_basis: el(proofA && proofA.value, proofA && proofA.evidence_refs),
    price_position: price_position === 'UNKNOWN' ? { status: 'UNKNOWN' } : { value: price_position, evidence_refs: priceEv, source_class: 'COMPUTED', produced_by: 'deterministic:ucdm/competitor' },
  };

  const knownEls = Object.entries(observed_elements).filter(([, v]) => !v.status).map(([k, v]) => `${k}=${JSON.stringify(v.value).slice(0, 60)}`);
  const confidence = assess({ evidence_count: profile.evidence_refs.length, distinct_sources: profile.source_refs.length, newest_evidence_age_days: 90, coverage: knownEls.length / 9, agree_count: 1, conflict_count: 0, data_quality: 0.6 });

  const body = {
    schema_version: 'ucdm-competitor-1.0.0',
    competitor_ref: profile.competitor_ref,
    observed_elements,
    // ANALYTICAL synthesis — deterministic template, clearly NOT an observed fact
    positioning_statement: {
      value: knownEls.length ? `For ${valOr(observed_elements.target_customer, 'an unspecified customer')}, ${profile.name} frames itself as ${valOr(observed_elements.category_frame, 'in-category')} promising ${valTextOr(observed_elements.primary_promise, 'an unstated outcome')}${observed_elements.price_position.value ? ` at a ${observed_elements.price_position.value} price position` : ''}.` : 'Insufficient observed positioning elements to synthesize a statement.',
      source_class: 'INFERRED',
      analytical: true,
      observed: false,
      derived_from_evidence_refs: profile.evidence_refs,
      produced_by: 'deterministic:ucdm/competitor',
    },
    evidence_refs: profile.evidence_refs,
    confidence,
  };
  body.positioning_id = 'cmpos_' + sha256Hex(canonicalize({ ...body, positioning_id: undefined, confidence: confidence.content_hash }));
  return deepFreeze(body);
}

function validatePositioning(p) {
  const errors = [];
  if (p.positioning_statement.observed !== false || p.positioning_statement.analytical !== true) errors.push('positioning_statement must be analytical and not observed');
  if (p.positioning_statement.source_class === 'OBSERVED') errors.push('synthesis must never be stamped OBSERVED');
  for (const [k, v] of Object.entries(p.observed_elements)) if (!v.status && v.source_class === 'INFERRED') errors.push(`observed_element ${k} wrongly marked INFERRED`);
  return { valid: errors.length === 0, errors };
}

function median(a) { const n = a.length; if (!n) return null; return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2; }
function valOr(el, d) { return el.status ? d : (typeof el.value === 'object' ? JSON.stringify(el.value) : String(el.value)); }
function valTextOr(el, d) { return el.status ? d : (el.value && el.value.text ? el.value.text : (typeof el.value === 'string' ? el.value : d)); }

module.exports = { PRICE_POSITION, buildPositioning, validatePositioning };
