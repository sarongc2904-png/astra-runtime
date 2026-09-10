'use strict';
// [ASTRA-11F benchmark] Frozen deterministic Voice-of-Customer fixtures. Customer-authored
// review/conversation payloads -> ASTRA-11C ingestion -> ASTRA-11D research -> ASTRA-11F VoC.
// NO real data, NO network, NO LLM. 6 verticals + 15 adversarial cases.
const REFERENCE_TIME = '2026-09-09T00:00:00Z';

function rev(source_id, evidence_ref, text, opts = {}) {
  return {
    provider_hint: 'research_review', source_category: 'REVIEW', source_id, evidence_ref,
    review_text: text, rating: opts.rating != null ? opts.rating : 4, lang: opts.lang || 'es',
    created_at: opts.created_at || '2026-08-10T00:00:00Z', captured_at: '2026-09-01T00:00:00Z',
    ...(opts.competitor_ref ? { competitor_ref: opts.competitor_ref } : {}),
  };
}
function biz(source_id, evidence_ref, headline, promise) {
  return { provider_hint: 'research_listing', source_category: 'WEB_PAGE', source_id, competitor_ref: 'own_' + source_id, evidence_ref, captured_at: '2026-09-01T00:00:00Z', listing: { headline, promise, published_at: '2026-08-01T00:00:00Z' } };
}

