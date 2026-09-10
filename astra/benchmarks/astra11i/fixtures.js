'use strict';
// [ASTRA-11I benchmark] Frozen deterministic Positioning + Offer Intelligence fixtures.
// review + competitor-listing payloads -> 11C -> 11D -> 11F -> 11G -> 11H -> 11I.
// NO real data, NO network, NO LLM. 6 verticals (reused) + 20 adversarial cases.
const F11F = require('../astra11f/fixtures');

const REFERENCE_TIME = F11F.REFERENCE_TIME;
const VERTICALS = F11F.VERTICALS;

function rev(source_id, evidence_ref, text, opts = {}) {
  return {
    provider_hint: 'research_review', source_category: 'REVIEW', source_id, evidence_ref,
    review_text: text, rating: opts.rating != null ? opts.rating : 4, lang: 'es',
    created_at: opts.created_at || '2026-08-10T00:00:00Z', captured_at: '2026-09-01T00:00:00Z',
  };
}
function listing(source_id, evidence_ref, competitor_ref, headline, promise, opts = {}) {
  return {
    provider_hint: 'research_listing', source_category: 'WEB_PAGE', source_id, competitor_ref, evidence_ref,
    captured_at: '2026-09-01T00:00:00Z',
    listing: { headline, promise, ...(opts.price != null ? { price: opts.price, currency: opts.currency || 'MXN' } : {}), published_at: opts.published_at || '2026-08-01T00:00:00Z' },
  };
}
const req = (business_ref, objectives) => ({ business_ref, product_or_service: 'x', objectives: objectives || ['CUSTOMER_PROBLEMS'], language: 'es' });

// standard-ish business input used by most cases
const BI = {
  mode: 'B2C',
  capabilities: [
    { capability: 'atención el mismo día', feature: 'agenda express', evidence_refs: [] },
    { capability: 'precio fijo sin sorpresas', evidence_refs: [] },
  ],
  supplied_offer: {
    core: 'tratamiento completo', deliverables: ['diagnóstico', 'plan'],
    guarantees: ['garantía de 1 año'],
    pricing: { amount: 6000, currency: 'MXN', payment_terms: '3 meses sin intereses' },
  },
  proof_assets: [{ type: 'TESTIMONIAL', evidence_refs: ['e_d7'] }],
  constraints: [{ type: 'geography', detail: 'solo zona metro' }],
};

