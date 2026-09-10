'use strict';
// [ASTRA-11D remediation] Deterministic research adapters. Provider-NEUTRAL competitor
// listing / review / demand snapshots -> ASTRA-11C-style NormalizedObservation specs, built
// with ASTRA-11C primitives (no duplication, 11C not modified). No LLM, no web, no I/O.
const { makeVerbatim } = require('../normalization/verbatim');
const { makeNumericObservation } = require('../normalization/numeric_observation');
const { makeSubjectRef } = require('../evidence/subject_resolution');
const { makeTemporal } = require('../evidence/temporal');
const { ALL: C11_ADAPTERS } = require('../ingestion/fake_adapters');

const OFFER_COMPONENT_FIELDS = ['core_product_service', 'bonus', 'guarantee', 'discount', 'financing', 'trial', 'delivery_time', 'scarcity', 'urgency', 'bundle', 'support', 'implementation'];
const MESSAGE_VERBATIM_FIELDS = ['headline', 'promise', 'pain', 'desired_outcome', 'mechanism', 'proof', 'identity_language', 'objection_addressed'];

function subjOf(raw) { return makeSubjectRef({ subject_type: 'Competitor', subject_id: raw.competitor_ref || undefined, label: raw.competitor_label || null }); }
function tmpOf(raw, L) { return makeTemporal({ publication_time: (L && L.published_at) || raw.published_at || raw.first_seen || null, capture_time: raw.captured_at || null, event_time: (L && L.observed_at) || null }); }

// research_listing: a competitor landing page / ad-library snapshot (provider-neutral).
const researchListingAdapter = Object.freeze({
  adapter_id: 'astra11d.research_listing', adapter_version: '1.0.0', source_category: 'WEB_PAGE',
  identify: (raw) => !!raw && raw.provider_hint === 'research_listing' && !!raw.listing,
  validate: (raw) => ({ valid: !!raw.listing && typeof raw.listing === 'object', errors: raw.listing ? [] : ['missing listing'] }),
  extract: (raw) => {
    const L = raw.listing; const out = [];
    const geo = raw.geography || null;
    if (typeof L.price === 'number') {
      out.push({
        observation_type: 'METRIC',
        numeric: makeNumericObservation({ value: L.price, currency: L.currency, unit: 'currency', source_class: 'OBSERVED', evidence_refs: [raw.evidence_ref], aggregation: 'RAW', as_of: L.observed_at || raw.published_at || null }),
        subject: subjOf(raw), temporal: tmpOf(raw, L),
        structured_values: { pricing_kind: (L.pricing_kind || 'LISTED_PRICE'), geography: geo },
      });
    }
    // competitor-PUBLISHED proof stats on their own page
    if (typeof L.rating === 'number') {
      out.push({ observation_type: 'RATING', numeric: makeNumericObservation({ value: L.rating, unit: 'star', source_class: 'OBSERVED', evidence_refs: [raw.evidence_ref], aggregation: 'RAW' }), subject: subjOf(raw), temporal: tmpOf(raw, L), structured_values: { geography: geo } });
    }
    if (typeof L.review_count === 'number') {
      out.push({ observation_type: 'METRIC', numeric: makeNumericObservation({ value: L.review_count, unit: 'count', source_class: 'OBSERVED', evidence_refs: [raw.evidence_ref], aggregation: 'COUNT' }), subject: subjOf(raw), temporal: tmpOf(raw, L), structured_values: { metric_kind: 'review_count', geography: geo } });
    }
    for (const f of MESSAGE_VERBATIM_FIELDS) {
      if (L[f] != null && String(L[f]).length) {
        out.push({
          observation_type: 'CLAIM',
          verbatim: makeVerbatim({ verbatim_text: String(L[f]), actor: 'advertiser', source_ref: raw.source_id, language: raw.lang || 'es' }),
          subject: subjOf(raw), temporal: tmpOf(raw, L),
          structured_values: { message_field: f, geography: geo },
        });
      }
    }
    if (L.cta != null) {
      out.push({ observation_type: 'ATTRIBUTE', content: { text: `cta: ${L.cta}`, normalized_text: `cta: ${String(L.cta).toLowerCase()}` }, structured_values: { message_field: 'cta', cta: String(L.cta), geography: geo }, subject: subjOf(raw), temporal: tmpOf(raw, L) });
    }
    for (const f of OFFER_COMPONENT_FIELDS) {
      if (L[f] != null && L[f] !== false) {
        out.push({ observation_type: 'ATTRIBUTE', content: { text: `${f}: ${L[f]}`, normalized_text: `${f}: ${String(L[f]).toLowerCase()}` }, structured_values: { offer_component: f, offer_component_detail: String(L[f]), geography: geo }, subject: subjOf(raw), temporal: tmpOf(raw, L) });
      }
    }
    return out;
  },
  normalizeMetadata: () => ({ channel_class: 'WEB' }),
});

