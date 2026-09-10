'use strict';
// [ASTRA-11C] DETERMINISTIC FAKE adapters (spec section B). Test/simulation only.
// NO real external API. Each adapter understands a provider-shaped payload and emits
// PROVIDER-NEUTRAL normalized observations + neutral metadata. Provider-specific keys
// (fbid, ad_id, wamid, charge_id, ...) MUST NOT appear in the output.
// No LLM, no web, no I/O.
const { makeVerbatim } = require('../normalization/verbatim');
const { makeNumericObservation } = require('../normalization/numeric_observation');
const { makeSubjectRef } = require('../evidence/subject_resolution');
const { makeTemporal } = require('../evidence/temporal');

// Adapter contract: identify(raw) -> bool ; validate(raw) -> {valid,errors} ;
//   extract(raw) -> [{observation spec}] ; normalizeMetadata(raw) -> neutral map
function adapter(def) {
  return Object.freeze({
    adapter_id: def.adapter_id,
    adapter_version: def.adapter_version,
    source_category: def.source_category,
    identify: def.identify,
    validate: def.validate || ((raw) => ({ valid: !!raw && typeof raw === 'object', errors: [] })),
    extract: def.extract,
    normalizeMetadata: def.normalizeMetadata || (() => ({})),
  });
}

// ---- Google review (simulated) -> REVIEW ----
const googleReviewAdapter = adapter({
  adapter_id: 'fake.google_review', adapter_version: '1.0.0', source_category: 'REVIEW',
  identify: (raw) => !!raw && raw.provider_hint === 'google_reviews' && 'review_text' in raw,
  validate: (raw) => ({ valid: typeof raw.review_text === 'string' && raw.review_text.length > 0, errors: raw.review_text ? [] : ['missing review_text'] }),
  extract: (raw) => {
    const vb = makeVerbatim({ verbatim_text: raw.review_text, language: raw.lang || 'es', actor: 'customer', timestamp: raw.created_at, source_ref: raw.source_id });
    const out = [{ observation_type: 'QUOTE', verbatim: vb, subject: makeSubjectRef({ subject_type: 'Business' }), temporal: makeTemporal({ event_time: raw.created_at, publication_time: raw.created_at, capture_time: raw.captured_at }) }];
    if (typeof raw.rating === 'number') {
      out.push({
        observation_type: 'RATING',
        numeric: makeNumericObservation({ value: raw.rating, unit: 'star', source_class: 'OBSERVED', evidence_refs: [raw.evidence_ref], aggregation: 'RAW' }),
        subject: makeSubjectRef({ subject_type: 'Business' }),
        temporal: makeTemporal({ event_time: raw.created_at }),
      });
    }
    return out;
  },
  normalizeMetadata: (raw) => ({ rating_scale_max: 5, place_label: raw.place_name || null }), // no place_id, no reviewer_id
});

// ---- Meta ad (simulated) -> ADVERTISEMENT ----
const metaAdAdapter = adapter({
  adapter_id: 'fake.meta_ad', adapter_version: '1.0.0', source_category: 'ADVERTISEMENT',
  identify: (raw) => !!raw && raw.provider_hint === 'meta_ads' && 'ad_creative_body' in raw,
  extract: (raw) => ([{
    observation_type: 'CLAIM',
    verbatim: makeVerbatim({ verbatim_text: raw.ad_creative_body, language: raw.lang || 'es', actor: 'advertiser', timestamp: raw.first_seen, source_ref: raw.source_id }),
    subject: makeSubjectRef({ subject_type: 'Offer' }),
    temporal: makeTemporal({ publication_time: raw.first_seen, capture_time: raw.captured_at }),
    structured_values: { placement_class: 'PAID_SOCIAL', objective_class: (raw.objective || '').toUpperCase().includes('LEAD') ? 'LEADS' : 'OTHER' },
  }]),
  normalizeMetadata: () => ({ channel_class: 'PAID_SOCIAL' }), // no ad_id, adset_id, page_id
});