const VERTICALS = {
  dental_clinic: {
    request: { business_ref: 'v_dental', product_or_service: 'clínica dental', objectives: ['CUSTOMER_PROBLEMS'], language: 'es' },
    speakerHints: { d1: { speaker_ref: 'c1' }, d2: { speaker_ref: 'c2' }, d3: { speaker_ref: 'c3' }, d4: { speaker_ref: 'c4' }, d5: { speaker_ref: 'c5' }, d6: { speaker_ref: 'c6' }, d7: { speaker_ref: 'c7' }, d8: { speaker_ref: 'c1' }, d9: { speaker_ref: 'c8' }, d10: { speaker_ref: 'c9' } },
    records: [
      rev('d1', 'e_d1', 'Me gustó el tratamiento, pero está muy caro y me da miedo que duela.', { rating: 4 }),
      rev('d2', 'e_d2', 'Pregunté precio por WhatsApp y nunca me respondieron, muy lento.', { rating: 2 }),
      rev('d3', 'e_d3', 'Pensé que dolería pero no dolió nada. Excelente valor.', { rating: 5 }),
      rev('d4', 'e_d4', 'Muy caro para lo que ofrecen. ¿Tienen meses sin intereses?', { rating: 3 }),
      rev('d5', 'e_d5', 'Tardaron días en confirmar la cita, me desesperé.', { rating: 2 }),
      rev('d6', 'e_d6', 'Muy cerca de mi casa y el proceso no me quedó claro al principio.', { rating: 4 }),
      rev('d7', 'e_d7', 'Vi otra clínica más barata pero me recomendó un amigo. Quedé feliz.', { rating: 5 }),
      rev('d8', 'e_d8', 'Sigue siendo caro, la verdad, aunque el resultado fue bueno.', { rating: 4 }),
      rev('d9', 'e_d9', 'No me pareció caro, vale la pena. ¿Cuánto dura el blanqueamiento?', { rating: 5 }),
      rev('d10', 'e_d10', 'Tenía miedo de que doliera, pero todo bien. Muy recomendable.', { rating: 5 }),
    ],
  },
  laser_aesthetics: {
    request: { business_ref: 'v_laser', product_or_service: 'depilación láser', objectives: ['CUSTOMER_PROBLEMS'], language: 'es' },
    speakerHints: { l1: { speaker_ref: 'la1' }, l2: { speaker_ref: 'la2' }, l3: { speaker_ref: 'la3' }, l4: { speaker_ref: 'la4' }, l5: { speaker_ref: 'la5' }, l6: { speaker_ref: 'la6' } },
    records: [
      rev('l1', 'e_l1', 'Los precios cambian cada vez que pregunto, no me genera confianza.', { rating: 2 }),
      rev('l2', 'e_l2', 'Me da miedo que me queme la piel.', { rating: 3 }),
      rev('l3', 'e_l3', 'Quiero resultados reales, ya probé cremas y no funcionó.', { rating: 4 }),
      rev('l4', 'e_l4', 'Excelente valor y muy rápido, en el mismo día me atendieron.', { rating: 5 }),
      rev('l5', 'e_l5', '¿Tienen garantía si no veo resultados?', { rating: 4 }),
      rev('l6', 'e_l6', 'Caro pero vale la pena por la tecnología que usan.', { rating: 4 }),
    ],
  },
  restaurant: {
    request: { business_ref: 'v_rest', product_or_service: 'restaurante', objectives: ['CUSTOMER_PROBLEMS'], language: 'es' },
    speakerHints: { rr1: { speaker_ref: 'ra1' }, rr2: { speaker_ref: 'ra2' }, rr3: { speaker_ref: 'ra3' }, rr4: { speaker_ref: 'ra4' } },
    records: [
      rev('rr1', 'e_rr1', 'La comida rica pero el servicio tardó muchísimo.', { rating: 3 }),
      rev('rr2', 'e_rr2', 'Quería reservar y no contestan el teléfono.', { rating: 2 }),
      rev('rr3', 'e_rr3', 'Ambiente increíble, volveré. Muy buen valor.', { rating: 5 }),
      rev('rr4', 'e_rr4', 'Un poco caro para las porciones, pero el sabor excelente.', { rating: 4 }),
    ],
  },
  local_service: {
    request: { business_ref: 'v_law', product_or_service: 'despacho legal', objectives: ['CUSTOMER_PROBLEMS'], language: 'es' },
    speakerHints: { p1: { speaker_ref: 'pa1' }, p2: { speaker_ref: 'pa2' }, p3: { speaker_ref: 'pa3' }, p4: { speaker_ref: 'pa4' } },
    records: [
      rev('p1', 'e_p1', 'Cobran extra por cosas que no avisaron, no me generó confianza.', { rating: 2 }),
      rev('p2', 'e_p2', 'Resolvieron mi caso rápido, muy recomendable.', { rating: 5 }),
      rev('p3', 'e_p3', 'El proceso no me quedó claro y tardaron en responder.', { rating: 3 }),
      rev('p4', 'e_p4', '¿Cuánto cuesta una consulta y tienen financiamiento?', { rating: 4 }),
    ],
  },
  b2b_service: {
    request: { business_ref: 'v_b2b', product_or_service: 'agencia de marketing B2B', objectives: ['CUSTOMER_PROBLEMS'], language: 'es' },
    speakerHints: { b1: { speaker_ref: 'ba1' }, b2: { speaker_ref: 'ba2' }, b3: { speaker_ref: 'ba3' }, b4: { speaker_ref: 'ba4' }, b5: { speaker_ref: 'ba5' } },
    records: [
      rev('b1', 'e_b1', 'Prometieron leads y tardaron meses en arrancar, muy lento.', { rating: 2 }),
      rev('b2', 'e_b2', 'Buen equipo pero el reporte llega tarde siempre.', { rating: 3 }),
      rev('b3', 'e_b3', 'Quiero resultados medibles, ya intenté antes con otra agencia y no funcionó.', { rating: 4 }),
      rev('b4', 'e_b4', 'Caro pero vale lo que cuesta por la expertise.', { rating: 4 }),
      rev('b5', 'e_b5', '¿Cómo funciona el proceso de onboarding?', { rating: 4 }),
    ],
  },
  digital_education: {
    request: { business_ref: 'v_course', product_or_service: 'curso online de marketing', objectives: ['CUSTOMER_PROBLEMS'], language: 'es' },
    speakerHints: { e1: { speaker_ref: 'ea1' }, e2: { speaker_ref: 'ea2' }, e3: { speaker_ref: 'ea3' }, e4: { speaker_ref: 'ea4' }, e5: { speaker_ref: 'ea5' } },
    records: [
      rev('e1', 'e_e1', 'El contenido bien pero nunca respondieron mis dudas.', { rating: 3 }),
      rev('e2', 'e_e2', 'Me daba miedo que fuera relleno, pero valió la pena.', { rating: 4 }),
      rev('e3', 'e_e3', 'Muy caro para ser un curso grabado.', { rating: 2 }),
      rev('e4', 'e_e4', 'Excelente, resultados reales en mis campañas. Muy recomendable.', { rating: 5 }),
      rev('e5', 'e_e5', '¿Tienen garantía de devolución si no me gusta?', { rating: 4 }),
    ],
  },
};