const ADVERSARIAL = {
  tiny_sample: { request: req('i_tiny'), speakerHints: { t1: { speaker_ref: 'a' } }, records: [rev('t1', 'e_t1', 'Muy caro y me da miedo.', { rating: 2 })], businessInput: BI },
  identical_competitor_messages: {
    request: req('i_icm', ['CUSTOMER_PROBLEMS', 'PRICING']),
    speakerHints: { r1: { speaker_ref: 'a' }, r2: { speaker_ref: 'b' } },
    records: [
      rev('r1', 'e_icm1', 'Muy caro y el proceso confuso.', { rating: 2 }),
      rev('r2', 'e_icm2', 'Quiero resultados reales.', { rating: 3 }),
      listing('c1', 'e_icm_c1', 'comp1', 'Precio fijo sin sorpresas', 'Rápido y transparente', { price: 6000 }),
      listing('c2', 'e_icm_c2', 'comp2', 'Precio fijo sin sorpresas', 'Rápido y transparente', { price: 6200 }),
      listing('c3', 'e_icm_c3', 'comp3', 'Precio fijo sin sorpresas', 'Rápido y transparente', { price: 5900 }),
    ],
    businessInput: BI,
  },
  claimed_uniqueness_no_evidence: {
    request: req('i_cune'), speakerHints: { u1: { speaker_ref: 'a' }, u2: { speaker_ref: 'b' } },
    records: [rev('u1', 'e_cune1', 'Muy caro.', { rating: 2 }), rev('u2', 'e_cune2', 'El proceso confuso.', { rating: 3 })],
    businessInput: { ...BI, capabilities: [{ capability: 'somos únicos en el mercado, los mejores, nadie más lo hace', evidence_refs: [] }] },
  },
  strong_voc_no_capability: {
    request: req('i_svnc'),
    speakerHints: Object.fromEntries('12345678'.split('').map(n => ['s' + n, { speaker_ref: 'sp' + n }])),
    records: '12345678'.split('').map(n => rev('s' + n, 'e_svnc' + n, ['Muy caro.', 'El servicio lento.', 'Me da miedo que no funcione.', 'Quiero resultados.', 'El proceso confuso.', 'Tardaron en responder.', 'No me pareció caro, vale la pena.', 'Necesito garantía.'][+n - 1], { rating: 3 })),
    businessInput: { mode: 'B2C', capabilities: [], supplied_offer: {}, proof_assets: [], constraints: [] },
  },
  strong_capability_weak_voc: {
    request: req('i_scwv'), speakerHints: { w1: { speaker_ref: 'a' } },
    records: [rev('w1', 'e_scwv1', 'Caro.', { rating: 2 })],
    businessInput: BI,
  },
  multiple_conflicting_segments: {
    request: req('i_mcs'),
    speakerHints: { p1: { speaker_ref: 'a' }, p2: { speaker_ref: 'b' }, p3: { speaker_ref: 'c' }, a1: { speaker_ref: 'd' }, a2: { speaker_ref: 'e' }, a3: { speaker_ref: 'f' } },
    records: [
      rev('p1', 'e_mcs1', 'Muy caro.', { rating: 2 }), rev('p2', 'e_mcs2', 'Está caro.', { rating: 2 }), rev('p3', 'e_mcs3', 'Demasiado caro.', { rating: 2 }),
      rev('a1', 'e_mcs4', 'No me pareció caro, vale la pena.', { rating: 5 }), rev('a2', 'e_mcs5', 'Buen precio.', { rating: 5 }), rev('a3', 'e_mcs6', 'Precio justo.', { rating: 5 }),
    ],
    businessInput: BI,
  },
  price_unknown: {
    request: req('i_pu'), speakerHints: { x1: { speaker_ref: 'a' }, x2: { speaker_ref: 'b' } },
    records: [rev('x1', 'e_pu1', 'El proceso confuso.', { rating: 3 }), rev('x2', 'e_pu2', 'Me da miedo que duela.', { rating: 3 })],
    businessInput: { ...BI, supplied_offer: { core: 'tratamiento', deliverables: [] } }, // no pricing
  },
  competitor_price_conflict: {
    request: req('i_cpc', ['CUSTOMER_PROBLEMS', 'PRICING']),
    speakerHints: { r1: { speaker_ref: 'a' }, r2: { speaker_ref: 'b' } },
    records: [
      rev('r1', 'e_cpc1', 'Muy caro.', { rating: 2 }), rev('r2', 'e_cpc2', 'Quiero resultados.', { rating: 3 }),
      listing('c1', 'e_cpc_c1', 'comp1', 'Económico', 'Precio bajo', { price: 3000 }),
      listing('c2', 'e_cpc_c2', 'comp2', 'Premium', 'Lo mejor', { price: 15000 }),
    ],
    businessInput: { ...BI, supplied_offer: { core: 'tratamiento', deliverables: [] } },
  },
  fabricated_wtp_temptation: {
    request: req('i_wtp', ['CUSTOMER_PROBLEMS', 'PRICING']),
    speakerHints: { r1: { speaker_ref: 'a' }, r2: { speaker_ref: 'b' } },
    records: [
      rev('r1', 'e_wtp1', 'No me pareció caro, vale la pena.', { rating: 5 }), rev('r2', 'e_wtp2', 'Buen precio, excelente valor.', { rating: 5 }),
      listing('c1', 'e_wtp_c1', 'comp1', 'Buen precio', 'Vale la pena', { price: 8000 }),
    ],
    businessInput: BI,
  },
  fake_urgency_temptation: {
    request: req('i_fut'), speakerHints: { u1: { speaker_ref: 'a' }, u2: { speaker_ref: 'b' } },
    records: [rev('u1', 'e_fut1', 'Muy caro.', { rating: 2 }), rev('u2', 'e_fut2', 'El proceso confuso.', { rating: 3 })],
    businessInput: { ...BI, supplied_offer: { ...BI.supplied_offer, urgency: { detail: 'oferta termina pronto' /* NO basis */ } } },
  },
  fake_scarcity_temptation: {
    request: req('i_fst'), speakerHints: { u1: { speaker_ref: 'a' }, u2: { speaker_ref: 'b' } },
    records: [rev('u1', 'e_fst1', 'Muy caro.', { rating: 2 }), rev('u2', 'e_fst2', 'El proceso confuso.', { rating: 3 })],
    businessInput: { ...BI, supplied_offer: { ...BI.supplied_offer, scarcity: { detail: 'solo quedan 3 lugares' /* NO basis */ } } },
  },
  real_capacity_scarcity: {
    request: req('i_rcs'), speakerHints: { u1: { speaker_ref: 'a' }, u2: { speaker_ref: 'b' } },
    records: [rev('u1', 'e_rcs1', 'Muy caro.', { rating: 2 }), rev('u2', 'e_rcs2', 'El proceso confuso.', { rating: 3 })],
    businessInput: { ...BI, supplied_offer: { ...BI.supplied_offer, scarcity: { basis: 'REAL_CAPACITY', detail: 'atendemos 20 pacientes por semana', evidence_refs: [] } } },
  },
  unsupported_guarantee_temptation: {
    request: req('i_ugt'), speakerHints: { u1: { speaker_ref: 'a' }, u2: { speaker_ref: 'b' } },
    records: [rev('u1', 'e_ugt1', 'Necesito garantía si no funciona.', { rating: 3 }), rev('u2', 'e_ugt2', 'Me da miedo que no funcione.', { rating: 3 })],
    // business does NOT supply a guarantee -> the engine must NOT invent one, only surface the gap
    businessInput: { ...BI, supplied_offer: { core: 'tratamiento', deliverables: [] } },
  },
  missing_proof: {
    request: req('i_mp'), speakerHints: { u1: { speaker_ref: 'a' }, u2: { speaker_ref: 'b' }, u3: { speaker_ref: 'c' } },
    records: [
      rev('u1', 'e_mp1', 'No estoy seguro de que funcione.', { rating: 3 }),
      rev('u2', 'e_mp2', '¿De verdad funciona? Quiero ver resultados.', { rating: 3 }),
      rev('u3', 'e_mp3', 'Necesito garantía.', { rating: 3 }),
    ],
    businessInput: { ...BI, proof_assets: [] },
  },
  strong_proof_weak_differentiation: {
    request: req('i_spwd', ['CUSTOMER_PROBLEMS', 'PRICING']),
    speakerHints: { u1: { speaker_ref: 'a' }, u2: { speaker_ref: 'b' } },
    records: [
      rev('u1', 'e_spwd1', '¿De verdad funciona?', { rating: 3 }), rev('u2', 'e_spwd2', 'Quiero resultados.', { rating: 3 }),
      listing('c1', 'e_spwd_c1', 'comp1', 'Precio fijo sin sorpresas', 'Rápido', { price: 6000 }),
    ],
    businessInput: { ...BI, proof_assets: [{ type: 'CASE_STUDY', evidence_refs: [] }, { type: 'TESTIMONIAL', evidence_refs: [] }, { type: 'QUANTIFIED_RESULT', evidence_refs: [] }] },
  },
  emotional_transformation_temptation: {
    request: req('i_ett'), speakerHints: { u1: { speaker_ref: 'a' }, u2: { speaker_ref: 'b' }, u3: { speaker_ref: 'c' } },
    records: [
      rev('u1', 'e_ett1', 'Quiero resultados rápidos y buen precio.', { rating: 4 }),
      rev('u2', 'e_ett2', 'Necesito que funcione y sea conveniente.', { rating: 4 }),
      rev('u3', 'e_ett3', 'Busco calidad y rapidez.', { rating: 4 }),
    ],
    businessInput: BI,
  },
  two_valid_territories: {
    request: req('i_tvt'),
    speakerHints: { s1: { speaker_ref: 'a' }, s2: { speaker_ref: 'b' }, s3: { speaker_ref: 'c' }, f1: { speaker_ref: 'd' }, f2: { speaker_ref: 'e' }, f3: { speaker_ref: 'f' } },
    records: [
      rev('s1', 'e_tvt1', 'El servicio lento, tardaron mucho.', { rating: 2 }), rev('s2', 'e_tvt2', 'Muy lento todo.', { rating: 2 }), rev('s3', 'e_tvt3', 'Tardaron en responder.', { rating: 2 }),
      rev('f1', 'e_tvt4', 'Me da miedo que duela.', { rating: 3 }), rev('f2', 'e_tvt5', 'Tengo miedo del procedimiento.', { rating: 3 }), rev('f3', 'e_tvt6', 'Me asusta el dolor.', { rating: 3 }),
    ],
    businessInput: BI,
  },
  strong_offer_one_segment_weak_another: {
    request: req('i_sows'),
    speakerHints: { a1: { speaker_ref: 'a' }, a2: { speaker_ref: 'b' }, a3: { speaker_ref: 'c' }, b1: { speaker_ref: 'd' }, b2: { speaker_ref: 'e' }, b3: { speaker_ref: 'f' } },
    records: [
      rev('a1', 'e_sows1', 'Quiero rapidez.', { rating: 4 }), rev('a2', 'e_sows2', 'Necesito que sea rápido, el mismo día.', { rating: 4 }), rev('a3', 'e_sows3', 'Rápido sobre todo.', { rating: 4 }),
      rev('b1', 'e_sows4', 'El proceso confuso y me da miedo.', { rating: 2 }), rev('b2', 'e_sows5', 'No entendí el proceso.', { rating: 2 }), rev('b3', 'e_sows6', 'Me asusta y no sé cómo es el proceso.', { rating: 2 }),
    ],
    businessInput: BI, // capabilities favor speed, not process clarity
  },
  journey_stage_mismatch: {
    request: req('i_jsm'), speakerHints: { u1: { speaker_ref: 'a' }, u2: { speaker_ref: 'b' }, u3: { speaker_ref: 'c' } },
    records: [
      rev('u1', 'e_jsm1', 'Ya soy cliente pero el onboarding fue confuso y tardaron en responder.', { rating: 2 }),
      rev('u2', 'e_jsm2', 'Contraté y el proceso post no me quedó claro.', { rating: 2 }),
      rev('u3', 'e_jsm3', 'Me atendieron pero el seguimiento fue lento.', { rating: 2 }),
    ],
    businessInput: { ...BI, supplied_offer: { core: 'tratamiento', deliverables: ['diagnóstico'], pricing: { amount: 6000, currency: 'MXN' } } }, // no onboarding/support component
  },
  b2b_committee_objections_differ: {
    request: { business_ref: 'i_bco', product_or_service: 'agencia B2B', objectives: ['CUSTOMER_PROBLEMS'], language: 'es' },
    speakerHints: { d1: { speaker_ref: 'a' }, d2: { speaker_ref: 'b' } },
    records: [
      rev('d1', 'e_bco1', 'Como responsable de marketing quiero resultados reales, ya probé otra agencia.', { rating: 4 }),
      rev('d2', 'e_bco2', 'Está muy caro para el presupuesto.', { rating: 2 }),
    ],
    businessInput: {
      mode: 'B2B', icp_input: { industry: 'saas', company_size: 'MID', implementation_fit: 0.6 },
      capabilities: [{ capability: 'reportes semanales medibles', evidence_refs: [] }],
      supplied_offer: { core: 'retainer de marketing', deliverables: ['estrategia', 'reportes'], pricing: { amount: 30000, currency: 'MXN', payment_terms: 'mensual' } },
      proof_assets: [{ type: 'CASE_STUDY', evidence_refs: [] }],
      buying_roles: [
        { role: 'CHAMPION', party_ref: 'mkt', evidence_refs: ['e_bco1'] },
        { role: 'ECONOMIC_BUYER', party_ref: 'cfo', job_title: 'CFO', authority_evidence_refs: ['e_bco2'] },
      ],
    },
  },
  historical_vs_current_competitor: {
    request: req('i_hvcc', ['CUSTOMER_PROBLEMS', 'PRICING']),
    speakerHints: { r1: { speaker_ref: 'a' }, r2: { speaker_ref: 'b' } },
    records: [
      rev('r1', 'e_hvcc1', 'Muy caro.', { rating: 2 }), rev('r2', 'e_hvcc2', 'Quiero resultados.', { rating: 3 }),
      listing('c_old', 'e_hvcc_o', 'comp1', 'Oferta 2023', 'Precio viejo', { price: 4000, published_at: '2023-06-01T00:00:00Z' }),
      listing('c_new', 'e_hvcc_n', 'comp1', 'Oferta actual', 'Precio actual', { price: 9000, published_at: '2026-08-01T00:00:00Z' }),
    ],
    businessInput: BI,
  },
};

module.exports = { REFERENCE_TIME, VERTICALS, ADVERSARIAL, rev, listing, BI };
