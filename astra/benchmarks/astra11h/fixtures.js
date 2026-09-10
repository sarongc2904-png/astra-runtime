'use strict';
// [ASTRA-11H benchmark] Frozen deterministic Customer-Journey + JTBD fixtures.
// Customer-authored review payloads -> ASTRA-11C ingest -> ASTRA-11D research ->
// ASTRA-11F VoC -> ASTRA-11G customer model -> ASTRA-11H journey. NO real data, NO network,
// NO LLM. 6 verticals (reused) + 18 adversarial cases.
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
const req = (business_ref) => ({ business_ref, product_or_service: 'x', objectives: ['CUSTOMER_PROBLEMS'], language: 'es' });

const ADVERSARIAL = {
  tiny_sample: {
    request: req('h_tiny'), speakerHints: { t1: { speaker_ref: 's1' } },
    records: [rev('t1', 'e_t1', 'Muy caro y me da miedo que duela.', { rating: 2 })],
  },
  nonlinear_journey: {
    request: req('h_nl'), speakerHints: { n1: { speaker_ref: 'a' }, n2: { speaker_ref: 'b' } },
    records: [
      rev('n1', 'e_n1', 'No me pareció caro y vale la pena, pero el proceso no me quedó claro y pregunté por whatsapp.', { rating: 4 }),
      rev('n2', 'e_n2', 'Vale lo que cuesta, aunque no entendí el proceso, así que les escribí.', { rating: 4 }),
    ],
  },
  skipped_stages: {
    request: req('h_skip'), speakerHints: { k1: { speaker_ref: 'a' }, k2: { speaker_ref: 'b' } },
    records: [
      rev('k1', 'e_k1', 'Me lo recomendaron y ya soy cliente, sin más vueltas.', { rating: 5 }),
      rev('k2', 'e_k2', 'Un amigo me dijo y contraté el mismo día.', { rating: 5 }),
    ],
  },
  repeated_evaluation: {
    request: req('h_re'), speakerHints: { e1: { speaker_ref: 'a' }, e2: { speaker_ref: 'a' }, e3: { speaker_ref: 'a' } },
    records: [
      rev('e1', 'e_re1', 'Quiero resultados pero no estoy seguro de que funcione.', { rating: 3 }),
      rev('e2', 'e_re2', 'Sigo con dudas, no me convence del todo.', { rating: 3 }),
      rev('e3', 'e_re3', 'Otra vez lo pienso, dudo que funcione.', { rating: 3 }),
    ],
  },
  unknown_trigger: {
    request: req('h_ut'), speakerHints: { u1: { speaker_ref: 'a' }, u2: { speaker_ref: 'b' } },
    records: [rev('u1', 'e_ut1', 'Muy caro.', { rating: 2 }), rev('u2', 'e_ut2', 'El proceso no me quedó claro.', { rating: 3 })],
  },
  unknown_alternative: {
    request: req('h_ua'), speakerHints: { a1: { speaker_ref: 'a' }, a2: { speaker_ref: 'b' } },
    records: [rev('a1', 'e_ua1', 'Me da miedo que duela.', { rating: 3 }), rev('a2', 'e_ua2', 'Quiero resultados reales.', { rating: 4 })],
  },
  no_purchase_evidence: {
    request: req('h_np'), speakerHints: { p1: { speaker_ref: 'a' }, p2: { speaker_ref: 'b' }, p3: { speaker_ref: 'c' } },
    records: [
      rev('p1', 'e_np1', 'Estoy investigando, muy caro.', { rating: 3 }),
      rev('p2', 'e_np2', '¿Cuánto cuesta? Todavía comparando.', { rating: 3 }),
      rev('p3', 'e_np3', 'Me da miedo, sigo pensándolo.', { rating: 3 }),
    ],
  },
  no_post_purchase: {
    request: req('h_npp'), speakerHints: { q1: { speaker_ref: 'a' }, q2: { speaker_ref: 'b' } },
    records: [
      rev('q1', 'e_npp1', 'Pregunté precio y me pareció caro.', { rating: 2 }),
      rev('q2', 'e_npp2', 'Comparé con otra clínica.', { rating: 3 }),
    ],
  },
  conflicting_purchase_paths: {
    request: req('h_cpp'), speakerHints: { c1: { speaker_ref: 'a' }, c2: { speaker_ref: 'b' }, c3: { speaker_ref: 'c' }, c4: { speaker_ref: 'd' } },
    records: [
      rev('c1', 'e_cpp1', 'Me lo recomendaron y contraté el mismo día.', { rating: 5 }),
      rev('c2', 'e_cpp2', 'Ya soy cliente, fue rápido.', { rating: 5 }),
      rev('c3', 'e_cpp3', 'Comparé con otra clínica por semanas antes de decidir.', { rating: 3 }),
      rev('c4', 'e_cpp4', 'Estuve viendo otras opciones mucho tiempo, ¿de verdad funciona?', { rating: 3 }),
    ],
  },
  mixed_channels: {
    request: req('h_mc'), speakerHints: { m1: { speaker_ref: 'a' }, m2: { speaker_ref: 'b' }, m3: { speaker_ref: 'c' } },
    records: [
      rev('m1', 'e_mc1', 'Vi el anuncio en instagram y entré a su página.', { rating: 4 }),
      rev('m2', 'e_mc2', 'Busqué en google y pregunté por whatsapp.', { rating: 4 }),
      rev('m3', 'e_mc3', 'Me lo recomendaron.', { rating: 5 }),
    ],
  },
  channel_no_attribution: {
    request: req('h_cna'), speakerHints: { z1: { speaker_ref: 'a' }, z2: { speaker_ref: 'b' } },
    records: [
      rev('z1', 'e_cna1', 'Vi el anuncio en facebook y ya soy cliente.', { rating: 5 }),
      rev('z2', 'e_cna2', 'Busqué en google y contraté.', { rating: 5 }),
    ],
  },
  b2b_multiple_roles: {
    request: { business_ref: 'h_b2b', product_or_service: 'agencia B2B', objectives: ['CUSTOMER_PROBLEMS'], language: 'es' },
    speakerHints: { r1: { speaker_ref: 'a' }, r2: { speaker_ref: 'b' }, r3: { speaker_ref: 'c' } },
    records: [
      rev('r1', 'e_b2b1', 'Quiero resultados medibles, ya probé otra agencia y no funcionó.', { rating: 4 }),
      rev('r2', 'e_b2b2', 'El reporte llega tarde y el proceso no me quedó claro.', { rating: 3 }),
      rev('r3', 'e_b2b3', '¿Tienen garantía de resultados?', { rating: 4 }),
    ],
    businessInput: {
      mode: 'B2B',
      icp_input: { industry: 'ecommerce', company_size: 'SMALL' },
      buying_roles: [
        { role: 'DECISION_MAKER', party_ref: 'ceo', job_title: 'CEO', authority_evidence_refs: ['e_b2b1'] },
        { role: 'CHAMPION', party_ref: 'mkt', evidence_refs: ['e_b2b2'] },
        { role: 'END_USER', party_ref: 'analyst', evidence_refs: ['e_b2b3'] },
      ],
      role_journey_evidence: { DECISION_MAKER: { evidence_refs: ['e_b2b1'] }, CHAMPION: { evidence_refs: ['e_b2b2'] }, END_USER: { evidence_refs: ['e_b2b3'] } },
    },
  },
  champion_buyer_disagree: {
    request: { business_ref: 'h_cbd', product_or_service: 'software B2B', objectives: ['CUSTOMER_PROBLEMS'], language: 'es' },
    speakerHints: { d1: { speaker_ref: 'a' }, d2: { speaker_ref: 'b' } },
    records: [
      rev('d1', 'e_cbd1', 'Como responsable de marketing, quiero resultados reales.', { rating: 4 }),
      rev('d2', 'e_cbd2', 'Está muy caro para el presupuesto.', { rating: 2 }),
    ],
    businessInput: {
      mode: 'B2B', icp_input: { industry: 'saas', company_size: 'MID' },
      buying_roles: [
        { role: 'CHAMPION', party_ref: 'mkt', evidence_refs: ['e_cbd1'] },
        { role: 'ECONOMIC_BUYER', party_ref: 'cfo', job_title: 'CFO', authority_evidence_refs: ['e_cbd2'] },
      ],
      role_journey_evidence: { CHAMPION: { evidence_refs: ['e_cbd1'] }, ECONOMIC_BUYER: { evidence_refs: ['e_cbd2'] } },
    },
  },
  strong_voc_sparse_transitions: {
    request: req('h_svst'),
    speakerHints: Object.fromEntries('12345678'.split('').map(n => ['s' + n, { speaker_ref: 'sp' + n }])),
    records: '12345678'.split('').map(n => rev('s' + n, 'e_svst' + n, ['Muy caro.', 'El servicio lento.', 'Me da miedo que no funcione.', 'Quiero resultados.', 'El proceso confuso.', 'Tardaron en responder.', 'No me pareció caro, vale la pena.', '¿Tienen garantía?'][+n - 1], { rating: 3 })),
  },
  historical_vs_current: {
    request: req('h_hvc'),
    speakerHints: { o1: { speaker_ref: 'a' }, o2: { speaker_ref: 'b' }, n1: { speaker_ref: 'c' }, n2: { speaker_ref: 'd' } },
    records: [
      rev('o1', 'e_hvc1', 'Hace tiempo el proceso era confuso y lento.', { rating: 2, created_at: '2024-01-10T00:00:00Z' }),
      rev('o2', 'e_hvc2', 'Antes tardaban mucho en responder.', { rating: 2, created_at: '2024-02-10T00:00:00Z' }),
      rev('n1', 'e_hvc3', 'Ahora quiero resultados y me atendieron rápido.', { rating: 5, created_at: '2026-08-20T00:00:00Z' }),
      rev('n2', 'e_hvc4', 'Excelente, ya soy cliente.', { rating: 5, created_at: '2026-08-25T00:00:00Z' }),
    ],
  },
  fictional_emotional_job: {
    request: req('h_fej'), speakerHints: { f1: { speaker_ref: 'a' }, f2: { speaker_ref: 'b' }, f3: { speaker_ref: 'c' } },
    records: [
      rev('f1', 'e_fej1', 'Quiero resultados rápidos y buen precio.', { rating: 4 }),
      rev('f2', 'e_fej2', 'Necesito que funcione y sea conveniente.', { rating: 4 }),
      rev('f3', 'e_fej3', 'Busco calidad y rapidez.', { rating: 4 }),
    ],
    // NO emotional language -> emotional_job MUST be UNKNOWN (no "wants to feel successful")
  },
  generic_funnel_template: {
    request: req('h_gft'), speakerHints: { g1: { speaker_ref: 'a' }, g2: { speaker_ref: 'b' } },
    records: [
      rev('g1', 'e_gft1', 'Muy caro.', { rating: 2 }),
      rev('g2', 'e_gft2', 'Me da miedo que duela.', { rating: 3 }),
    ],
    // only 2 disconnected states from different speakers -> NO transition may be fabricated
  },
  one_customer_repeated: {
    request: req('h_ocr'),
    speakerHints: Object.fromEntries('12345'.split('').map(n => ['r' + n, { speaker_ref: 'same' }])),
    records: '12345'.split('').map(n => rev('r' + n, 'e_ocr' + n, ['Muy caro.', 'Está caro.', 'Sigue caro.', 'Demasiado caro.', 'Caro de nuevo.'][+n - 1], { rating: 2 })),
  },
};

module.exports = { REFERENCE_TIME, VERTICALS, ADVERSARIAL, rev };
