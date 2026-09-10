'use strict';
// [ASTRA-11D remediation §3 §4 §5 §6] Offer / Message / Customer-signal / Demand landscapes.
// All OBSERVED extraction + deterministic frequencies. Exact source text stays traceable to
// ASTRA-11C verbatim (verbatim_hash + evidence_refs). No VoC clustering. No manufactured
// market size. No LLM, no web, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const { assess } = require('../validation/confidence');

const PRODUCER = 'deterministic:ucdm/research';

const OFFER_COMPONENTS = Object.freeze(['core_product_service', 'bonus', 'guarantee', 'discount', 'financing', 'trial', 'delivery_time', 'scarcity', 'urgency', 'bundle', 'support', 'implementation']);
const MESSAGE_FIELDS = Object.freeze(['headline', 'promise', 'pain', 'desired_outcome', 'mechanism', 'proof', 'cta', 'objection_addressed', 'identity_language']);
const SIGNAL_TYPES = Object.freeze(['pain', 'desire', 'fear', 'objection', 'complaint', 'purchase_barrier', 'alternative']);
const ASPECT_TO_SIGNAL = { PAIN: 'pain', DESIRE: 'desire', FEAR: 'fear', OBJECTION: 'objection', COMPLAINT: 'complaint', PURCHASE_BARRIER: 'purchase_barrier', ALTERNATIVE: 'alternative' };
const DEMAND_KINDS = Object.freeze(['review_volume', 'review_recency', 'search_evidence', 'business_count', 'transaction_evidence', 'lead_volume', 'public_engagement']);
const DEMAND_CLASS = Object.freeze(['DIRECT', 'PROXY', 'UNKNOWN']);
const DEMAND_KIND_CLASS = { review_volume: 'DIRECT', review_recency: 'DIRECT', transaction_evidence: 'DIRECT', lead_volume: 'DIRECT', search_evidence: 'PROXY', business_count: 'PROXY', public_engagement: 'PROXY' };

function subjKey(o) {
  const s = o.subject;
  if (!s || s.__ucdm_unknown) return 'subject:UNKNOWN';
  return s.state === 'RESOLVED' ? `subject:${s.subject_type}:${s.subject_id}` : `subject:${s.subject_type || '?'}:${s.label || 'UNRESOLVED'}`;
}
function isObserved(o) { const c = o.provenance && o.provenance.source_class; return c === 'OBSERVED' || c === 'USER_PROVIDED'; }

// ---------- OFFER LANDSCAPE (§3) ----------
function extractOfferComponents(observations) {
  const items = [];
  for (const o of observations) {
    if (!isObserved(o)) continue;
    const sv = o.structured_values || {};
    if (sv.offer_component == null || !OFFER_COMPONENTS.includes(sv.offer_component)) continue;
    const b = {
      component: sv.offer_component,
      detail_text: sv.offer_component_detail != null ? String(sv.offer_component_detail) : null,
      subject_ref: subjKey(o),
      source_ref: o.source_ref,
      evidence_refs: [...((o.provenance && o.provenance.evidence_refs) || [])],
      observation_hash: o.content_hash,
      status: 'OBSERVED',
    };
    b.offer_item_id = 'mofi_' + sha256Hex(canonicalize({ ...b, offer_item_id: undefined }));
    items.push(deepFreeze(b));
  }
  return items;
}
function computeComponentFrequencies(items, competitorCount) {
  const byComp = {};
  for (const it of items) {
    byComp[it.component] = byComp[it.component] || new Set();
    byComp[it.component].add(it.subject_ref);
  }
  const denom = competitorCount && competitorCount > 0 ? competitorCount : (new Set(items.map(i => i.subject_ref)).size || 1);
  const freqs = OFFER_COMPONENTS.filter(c => byComp[c]).map(c => deepFreeze({
    component: c, present_count: byComp[c].size, competitor_count: denom,
    fraction: Number((byComp[c].size / denom).toFixed(6)), status: 'COMPUTED', produced_by: PRODUCER,
  }));
  return deepFreeze({ schema_version: 'ucdm-research-1.0.0', competitor_count: denom, frequencies: freqs, generated_by: PRODUCER });
}

// ---------- MESSAGE LANDSCAPE (§4) ----------
function extractMessageObservations(observations) {
  const items = [];
  for (const o of observations) {
    if (!isObserved(o)) continue;
    const sv = o.structured_values || {};
    const field = sv.message_field;
    if (field == null || !MESSAGE_FIELDS.includes(field)) continue;
    const vb = o.verbatim || null;
    const b = {
      message_field: field,
      verbatim_text: vb ? vb.verbatim_text : (o.content && o.content.text) || null,      // EXACT source text
      normalized_text: vb ? vb.normalized_text : (o.content && o.content.normalized_text) || null,
      verbatim_hash: vb ? vb.verbatim_hash : null,                                        // traceable to ASTRA-11C
      subject_ref: subjKey(o),
      source_ref: o.source_ref,
      evidence_refs: [...((o.provenance && o.provenance.evidence_refs) || [])],
      observation_hash: o.content_hash,
      status: 'OBSERVED',
    };
    b.message_id = 'mmsg_' + sha256Hex(canonicalize({ ...b, message_id: undefined }));
    items.push(deepFreeze(b));
  }
  return items;
}
function computeMessageFrequencies(items) {
  const byField = {};
  for (const it of items) { byField[it.message_field] = byField[it.message_field] || new Set(); byField[it.message_field].add(it.subject_ref); }
  const denom = new Set(items.map(i => i.subject_ref)).size || 1;
  const freqs = MESSAGE_FIELDS.filter(f => byField[f]).map(f => deepFreeze({ message_field: f, present_count: byField[f].size, denom, fraction: Number((byField[f].size / denom).toFixed(6)), status: 'COMPUTED', produced_by: PRODUCER }));
  return deepFreeze({ schema_version: 'ucdm-research-1.0.0', frequencies: freqs, generated_by: PRODUCER });
}

