'use strict';
// [ASTRA-11E benchmark] Frozen deterministic competitor fixtures. Provider-shaped payloads
// -> ASTRA-11C ingestion -> ASTRA-11D research -> ASTRA-11E competitor intelligence.
// NO real data, NO network, NO LLM. Reuses the ASTRA-11D vertical fixtures for the six
// baseline verticals; adds 12 adversarial competitor cases.
const D = require('../astra11d/fixtures');

const REFERENCE_TIME = D.REFERENCE_TIME;
const VERTICALS = D.VERTICALS; // dental / laser / restaurant / local service / b2b / digital education

function listing(source_id, competitor_ref, evidence_ref, L, geo) {
  return { provider_hint: 'research_listing', source_category: 'WEB_PAGE', source_id, competitor_ref, competitor_label: competitor_ref, evidence_ref, geography: geo || null, captured_at: '2026-09-01T00:00:00Z', listing: L };
}
function review(source_id, evidence_ref, text, rating, aspect, created_at) {
  return { provider_hint: 'research_review', source_category: 'REVIEW', source_id, evidence_ref, review_text: text, rating, aspect, created_at: created_at || '2026-08-10T00:00:00Z', captured_at: '2026-09-01T00:00:00Z' };
}

const ADVERSARIAL = {
  single_competitor_only: {
    request: { business_ref: 'e_ci1', product_or_service: 'nicho', objectives: ['MESSAGING', 'PRICING'] },
    records: [listing('s1', 'only_co', 'ev_s1', { price: 5000, currency: 'MXN', headline: 'El único', promise: 'Somos los mejores', published_at: '2026-08-01T00:00:00Z' })],
  },
  two_similar_names: {
    request: { business_ref: 'e_ci2', product_or_service: 'dental', objectives: ['MESSAGING', 'PRICING'] },
    identityHints: { ambiguous: [['subject:Competitor:acme_dental', 'subject:Competitor:acme_dental_care']] },
    records: [
      listing('t1', 'acme_dental', 'ev_t1', { price: 1000, currency: 'MXN', headline: 'Acme Dental', promise: 'Sonrisas', published_at: '2026-08-01T00:00:00Z' }),
      listing('t2', 'acme_dental_care', 'ev_t2', { price: 1200, currency: 'MXN', headline: 'Acme Dental Care', promise: 'Cuidado dental', published_at: '2026-08-02T00:00:00Z' }),
    ],
  },
  old_pricing: {
    request: { business_ref: 'e_ci3', product_or_service: 'dental', objectives: ['PRICING'] },
    records: [
      listing('o1', 'co_old', 'ev_o1', { price: 8000, currency: 'MXN', pricing_kind: 'LISTED_PRICE', headline: 'Precio histórico', published_at: '2024-01-01T00:00:00Z' }),
      listing('o2', 'co_new', 'ev_o2', { price: 9500, currency: 'MXN', pricing_kind: 'LISTED_PRICE', headline: 'Precio actual', published_at: '2026-08-01T00:00:00Z' }),
    ],
  },
  conflicting_price: {
    request: { business_ref: 'e_ci4', product_or_service: 'dental', objectives: ['PRICING'] },
    records: [
      listing('cp1', 'co_x', 'ev_cp1', { price: 999, currency: 'MXN', pricing_kind: 'LISTED_PRICE', headline: 'X', published_at: '2026-08-01T00:00:00Z' }),
      { provider_hint: 'research_listing', source_category: 'WEB_PAGE', source_id: 'cp2', competitor_ref: 'co_x', competitor_label: 'co_x', evidence_ref: 'ev_cp2', captured_at: '2026-09-01T00:00:00Z', listing: { price: 1499, currency: 'MXN', pricing_kind: 'LISTED_PRICE', headline: 'X', published_at: '2026-08-02T00:00:00Z' } },
      listing('cp3', 'co_y', 'ev_cp3', { price: 1100, currency: 'MXN', headline: 'Y', published_at: '2026-08-03T00:00:00Z' }),
    ],
  },
  conflicting_offer: {
    request: { business_ref: 'e_ci5', product_or_service: 'dental', objectives: ['OFFERS'] },
    records: [
      listing('cf1', 'co_g', 'ev_cf1', { guarantee: 'Garantía 30 días', headline: 'G', published_at: '2026-08-01T00:00:00Z' }),
      { provider_hint: 'research_listing', source_category: 'WEB_PAGE', source_id: 'cf2', competitor_ref: 'co_g', competitor_label: 'co_g', evidence_ref: 'ev_cf2', captured_at: '2026-09-01T00:00:00Z', listing: { guarantee: 'Sin garantía / no reembolsos', headline: 'G', published_at: '2026-08-02T00:00:00Z' } },
      listing('cf3', 'co_h', 'ev_cf3', { guarantee: 'Garantía de por vida', headline: 'H', published_at: '2026-08-03T00:00:00Z' }),
    ],
  },
  missing_proof: {
    request: { business_ref: 'e_ci6', product_or_service: 'dental', objectives: ['MESSAGING'] },
    records: [
      listing('mp1', 'co_np1', 'ev_mp1', { headline: 'Servicio dental', promise: 'Buen trato', published_at: '2026-08-01T00:00:00Z' }),
      listing('mp2', 'co_np2', 'ev_mp2', { headline: 'Clínica moderna', promise: 'Atención rápida', published_at: '2026-08-02T00:00:00Z' }),
      listing('mp3', 'co_np3', 'ev_mp3', { headline: 'Sonríe', promise: 'Precios justos', published_at: '2026-08-03T00:00:00Z' }),
      listing('mp4', 'co_np4', 'ev_mp4', { headline: 'Tu dentista', promise: 'Cerca de ti', published_at: '2026-08-04T00:00:00Z' }),
    ],
  },
  duplicate_competitor_pages: {
    request: { business_ref: 'e_ci7', product_or_service: 'dental', objectives: ['PRICING', 'MESSAGING'] },
    records: [
      listing('dp1', 'co_dup', 'ev_dp1', { price: 3000, currency: 'MXN', headline: 'Dup', promise: 'P', published_at: '2026-08-01T00:00:00Z' }),
      listing('dp1', 'co_dup', 'ev_dp1', { price: 3000, currency: 'MXN', headline: 'Dup', promise: 'P', published_at: '2026-08-01T00:00:00Z' }), // exact dup
      listing('dp2', 'co_two', 'ev_dp2', { price: 3500, currency: 'MXN', headline: 'Two', published_at: '2026-08-02T00:00:00Z' }),
    ],
  },
  duplicate_reviews: {
    request: { business_ref: 'e_ci8', product_or_service: 'dental', objectives: ['CUSTOMER_PROBLEMS'] },
    records: Array.from({ length: 5 }, (_, i) => review(`dr${i}`, `ev_dr${i}`, 'Nunca respondieron', 2, 'COMPLAINT', '2026-08-10T00:00:00Z')),
  },
  competitor_multiple_offers: {
    request: { business_ref: 'e_ci9', product_or_service: 'course', objectives: ['OFFERS', 'PRICING'] },
    records: [
      listing('mo1', 'co_multi', 'ev_mo1', { price: 3990, currency: 'MXN', pricing_kind: 'ONE_TIME', core_product_service: 'Curso base', bonus: 'Plantillas', published_at: '2026-08-01T00:00:00Z' }),
      { provider_hint: 'research_listing', source_category: 'WEB_PAGE', source_id: 'mo2', competitor_ref: 'co_multi', competitor_label: 'co_multi', evidence_ref: 'ev_mo2', captured_at: '2026-09-01T00:00:00Z', listing: { price: 9990, currency: 'MXN', pricing_kind: 'SUBSCRIPTION', core_product_service: 'Membresía anual', support: 'Mentoría', published_at: '2026-08-02T00:00:00Z' } },
      listing('mo3', 'co_single', 'ev_mo3', { price: 4990, currency: 'MXN', core_product_service: 'Curso', published_at: '2026-08-03T00:00:00Z' }),
    ],
  },
  competitor_rebrand: {
    request: { business_ref: 'e_ci10', product_or_service: 'agency', objectives: ['MESSAGING'] },
    identityHints: { aliases: { 'subject:Competitor:newbrand_co': ['OldBrand Co'] } },
    records: [
      listing('rb1', 'newbrand_co', 'ev_rb1', { headline: 'NewBrand', promise: 'Renovados', published_at: '2026-08-01T00:00:00Z' }),
      listing('rb2', 'other_co', 'ev_rb2', { headline: 'Other', promise: 'Estables', published_at: '2026-08-02T00:00:00Z' }),
    ],
  },
  high_volume_duplicated_ads: {
    request: { business_ref: 'e_ci11', product_or_service: 'laser', objectives: ['MESSAGING'] },
    records: Array.from({ length: 8 }, (_, i) => ({ provider_hint: 'meta_ads', source_id: `hv${i}`, source_category: 'ADVERTISEMENT', ad_creative_body: 'La más rápida del mercado', first_seen: '2026-08-01T00:00:00Z', captured_at: '2026-09-01T00:00:00Z', evidence_ref: `ev_hv${i}`, ad_id: '1' })),
  },
  proof_mix: {
    request: { business_ref: 'e_ci13', product_or_service: 'dental', objectives: ['MESSAGING', 'PRICING'] },
    records: [
      listing('pm1', 'co_proof', 'ev_pm1', { price: 5000, currency: 'MXN', headline: 'Clínica con historial', proof: 'Antes y después de +500 pacientes', rating: 4.7, review_count: 320, published_at: '2026-08-01T00:00:00Z' }),
      { provider_hint: 'research_review', source_category: 'REVIEW', source_id: 'pm2', competitor_ref: 'co_proof', evidence_ref: 'ev_pm2', review_text: 'Buen servicio, resultado visible', rating: 5, created_at: '2026-08-05T00:00:00Z', captured_at: '2026-09-01T00:00:00Z' },
      listing('pm3', 'co_noproof', 'ev_pm3', { price: 4500, currency: 'MXN', headline: 'Clínica nueva', published_at: '2026-08-02T00:00:00Z' }),
      listing('pm4', 'co_third', 'ev_pm4', { price: 4800, currency: 'MXN', headline: 'Tercera', proof: 'Certificación profesional', published_at: '2026-08-03T00:00:00Z' }),
    ],
  },
  no_funnel_visibility: {
    request: { business_ref: 'e_ci12', product_or_service: 'dental', objectives: ['MESSAGING'] },
    records: [
      listing('nf1', 'co_nf1', 'ev_nf1', { headline: 'Clínica A', promise: 'Calidad', published_at: '2026-08-01T00:00:00Z' }), // no cta
      listing('nf2', 'co_nf2', 'ev_nf2', { headline: 'Clínica B', promise: 'Confianza', published_at: '2026-08-02T00:00:00Z' }),
      listing('nf3', 'co_nf3', 'ev_nf3', { headline: 'Clínica C', promise: 'Cercanía', published_at: '2026-08-03T00:00:00Z' }),
      listing('nf4', 'co_nf4', 'ev_nf4', { headline: 'Clínica D', promise: 'Experiencia', published_at: '2026-08-04T00:00:00Z' }),
    ],
  },
};

module.exports = { REFERENCE_TIME, VERTICALS, ADVERSARIAL };
