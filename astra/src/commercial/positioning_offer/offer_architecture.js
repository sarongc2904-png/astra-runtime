'use strict';
// [ASTRA-11I §H] Canonical OfferArchitecture. Assembled from business-supplied offer
// (USER_PROVIDED) + evidenced analytical linkages. Bonuses, guarantees, scarcity and urgency
// are ONLY present when supplied — never manufactured. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const { makeOfferComponent } = require('./offer_component');

// buildOfferArchitecture({ businessInput, mechanism, pricing, urgencyScarcity, proofStrategy, benefitMap, jtbdBySeg })
function buildOfferArchitecture(x) {
  const { businessInput = {}, mechanism = null, pricing = null, urgencyScarcity = null, proofStrategy = null } = x;
  const so = businessInput.supplied_offer || {};
  const components = [];
  const add = (spec) => { const c = makeOfferComponent(spec); components.push(c); };

  if (so.core) add({ component_type: 'CORE_OFFER', label: String(so.core), status: 'USER_PROVIDED', source_class: 'USER_PROVIDED', value_rationale: 'business-supplied core offer' });
  for (const d of (so.deliverables || [])) add({ component_type: 'DELIVERABLE', label: String(d), status: 'USER_PROVIDED', source_class: 'USER_PROVIDED' });
  for (const f of (so.features || [])) add({ component_type: 'FEATURE', label: String(f), status: 'USER_PROVIDED', source_class: 'USER_PROVIDED' });
  for (const c of (businessInput.capabilities || [])) add({ component_type: 'CAPABILITY', label: String(c.capability), status: 'USER_PROVIDED', source_class: 'USER_PROVIDED', evidence_refs: c.evidence_refs || [] });
  if (so.onboarding) add({ component_type: 'ONBOARDING', label: String(so.onboarding), status: 'USER_PROVIDED', source_class: 'USER_PROVIDED' });
  if (so.support) add({ component_type: 'SUPPORT', label: String(so.support), status: 'USER_PROVIDED', source_class: 'USER_PROVIDED' });
  for (const b of (so.bonuses || [])) add({ component_type: 'BONUS', label: String(b), status: 'USER_PROVIDED', source_class: 'USER_PROVIDED' });
  for (const g of (so.guarantees || [])) add({ component_type: 'GUARANTEE', label: String(g), status: 'USER_PROVIDED', source_class: 'USER_PROVIDED' });
  for (const e of (so.eligibility || [])) add({ component_type: 'ELIGIBILITY', label: String(e), status: 'USER_PROVIDED', source_class: 'USER_PROVIDED' });
  for (const d of (so.disqualifiers || [])) add({ component_type: 'DISQUALIFIER', label: String(d), status: 'USER_PROVIDED', source_class: 'USER_PROVIDED' });
  for (const c of (businessInput.constraints || [])) add({ component_type: 'CONSTRAINT', label: String(c.type), detail: c.detail || null, status: 'USER_PROVIDED', source_class: 'USER_PROVIDED' });
  if (mechanism && mechanism.status !== 'UNKNOWN') add({ component_type: 'MECHANISM', label: mechanism.statement || 'mechanism', status: mechanism.status === 'SUPPLIED_OBSERVED' ? 'USER_PROVIDED' : 'ANALYTICAL', source_class: mechanism.status === 'SUPPLIED_OBSERVED' ? 'USER_PROVIDED' : 'COMPUTED', evidence_refs: mechanism.evidence_refs });
  if (pricing && pricing.own_supplied_price.status !== 'UNKNOWN') add({ component_type: 'PRICING', label: `${pricing.own_supplied_price.amount} ${pricing.own_supplied_price.currency || ''}`.trim(), status: 'USER_PROVIDED', source_class: 'USER_PROVIDED' });
  if (pricing && pricing.payment_structure.status !== 'UNKNOWN') add({ component_type: 'PAYMENT_TERM', label: pricing.payment_structure.terms, status: 'USER_PROVIDED', source_class: 'USER_PROVIDED' });
  if (pricing && pricing.financing.status !== 'UNKNOWN') add({ component_type: 'FINANCING', label: pricing.financing.detail, status: 'USER_PROVIDED', source_class: 'USER_PROVIDED' });
  for (const e of ((urgencyScarcity && urgencyScarcity.elements) || [])) {
    if (['REAL_OPERATIONAL', 'REAL_CAPACITY', 'REAL_DEADLINE', 'USER_PROVIDED'].includes(e.basis) && e.detail) {
      add({ component_type: e.kind, label: e.detail, status: 'USER_PROVIDED', source_class: 'USER_PROVIDED' });
    }
  }
  for (const p of ((proofStrategy && proofStrategy.available) || [])) add({ component_type: 'PROOF', label: p.proof_type, status: 'USER_PROVIDED', source_class: 'USER_PROVIDED', evidence_refs: p.evidence_refs });

  const present = new Set(components.map(c => c.component_type));
  const body = {
    schema_version: 'ucdm-positioning-offer-1.0.0', kind: 'OfferArchitecture',
    components,
    component_types_present: [...present].sort(),
    has_core_offer: present.has('CORE_OFFER'),
    manufactured_elements: [], // always empty — supplied-only types are gated in offer_component.js
    unknowns: ['CORE_OFFER', 'PRICING', 'MECHANISM', 'PROOF', 'GUARANTEE', 'ONBOARDING'].filter(t => !present.has(t)),
    evidence_refs: [...new Set(components.flatMap(c => c.evidence_refs))].sort(),
    generated_by: 'deterministic:ucdm/positioning_offer',
  };
  body.architecture_id = 'oa_' + sha256Hex(canonicalize({ ...body, architecture_id: undefined }));
  return deepFreeze(body);
}

function validateOfferArchitecture(a) {
  const errors = [];
  if (a.manufactured_elements.length > 0) errors.push('the offer architecture must contain no manufactured elements');
  for (const c of a.components) {
    if (['BONUS', 'GUARANTEE', 'URGENCY', 'SCARCITY', 'FINANCING', 'PAYMENT_TERM'].includes(c.component_type) && c.status !== 'USER_PROVIDED') errors.push(`${c.component_type} present without USER_PROVIDED status`);
  }
  return { valid: errors.length === 0, errors };
}

module.exports = { buildOfferArchitecture, validateOfferArchitecture };