// ---------- CUSTOMER PROBLEM SIGNALS (§5) — NO clustering ----------
function extractCustomerSignals(observations) {
  const items = [];
  for (const o of observations) {
    if (!isObserved(o)) continue;
    if (o.observation_type !== 'QUOTE') continue;
    const actor = (o.verbatim && (o.verbatim.actor || '').toLowerCase()) || '';
    if (actor && actor !== 'customer') continue;
    const aspect = String((o.structured_values || {}).aspect || '').toUpperCase();
    const signal_type = ASPECT_TO_SIGNAL[aspect] || null;
    if (!signal_type) continue; // an untagged quote is not a signal (no model guessing)
    const vb = o.verbatim;
    const b = {
      signal_type,
      verbatim_text: vb.verbatim_text,
      verbatim_hash: vb.verbatim_hash,
      subject_ref: subjKey(o),
      source_ref: o.source_ref,
      evidence_refs: [...((o.provenance && o.provenance.evidence_refs) || [])],
      observation_hash: o.content_hash,
      status: 'OBSERVED',
    };
    b.signal_id = 'msig_' + sha256Hex(canonicalize({ ...b, signal_id: undefined }));
    items.push(deepFreeze(b));
  }
  return items;
}

// ---------- DEMAND SIGNALS (§6) — DIRECT | PROXY | UNKNOWN; never a market size ----------
function extractDemandSignals(observations, { envelopesBySource = {}, referenceTime = null } = {}) {
  const items = [];
  // explicit demand observations
  for (const o of observations) {
    if (!isObserved(o)) continue;
    const sv = o.structured_values || {};
    const kindRaw = String(sv.demand_signal_kind || '').toLowerCase();
    if (!DEMAND_KINDS.includes(kindRaw) || !o.numeric) continue;
    const cls = DEMAND_CLASS.includes(String(sv.demand_class || '').toUpperCase()) ? String(sv.demand_class).toUpperCase() : (DEMAND_KIND_CLASS[kindRaw] || 'UNKNOWN');
    items.push(deepFreeze(mkDemand({ demand_kind: kindRaw, demand_class: cls, value: o.numeric.value, unit: o.numeric.unit, observation_window: o.numeric.observation_window, evidence_refs: (o.provenance && o.provenance.evidence_refs) || [], status: 'OBSERVED', source_ref: o.source_ref })));
  }
  // COMPUTED review_volume + review_recency (deterministic; one review = one customer QUOTE)
  const reviewObs = observations.filter(o => o.observation_type === 'QUOTE' && envelopesBySource[o.source_ref] && envelopesBySource[o.source_ref].source_category === 'REVIEW');
  if (reviewObs.length) {
    const evrefs = [...new Set(reviewObs.flatMap(o => (o.provenance && o.provenance.evidence_refs) || []))].sort();
    items.push(deepFreeze(mkDemand({ demand_kind: 'review_volume', demand_class: 'DIRECT', value: reviewObs.length, unit: 'COUNT', observation_window: null, evidence_refs: evrefs, status: 'COMPUTED', source_ref: null })));
    if (referenceTime) {
      const ages = reviewObs.map(o => { const t = o.temporal && (o.temporal.event_time || o.temporal.publication_time); return t ? (Date.parse(referenceTime) - Date.parse(t)) / 86400000 : null; }).filter(x => x != null);
      if (ages.length) items.push(deepFreeze(mkDemand({ demand_kind: 'review_recency', demand_class: 'DIRECT', value: Number(Math.min(...ages).toFixed(2)), unit: 'DAY', observation_window: null, evidence_refs: evrefs, status: 'COMPUTED', source_ref: null })));
    }
  }
  return deepFreeze({ schema_version: 'ucdm-research-1.0.0', signals: items, market_size: 'NOT_ESTIMATED', generated_by: PRODUCER, note: 'demand evidence only; ASTRA-11D never manufactures market size' });
}
function mkDemand(b) {
  b.schema_version = 'ucdm-research-1.0.0';
  if (b.status === 'COMPUTED') b.produced_by = PRODUCER;
  b.demand_id = 'mdem_' + sha256Hex(canonicalize({ ...b, demand_id: undefined }));
  return b;
}

function validateDemandSet(set) {
  const errors = [];
  if ('market_size' in set && set.market_size !== 'NOT_ESTIMATED') errors.push('demand set must not carry an estimated market_size');
  for (const s of set.signals) if (!DEMAND_CLASS.includes(s.demand_class)) errors.push(`bad demand_class "${s.demand_class}"`);
  return { valid: errors.length === 0, errors };
}

module.exports = {
  OFFER_COMPONENTS, MESSAGE_FIELDS, SIGNAL_TYPES, DEMAND_KINDS, DEMAND_CLASS,
  extractOfferComponents, computeComponentFrequencies,
  extractMessageObservations, computeMessageFrequencies,
  extractCustomerSignals,
  extractDemandSignals, validateDemandSet,
};