// research_review: an aspect-tagged customer review (aspect declared by the caller, NOT guessed).
const ASPECTS = ['PAIN', 'DESIRE', 'FEAR', 'OBJECTION', 'COMPLAINT', 'PURCHASE_BARRIER', 'ALTERNATIVE'];
const researchReviewAdapter = Object.freeze({
  adapter_id: 'astra11d.research_review', adapter_version: '1.0.0', source_category: 'REVIEW',
  identify: (raw) => !!raw && raw.provider_hint === 'research_review' && typeof raw.review_text === 'string',
  validate: (raw) => ({ valid: raw.review_text.length > 0, errors: raw.review_text.length ? [] : ['empty review_text'] }),
  extract: (raw) => {
    const out = [];
    const aspect = String(raw.aspect || '').toUpperCase();
    // a review ABOUT a competitor -> Competitor subject (independent, third-party evidence);
    // otherwise -> Business subject (about the commissioning business).
    const subj = () => raw.competitor_ref ? makeSubjectRef({ subject_type: 'Competitor', subject_id: raw.competitor_ref, label: raw.competitor_ref }) : makeSubjectRef({ subject_type: 'Business' });
    out.push({
      observation_type: 'QUOTE',
      verbatim: makeVerbatim({ verbatim_text: raw.review_text, actor: 'customer', language: raw.lang || 'es', timestamp: raw.created_at, source_ref: raw.source_id }),
      subject: subj(),
      temporal: makeTemporal({ event_time: raw.created_at, publication_time: raw.created_at, capture_time: raw.captured_at }),
      structured_values: { aspect: ASPECTS.includes(aspect) ? aspect : null },
    });
    if (typeof raw.rating === 'number') out.push({ observation_type: 'RATING', numeric: makeNumericObservation({ value: raw.rating, unit: 'star', source_class: 'OBSERVED', evidence_refs: [raw.evidence_ref], aggregation: 'RAW' }), subject: subj(), temporal: makeTemporal({ event_time: raw.created_at }) });
    return out;
  },
  normalizeMetadata: () => ({}),
});

// research_demand: an explicitly-labelled demand signal (DIRECT | PROXY). Never a market size.
const researchDemandAdapter = Object.freeze({
  adapter_id: 'astra11d.research_demand', adapter_version: '1.0.0', source_category: 'ANALYTICS_EVENT',
  identify: (raw) => !!raw && raw.provider_hint === 'research_demand' && raw.demand,
  validate: (raw) => ({ valid: typeof raw.demand.value === 'number' && !!raw.demand.kind, errors: [] }),
  extract: (raw) => {
    const D = raw.demand;
    return [{
      observation_type: 'METRIC',
      numeric: makeNumericObservation({ value: D.value, unit: D.unit || 'count', source_class: 'OBSERVED', evidence_refs: [raw.evidence_ref], aggregation: D.aggregation || 'COUNT', observation_window: D.window || null }),
      subject: makeSubjectRef({ subject_type: 'Market' }),
      temporal: makeTemporal({ observation_window: D.window || null, capture_time: raw.captured_at }),
      structured_values: { demand_signal_kind: String(D.kind).toUpperCase(), demand_class: (D.demand_class || 'PROXY').toUpperCase(), geography: raw.geography || null },
    }];
  },
  normalizeMetadata: () => ({}),
});

// Composite adapter: try the 11C fake adapters first, then the 11D research adapters.
// 11C ingest() accepts a single `adapter`; a mismatch -> validate() fails -> REJECTED (fail closed).
function compositeAdapter(extra = []) {
  const all = [...C11_ADAPTERS, researchListingAdapter, researchReviewAdapter, researchDemandAdapter, ...extra];
  const pick = (raw) => all.find(a => { try { return a.identify(raw); } catch { return false; } }) || null;
  return Object.freeze({
    adapter_id: 'astra11d.composite', adapter_version: '1.0.0', source_category: null,
    identify: (raw) => !!pick(raw),
    validate: (raw) => { const a = pick(raw); return a ? a.validate(raw) : { valid: false, errors: ['no research adapter matched this raw input'] }; },
    extract: (raw) => { const a = pick(raw); if (!a) throw new Error('composite: no adapter'); return a.extract(raw); },
    normalizeMetadata: (raw) => { const a = pick(raw); return a ? a.normalizeMetadata(raw) : {}; },
    _members: all.map(a => a.adapter_id),
  });
}

module.exports = { researchListingAdapter, researchReviewAdapter, researchDemandAdapter, compositeAdapter, OFFER_COMPONENT_FIELDS, MESSAGE_VERBATIM_FIELDS, ASPECTS };
