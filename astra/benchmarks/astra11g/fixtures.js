'use strict';
// [ASTRA-11G benchmark] Frozen deterministic Customer-Model fixtures.
// Customer-authored review payloads -> ASTRA-11C ingest -> ASTRA-11D research ->
// ASTRA-11F VoC -> ASTRA-11G customer model. NO real data, NO network, NO LLM.
// 6 verticals (reused from ASTRA-11F) + 18 adversarial cases.
const F11F = require('../astra11f/fixtures');

const REFERENCE_TIME = F11F.REFERENCE_TIME;
const VERTICALS = F11F.VERTICALS;

function rev(source_id, evidence_ref, text, opts = {}) {
  return {
    provider_hint: 'research_review', source_category: 'REVIEW', source_id, evidence_ref,
    review_text: text, rating: opts.rating != null ? opts.rating : 4, lang: opts.lang || 'es',
    created_at: opts.created_at || '2026-08-10T00:00:00Z', captured_at: '2026-09-01T00:00:00Z',
  };
}

// Each adversarial fixture: { request, records, speakerHints?, businessInput?, expect }
const ADVERSARIAL = {
  tiny_sample: {
    request: { business_ref: 'g_tiny', product_or_service: 'x', objectives: ['CUSTOMER_PROBLEMS'], language: 'es' },
    speakerHints: { t1: { speaker_ref: 's1' } },
    records: [rev('t1', 'e_t1', 'Muy caro y me dio miedo.', { rating: 2 })],
  },
  duplicate_speakers: {
    request: { business_ref: 'g_dup', product_or_service: 'x', objectives: ['CUSTOMER_PROBLEMS'], language: 'es' },
    speakerHints: { u1: { speaker_ref: 'same' }, u2: { speaker_ref: 'same' }, u3: { speaker_ref: 'same' }, u4: { speaker_ref: 'other' } },
    records: [
      rev('u1', 'e_u1', 'Está muy caro.', { rating: 2 }),
      rev('u2', 'e_u2', 'Sigue siendo caro.', { rating: 2 }),
      rev('u3', 'e_u3', 'Demasiado caro para mí.', { rating: 2 }),
      rev('u4', 'e_u4', 'Caro pero vale la pena.', { rating: 4 }),
    ],
  },
  demographic_temptation: {
    request: { business_ref: 'g_demo', product_or_service: 'x', objectives: ['CUSTOMER_PROBLEMS'], language: 'es' },
    speakerHints: { m1: { speaker_ref: 'd1' }, m2: { speaker_ref: 'd2' }, m3: { speaker_ref: 'd3' } },
    records: [
      rev('m1', 'e_m1', 'Soy mamá y ando corriendo todo el día, necesito que sea rápido.', { rating: 4 }),
      rev('m2', 'e_m2', 'Vivo cerca y el precio me parece caro.', { rating: 3 }),
      rev('m3', 'e_m3', 'Me da miedo que duela, pero quiero resultados.', { rating: 4 }),
    ],
    // engine must NOT emit age/gender/income/family attributes as OBSERVED/derived
  },
  conflicting_pains: {
    request: { business_ref: 'g_cp', product_or_service: 'x', objectives: ['CUSTOMER_PROBLEMS'], language: 'es' },
    speakerHints: { c1: { speaker_ref: 'a' }, c2: { speaker_ref: 'b' }, c3: { speaker_ref: 'c' }, c4: { speaker_ref: 'd' }, c5: { speaker_ref: 'e' } },
    records: [
      rev('c1', 'e_c1', 'El servicio fue lentísimo, tardaron semanas.', { rating: 2 }),
      rev('c2', 'e_c2', 'Muy caro para lo que ofrecen.', { rating: 2 }),
      rev('c3', 'e_c3', 'Tardaron muchísimo en responder.', { rating: 2 }),
      rev('c4', 'e_c4', 'El precio se me hace elevado.', { rating: 3 }),
      rev('c5', 'e_c5', 'Lento y encima caro.', { rating: 2 }),
    ],
  },
  conflicting_desired_outcomes: {
    request: { business_ref: 'g_cdo', product_or_service: 'x', objectives: ['CUSTOMER_PROBLEMS'], language: 'es' },
    speakerHints: { o1: { speaker_ref: 'a' }, o2: { speaker_ref: 'b' }, o3: { speaker_ref: 'c' }, o4: { speaker_ref: 'd' } },
    records: [
      rev('o1', 'e_o1', 'Quiero que sea lo más rápido posible.', { rating: 4 }),
      rev('o2', 'e_o2', 'Prefiero que se tomen su tiempo y quede perfecto.', { rating: 5 }),
      rev('o3', 'e_o3', 'Necesito rapidez sobre todo.', { rating: 4 }),
      rev('o4', 'e_o4', 'Lo importante es la calidad del resultado, no la prisa.', { rating: 5 }),
    ],
  },
  mixed_awareness: {
    request: { business_ref: 'g_ma', product_or_service: 'x', objectives: ['CUSTOMER_PROBLEMS'], language: 'es' },
    speakerHints: { a1: { speaker_ref: 'a' }, a2: { speaker_ref: 'b' }, a3: { speaker_ref: 'c' } },
    records: [
      rev('a1', 'e_a1', 'No me quedó claro el proceso al principio.', { rating: 4 }),
      rev('a2', 'e_a2', '¿Tienen garantía si no funciona?', { rating: 4 }),
      rev('a3', 'e_a3', 'Quiero resultados reales.', { rating: 3 }),
    ],
  },
  unknown_budget: {
    request: { business_ref: 'g_ub', product_or_service: 'x', objectives: ['CUSTOMER_PROBLEMS'], language: 'es' },
    speakerHints: { u1: { speaker_ref: 'a' }, u2: { speaker_ref: 'b' }, u3: { speaker_ref: 'c' } },
    records: [
      rev('u1', 'e_ub1', 'El proceso no me quedó claro.', { rating: 3 }),
      rev('u2', 'e_ub2', 'Me da miedo que no funcione.', { rating: 3 }),
      rev('u3', 'e_ub3', 'Tardaron en contestar.', { rating: 2 }),
    ],
  },
  price_sensitive_high_urgency: {
    request: { business_ref: 'g_psu', product_or_service: 'x', objectives: ['CUSTOMER_PROBLEMS'], language: 'es' },
    speakerHints: { p1: { speaker_ref: 'a' }, p2: { speaker_ref: 'b' }, p3: { speaker_ref: 'c' }, p4: { speaker_ref: 'd' } },
    records: [
      rev('p1', 'e_psu1', 'Está caro pero lo necesito urgente, se me acaba el plazo.', { rating: 3 }),
      rev('p2', 'e_psu2', 'Muy caro. Necesito resolverlo ya, es urgente.', { rating: 2 }),
      rev('p3', 'e_psu3', 'El precio elevado, y tengo una fecha límite encima.', { rating: 3 }),
      rev('p4', 'e_psu4', 'Caro, pero mi problema empeora cada día.', { rating: 2 }),
    ],
  },
  high_budget_no_urgency: {
    request: { business_ref: 'g_hbn', product_or_service: 'x', objectives: ['CUSTOMER_PROBLEMS'], language: 'es' },
    speakerHints: { h1: { speaker_ref: 'a' }, h2: { speaker_ref: 'b' }, h3: { speaker_ref: 'c' } },
    records: [
      rev('h1', 'e_hbn1', 'No me pareció caro, vale la pena.', { rating: 5 }),
      rev('h2', 'e_hbn2', 'El precio está bien para la calidad.', { rating: 5 }),
      rev('h3', 'e_hbn3', 'Caro pero vale lo que cuesta.', { rating: 4 }),
    ],
  },
  overlapping_segments: {
    request: { business_ref: 'g_ov', product_or_service: 'x', objectives: ['CUSTOMER_PROBLEMS'], language: 'es' },
    speakerHints: { v1: { speaker_ref: 'sp1' }, v2: { speaker_ref: 'sp2' }, v3: { speaker_ref: 'sp3' } },
    records: [
      rev('v1', 'e_ov1', 'Está muy caro y no me quedó claro el proceso.', { rating: 2 }),
      rev('v2', 'e_ov2', 'Se me hace caro y me da miedo que duela.', { rating: 2 }),
      rev('v3', 'e_ov3', 'Es caro para lo que ofrecen.', { rating: 2 }),
    ],
  },
  similar_persona_labels: {
    request: { business_ref: 'g_spl', product_or_service: 'x', objectives: ['CUSTOMER_PROBLEMS'], language: 'es' },
    speakerHints: { s1: { speaker_ref: 'a' }, s2: { speaker_ref: 'b' }, s3: { speaker_ref: 'c' }, s4: { speaker_ref: 'd' } },
    records: [
      rev('s1', 'e_spl1', 'Está muy caro.', { rating: 2 }),
      rev('s2', 'e_spl2', 'El precio elevado.', { rating: 2 }),
      rev('s3', 'e_spl3', 'Me da miedo que duela.', { rating: 3 }),
      rev('s4', 'e_spl4', 'Tengo miedo de que me queme la piel.', { rating: 3 }),
    ],
  },
  b2b_multiple_roles: {
    request: { business_ref: 'g_b2b', product_or_service: 'agencia B2B', objectives: ['CUSTOMER_PROBLEMS'], language: 'es' },
    speakerHints: { r1: { speaker_ref: 'a' }, r2: { speaker_ref: 'b' }, r3: { speaker_ref: 'c' } },
    records: [
      rev('r1', 'e_b2b1', 'Quiero resultados medibles, ya probé otra agencia y no funcionó.', { rating: 4 }),
      rev('r2', 'e_b2b2', 'El reporte llega tarde siempre.', { rating: 3 }),
      rev('r3', 'e_b2b3', '¿Cómo funciona el onboarding?', { rating: 4 }),
    ],
    businessInput: {
      mode: 'B2B',
      icp_input: { industry: 'ecommerce', company_size: 'SMALL', solution_fit: 0.7, strategic_fit: 0.6, implementation_fit: 0.5 },
      buying_roles: [
        { role: 'DECISION_MAKER', party_ref: 'ceo', job_title: 'CEO', authority_evidence_refs: ['e_b2b1'] },
        { role: 'CHAMPION', party_ref: 'mkt', job_title: 'Marketing Lead', evidence_refs: ['e_b2b2'] },
        { role: 'END_USER', party_ref: 'analyst', evidence_refs: ['e_b2b2'] },
        { role: 'GATEKEEPER', party_ref: 'ops', evidence_refs: ['e_b2b3'] },
      ],
    },
  },
  title_without_authority: {
    request: { business_ref: 'g_twa', product_or_service: 'software B2B', objectives: ['CUSTOMER_PROBLEMS'], language: 'es' },
    speakerHints: { w1: { speaker_ref: 'a' }, w2: { speaker_ref: 'b' } },
    records: [
      rev('w1', 'e_twa1', 'Necesito que el proceso sea más claro.', { rating: 3 }),
      rev('w2', 'e_twa2', 'Muy lento el soporte.', { rating: 2 }),
    ],
    businessInput: {
      mode: 'B2B',
      icp_input: { industry: 'saas', company_size: 'MID' },
      buying_roles: [{ role: 'DECISION_MAKER', party_ref: 'vp', job_title: 'VP Operations' }], // NO authority evidence
    },
  },
  missing_icp_revenue: {
    request: { business_ref: 'g_mir', product_or_service: 'B2B', objectives: ['CUSTOMER_PROBLEMS'], language: 'es' },
    speakerHints: { i1: { speaker_ref: 'a' }, i2: { speaker_ref: 'b' } },
    records: [rev('i1', 'e_mir1', 'Quiero resultados medibles.', { rating: 4 }), rev('i2', 'e_mir2', 'El precio elevado.', { rating: 3 })],
    businessInput: { mode: 'B2B', icp_input: { industry: 'retail', company_size: 'SMALL' } }, // no revenue_range
  },
  missing_icp_employees: {
    request: { business_ref: 'g_mie', product_or_service: 'B2B', objectives: ['CUSTOMER_PROBLEMS'], language: 'es' },
    speakerHints: { e1: { speaker_ref: 'a' }, e2: { speaker_ref: 'b' } },
    records: [rev('e1', 'e_mie1', 'El reporte llega tarde.', { rating: 3 }), rev('e2', 'e_mie2', 'Muy caro.', { rating: 2 })],
    businessInput: { mode: 'B2B', icp_input: { industry: 'logistics', revenue_range: '1M-5M' } }, // no employees
  },
  strong_voc_weak_market: {
    request: { business_ref: 'g_svm', product_or_service: 'x', objectives: ['CUSTOMER_PROBLEMS'], language: 'es' },
    speakerHints: Object.fromEntries('123456789'.split('').map((n, i) => ['q' + n, { speaker_ref: 'sp' + n }])),
    records: '123456789'.split('').map(n => rev('q' + n, 'e_svm' + n, ['Muy caro.', 'El servicio lento.', 'Me da miedo que no funcione.', 'Quiero resultados.', 'El proceso confuso.', 'Tardaron en responder.', 'Caro pero vale la pena.', 'Necesito garantía.', '¿Cuánto cuesta?'][+n - 1], { rating: 3 })),
  },
  strong_market_weak_voc: {
    request: { business_ref: 'g_smv', product_or_service: 'x', objectives: ['CUSTOMER_PROBLEMS', 'PRICING'], language: 'es' },
    speakerHints: { z1: { speaker_ref: 'a' } },
    records: [
      rev('z1', 'e_smv1', 'Caro.', { rating: 2 }),
      { provider_hint: 'research_listing', source_category: 'WEB_PAGE', source_id: 'comp1', competitor_ref: 'comp1', evidence_ref: 'e_smv_c1', captured_at: '2026-09-01T00:00:00Z', listing: { headline: 'Clínica A', promise: 'Resultados garantizados', price: 5000, currency: 'MXN', published_at: '2026-08-01T00:00:00Z' } },
      { provider_hint: 'research_listing', source_category: 'WEB_PAGE', source_id: 'comp2', competitor_ref: 'comp2', evidence_ref: 'e_smv_c2', captured_at: '2026-09-01T00:00:00Z', listing: { headline: 'Clínica B', promise: 'Financiamiento disponible', price: 6500, currency: 'MXN', published_at: '2026-08-01T00:00:00Z' } },
    ],
  },
  owner_assumptions_mixed: {
    request: { business_ref: 'g_oam', product_or_service: 'x', objectives: ['CUSTOMER_PROBLEMS'], language: 'es' },
    speakerHints: { k1: { speaker_ref: 'cust1' }, k2: { speaker_ref: 'cust2' }, k3: { role: 'BUSINESS' } },
    records: [
      rev('k1', 'e_oam1', 'Está caro y el proceso confuso.', { rating: 2 }),
      rev('k2', 'e_oam2', 'Me da miedo que duela.', { rating: 3 }),
      rev('k3', 'e_oam3', 'Nuestros clientes son mujeres de 30 a 45 años de clase media que valoran la familia.', { rating: 5 }),
    ],
    // k3 is BUSINESS-authored owner speculation — must be excluded from VOC and never become a customer attribute
  },
};

module.exports = { REFERENCE_TIME, VERTICALS, ADVERSARIAL, rev };