// ---- WhatsApp conversation (simulated) -> CONVERSATION ----
const whatsappConversationAdapter = adapter({
  adapter_id: 'fake.whatsapp_conversation', adapter_version: '1.0.0', source_category: 'CONVERSATION',
  identify: (raw) => !!raw && raw.provider_hint === 'whatsapp' && Array.isArray(raw.messages),
  extract: (raw) => raw.messages.filter(m => m.from === 'customer').map((m, i) => ({
    observation_type: 'QUOTE',
    verbatim: makeVerbatim({ verbatim_text: m.text, language: raw.lang || 'es', actor: 'customer', timestamp: m.ts, source_ref: raw.source_id }),
    subject: makeSubjectRef({ subject_type: 'Lead', subject_id: raw.contact_ref || undefined }),
    temporal: makeTemporal({ event_time: m.ts, capture_time: raw.captured_at }),
  })),
  normalizeMetadata: () => ({ medium_class: 'MESSAGING' }), // no wa_id, phone number, wamid
});

// ---- CRM lead (simulated) -> CRM_RECORD ----
const crmLeadAdapter = adapter({
  adapter_id: 'fake.crm_lead', adapter_version: '1.0.0', source_category: 'CRM_RECORD',
  identify: (raw) => !!raw && raw.provider_hint === 'crm' && 'lead' in raw,
  extract: (raw) => {
    const l = raw.lead;
    const out = [{
      observation_type: 'ATTRIBUTE',
      content: { text: `lead stage: ${l.stage}`, normalized_text: `lead stage: ${String(l.stage).toLowerCase()}` },
      structured_values: { stage_name: String(l.stage).toLowerCase(), channel_class: (l.source_class || 'OTHER').toUpperCase() },
      subject: makeSubjectRef({ subject_type: 'Lead', subject_id: l.lead_ref }),
      temporal: makeTemporal({ event_time: l.created_at, capture_time: raw.captured_at }),
    }];
    if (typeof l.deal_value === 'number') out.push({
      observation_type: 'METRIC',
      numeric: makeNumericObservation({ value: l.deal_value, currency: l.currency || 'USD', unit: 'currency', source_class: 'OBSERVED', evidence_refs: [raw.evidence_ref], aggregation: 'RAW' }),
      subject: makeSubjectRef({ subject_type: 'Opportunity' }),
      temporal: makeTemporal({ event_time: l.created_at }),
    });
    return out;
  },
  normalizeMetadata: () => ({}), // no crm ids, no owner id
});

// ---- Stripe-like transaction (simulated) -> TRANSACTION ----
const stripeLikeTransactionAdapter = adapter({
  adapter_id: 'fake.transaction', adapter_version: '1.0.0', source_category: 'TRANSACTION',
  identify: (raw) => !!raw && raw.provider_hint === 'payments' && 'amount_minor' in raw,
  validate: (raw) => ({ valid: Number.isInteger(raw.amount_minor) && raw.amount_minor >= 0, errors: Number.isInteger(raw.amount_minor) ? [] : ['amount_minor must be a non-negative integer'] }),
  extract: (raw) => ([{
    observation_type: 'TRANSACTION',
    numeric: makeNumericObservation({
      value: raw.amount_minor / 100, currency: raw.currency, unit: 'currency',
      source_class: 'OBSERVED', evidence_refs: [raw.evidence_ref], aggregation: 'RAW',
      observation_window: null, as_of: raw.created_at,
    }),
    subject: makeSubjectRef({ subject_type: 'Sale' }),
    temporal: makeTemporal({ event_time: raw.created_at, capture_time: raw.captured_at }),
    structured_values: { kind: (raw.kind || 'ONE_TIME').toUpperCase() },
  }]),
  normalizeMetadata: () => ({}), // no charge_id, no customer_id, no card details
});

const ALL = [googleReviewAdapter, metaAdAdapter, whatsappConversationAdapter, crmLeadAdapter, stripeLikeTransactionAdapter];

function pickAdapter(raw) { return ALL.find(a => { try { return a.identify(raw); } catch { return false; } }) || null; }

module.exports = { adapter, googleReviewAdapter, metaAdAdapter, whatsappConversationAdapter, crmLeadAdapter, stripeLikeTransactionAdapter, ALL, pickAdapter };