const ADVERSARIAL = {
  business_copy_mixed: {
    request: { business_ref: 'a1', product_or_service: 'x', objectives: ['CUSTOMER_PROBLEMS'], language: 'es' },
    records: [rev('a1r', 'e_a1r', 'Muy caro, tardaron en responder.', { rating: 2 }), biz('a1b', 'e_a1b', 'El mejor precio garantizado', 'Blanqueamiento sin dolor')],
  },
  competitor_copy_mixed: {
    request: { business_ref: 'a2', product_or_service: 'x', objectives: ['CUSTOMER_PROBLEMS'], language: 'es' },
    records: [rev('a2r', 'e_a2r', 'Me gustó pero está caro.', { rating: 3 }), rev('a2c', 'e_a2c', 'Somos la clínica número uno de la ciudad.', { competitor_ref: 'rival_co', rating: 5 })],
  },
  same_customer_repeated: {
    request: { business_ref: 'a3', product_or_service: 'x', objectives: ['CUSTOMER_PROBLEMS'], language: 'es' },
    speakerHints: Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`a3_${i}`, { speaker_ref: 'same_person' }])),
    records: Array.from({ length: 5 }, (_, i) => rev(`a3_${i}`, `e_a3_${i}`, 'Está muy caro para lo que ofrecen.', { rating: 2 })),
  },
  duplicate_reviews: {
    request: { business_ref: 'a4', product_or_service: 'x', objectives: ['CUSTOMER_PROBLEMS'], language: 'es' },
    records: Array.from({ length: 4 }, (_, i) => rev(`a4_${i}`, `e_a4_${i}`, 'Nunca me respondieron el mensaje.', { rating: 2 })),
  },
  sarcasm: {
    request: { business_ref: 'a5', product_or_service: 'x', objectives: ['CUSTOMER_PROBLEMS'], language: 'es' },
    records: [rev('a5r', 'e_a5r', 'Qué "rápido" el servicio, solo tardaron dos semanas.', { rating: 1 })],
  },
  negation: {
    request: { business_ref: 'a6', product_or_service: 'x', objectives: ['CUSTOMER_PROBLEMS'], language: 'es' },
    speakerHints: { a6r: { speaker_ref: 's6' } },
    records: [rev('a6r', 'e_a6r', 'No me pareció caro y no dolió nada.', { rating: 5 })],
  },
  mixed_sentiment: {
    request: { business_ref: 'a7', product_or_service: 'x', objectives: ['CUSTOMER_PROBLEMS'], language: 'es' },
    records: [rev('a7r', 'e_a7r', 'El resultado excelente, pero muy caro y tardaron mucho.', { rating: 3 })],
  },
  multi_aspect_sentence: {
    request: { business_ref: 'a8', product_or_service: 'x', objectives: ['CUSTOMER_PROBLEMS'], language: 'es' },
    records: [rev('a8r', 'e_a8r', 'Me gustó el tratamiento, pero está muy caro y me da miedo que duela y el proceso no me quedó claro.', { rating: 3 })],
  },
  unknown_speaker: {
    request: { business_ref: 'a9', product_or_service: 'x', objectives: ['CUSTOMER_PROBLEMS'], language: 'es' },
    // a forum comment where attribution genuinely cannot be established (marked UNKNOWN by the analyst)
    speakerHints: { a9r: { role: 'UNKNOWN_CUSTOMER_ROLE' } },
    records: [{ provider_hint: 'research_review', source_category: 'SOCIAL_COMMENT', source_id: 'a9r', evidence_ref: 'e_a9r', review_text: 'Está caro eso.', rating: 2, lang: 'es', created_at: '2026-08-10T00:00:00Z', captured_at: '2026-09-01T00:00:00Z' }],
  },
  stale_feedback: {
    request: { business_ref: 'a10', product_or_service: 'x', objectives: ['CUSTOMER_PROBLEMS'], language: 'es' },
    speakerHints: { a10a: { speaker_ref: 's10a' }, a10b: { speaker_ref: 's10b' } },
    records: [rev('a10a', 'e_a10a', 'Muy caro.', { rating: 2, created_at: '2023-01-01T00:00:00Z' }), rev('a10b', 'e_a10b', 'Tardaron mucho.', { rating: 2, created_at: '2023-02-01T00:00:00Z' })],
  },
  two_languages: {
    request: { business_ref: 'a11', product_or_service: 'x', objectives: ['CUSTOMER_PROBLEMS'], language: 'es' },
    records: [rev('a11a', 'e_a11a', 'Está muy caro.', { rating: 2 }), rev('a11b', 'e_a11b', 'Too expensive and slow service.', { rating: 2, lang: 'en' })],
  },
  very_small_sample: {
    request: { business_ref: 'a12', product_or_service: 'x', objectives: ['CUSTOMER_PROBLEMS'], language: 'es' },
    records: [rev('a12r', 'e_a12r', 'Está caro.', { rating: 3 })],
  },
  conflicting_opinions: {
    request: { business_ref: 'a13', product_or_service: 'x', objectives: ['CUSTOMER_PROBLEMS'], language: 'es' },
    speakerHints: { a13a: { speaker_ref: 's13a' }, a13b: { speaker_ref: 's13b' }, a13c: { speaker_ref: 's13c' }, a13d: { speaker_ref: 's13d' }, a13e: { speaker_ref: 's13e' }, a13f: { speaker_ref: 's13f' } },
    records: [
      rev('a13a', 'e_a13a', 'Muy caro.', { rating: 2 }), rev('a13b', 'e_a13b', 'Está caro para lo que es.', { rating: 2 }), rev('a13c', 'e_a13c', 'Demasiado caro.', { rating: 1 }),
      rev('a13d', 'e_a13d', 'Excelente valor, vale la pena.', { rating: 5 }), rev('a13e', 'e_a13e', 'No me pareció caro, buen precio.', { rating: 5 }), rev('a13f', 'e_a13f', 'Vale lo que cuesta.', { rating: 5 }),
    ],
  },
  customer_mentions_competitor: {
    request: { business_ref: 'a14', product_or_service: 'x', objectives: ['CUSTOMER_PROBLEMS'], language: 'es' },
    records: [rev('a14r', 'e_a14r', 'Vi otra clínica más barata pero me recomendó un amigo esta.', { rating: 4 })],
  },
  customer_changed_mind: {
    request: { business_ref: 'a15', product_or_service: 'x', objectives: ['CUSTOMER_PROBLEMS'], language: 'es' },
    speakerHints: { a15r: { speaker_ref: 's15' } },
    records: [rev('a15r', 'e_a15r', 'Al principio pensé que era muy caro, pero después vi que vale la pena.', { rating: 4 })],
  },
};

module.exports = { REFERENCE_TIME, VERTICALS, ADVERSARIAL };
