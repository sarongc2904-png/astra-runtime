'use strict';
// [ASTRA-11D benchmark] Frozen deterministic research fixtures. Provider-shaped payloads
// that flow through ASTRA-11C. NO real data, NO network, NO LLM.
// Covers 6 verticals + 8 adversarial cases (spec §14).
const REFERENCE_TIME = '2026-09-09T00:00:00Z';

function listing(source_id, competitor_ref, evidence_ref, L, geo) {
  return { provider_hint: 'research_listing', source_category: 'WEB_PAGE', source_id, competitor_ref, competitor_label: competitor_ref, evidence_ref, geography: geo || null, captured_at: '2026-09-01T00:00:00Z', listing: L };
}
function review(source_id, evidence_ref, text, rating, aspect, created_at) {
  return { provider_hint: 'research_review', source_category: 'REVIEW', source_id, evidence_ref, review_text: text, rating, aspect, created_at: created_at || '2026-08-10T00:00:00Z', captured_at: '2026-09-01T00:00:00Z' };
}
function demand(source_id, evidence_ref, kind, value, demand_class, window) {
  return { provider_hint: 'research_demand', source_category: 'ANALYTICS_EVENT', source_id, evidence_ref, captured_at: '2026-09-01T00:00:00Z', demand: { kind, value, demand_class, window: window || null } };
}

// ---------------- 6 verticals ----------------
const VERTICALS = {
  dental_clinic: {
    request: { business_ref: 'ent_v_dental', product_or_service: 'clínica dental', geography: { country: 'MX' }, target_customer: 'pacientes locales', objectives: ['PRICING', 'MESSAGING', 'OFFERS', 'CUSTOMER_PROBLEMS'] },
    records: [
      listing('d1', 'dclinic_a', 'ev_d1', { price: 9990, currency: 'MXN', headline: 'Blanqueamiento en una cita', promise: 'Sonrisa blanca hoy', guarantee: 'Garantía de 30 días', financing: '12 MSI', proof: '+500 pacientes atendidos', cta: 'Agenda tu cita', published_at: '2026-08-01T00:00:00Z' }, { country: 'MX' }),
      listing('d2', 'dclinic_b', 'ev_d2', { price: 12500, currency: 'MXN', headline: 'Odontología estética premium', promise: 'Resultados duraderos', financing: '6 MSI', mechanism: 'Sistema de blanqueo LED', cta: 'Reserva ahora', published_at: '2026-08-02T00:00:00Z' }, { country: 'MX' }),
      listing('d3', 'dclinic_c', 'ev_d3', { price: 7900, currency: 'MXN', headline: 'Precio claro y accesible', promise: 'Sin sorpresas', cta: 'Cotiza gratis', published_at: '2026-08-03T00:00:00Z' }, { country: 'MX' }),
      review('dr1', 'ev_dr1', 'Pregunté precio por WhatsApp y nunca me respondieron, muy lento', 2, 'COMPLAINT', '2026-08-04T00:00:00Z'),
      review('dr2', 'ev_dr2', 'Tenía miedo de que doliera pero todo bien', 4, 'FEAR', '2026-08-06T00:00:00Z'),
      review('dr3', 'ev_dr3', 'Excelente resultado, muy recomendable', 5, null, '2026-08-08T00:00:00Z'),
      demand('dd1', 'ev_dd1', 'search_evidence', 320, 'PROXY', { start: '2026-07-01', end: '2026-08-31' }),
    ],
  },
  laser_aesthetics: {
    request: { business_ref: 'ent_v_laser', product_or_service: 'depilación láser', geography: { country: 'MX' }, objectives: ['PRICING', 'OFFERS', 'MESSAGING'] },
    records: [
      listing('l1', 'laser_a', 'ev_l1', { price: 1500, currency: 'MXN', pricing_kind: 'SUBSCRIPTION', headline: 'Paquete de 6 sesiones', promise: 'Piel suave sin vello', trial: 'Primera sesión de prueba', financing: 'Meses sin intereses', published_at: '2026-08-01T00:00:00Z' }),
      listing('l2', 'laser_b', 'ev_l2', { price: 1800, currency: 'MXN', pricing_kind: 'SUBSCRIPTION', headline: 'Tecnología de última generación', promise: 'Resultados garantizados', guarantee: 'Sesión gratis si no ves resultados', proof: 'Antes y después reales', published_at: '2026-08-02T00:00:00Z' }),
      listing('l3', 'laser_c', 'ev_l3', { price: 990, currency: 'MXN', pricing_kind: 'ONE_TIME', headline: 'Promo de temporada', discount: '40% de descuento', scarcity: 'Solo este mes', published_at: '2026-08-03T00:00:00Z' }),
      review('lr1', 'ev_lr1', 'Los precios cambian cada vez que pregunto', 2, 'OBJECTION', '2026-08-05T00:00:00Z'),
    ],
  },
  restaurant: {
    request: { business_ref: 'ent_v_rest', product_or_service: 'restaurante local', geography: { city: 'GDL' }, objectives: ['MESSAGING', 'CUSTOMER_PROBLEMS', 'DEMAND_SIGNALS'] },
    records: [
      listing('rs1', 'rest_a', 'ev_rs1', { headline: 'Cocina de autor', promise: 'Una experiencia inolvidable', delivery_time: 'Reservas el mismo día', published_at: '2026-08-01T00:00:00Z' }),
      listing('rs2', 'rest_b', 'ev_rs2', { headline: 'Comida casera', promise: 'Como en casa', discount: '2x1 los martes', published_at: '2026-08-02T00:00:00Z' }),
      review('rr1', 'ev_rr1', 'La comida rica pero el servicio tardó mucho', 3, 'COMPLAINT', '2026-08-04T00:00:00Z'),
      review('rr2', 'ev_rr2', 'Quería reservar y no contestan el teléfono', 2, 'PURCHASE_BARRIER', '2026-08-05T00:00:00Z'),
      review('rr3', 'ev_rr3', 'Ambiente increíble, volveré', 5, 'DESIRE', '2026-08-07T00:00:00Z'),
      demand('rd1', 'ev_rd1', 'review_volume', 3, 'DIRECT'),
    ],
  },
  local_professional_service: {
    request: { business_ref: 'ent_v_law', product_or_service: 'despacho legal', geography: { country: 'MX' }, objectives: ['PRICING', 'MESSAGING', 'OFFERS'] },
    records: [
      listing('p1', 'law_a', 'ev_p1', { price: 5000, currency: 'MXN', pricing_kind: 'STARTING_PRICE', headline: 'Asesoría legal accesible', promise: 'Resolvemos tu caso', guarantee: 'Primera consulta sin costo', mechanism: 'Proceso en 3 etapas', proof: '15 años de experiencia', published_at: '2026-08-01T00:00:00Z' }),
      listing('p2', 'law_b', 'ev_p2', { price: 8000, currency: 'MXN', pricing_kind: 'STARTING_PRICE', headline: 'Abogados especialistas', promise: 'Defiende tus derechos', mechanism: 'Estrategia personalizada', proof: 'Casos ganados verificables', published_at: '2026-08-02T00:00:00Z' }),
      listing('p3', 'law_c', 'ev_p3', { price: 6500, currency: 'MXN', pricing_kind: 'STARTING_PRICE', headline: 'Solución rápida', promise: 'Sin trámites eternos', mechanism: 'Digitalizamos tu proceso', proof: 'Reseñas 4.8 estrellas', published_at: '2026-08-03T00:00:00Z' }),
      review('pr1', 'ev_pr1', 'Cobran extra por cosas que no avisaron', 2, 'OBJECTION', '2026-08-05T00:00:00Z'),
    ],
  },
  b2b_service: {
    request: { business_ref: 'ent_v_b2b', product_or_service: 'agencia de marketing B2B', geography: { country: 'MX' }, objectives: ['PRICING', 'MESSAGING', 'OFFERS', 'COMPETITOR_LANDSCAPE'] },
    records: [
      listing('b1', 'agency_a', 'ev_b1', { price: 25000, currency: 'MXN', pricing_kind: 'SUBSCRIPTION', headline: 'Crecimiento predecible para SaaS', promise: 'Más pipeline calificado', mechanism: 'Sistema de demand gen en 90 días', proof: '32 casos B2B documentados', guarantee: 'Garantía de resultados a 90 días', support: 'Slack dedicado', implementation: 'Onboarding en 2 semanas', published_at: '2026-08-01T00:00:00Z' }),
      listing('b2', 'agency_b', 'ev_b2', { price: 40000, currency: 'MXN', pricing_kind: 'SUBSCRIPTION', headline: 'Marketing para empresas serias', promise: 'ROI medible', mechanism: 'Modelo de atribución propio', proof: 'Dashboards en vivo', implementation: 'Kickoff estructurado', published_at: '2026-08-02T00:00:00Z' }),
      listing('b3', 'agency_c', 'ev_b3', { price: 18000, currency: 'MXN', pricing_kind: 'SUBSCRIPTION', headline: 'Escala tu adquisición', promise: 'De MQL a SQL', mechanism: 'Playbooks probados', proof: 'Benchmarks por industria', published_at: '2026-08-03T00:00:00Z' }),
      review('br1', 'ev_br1', 'Prometieron leads y tardaron meses en arrancar', 2, 'COMPLAINT', '2026-08-05T00:00:00Z'),
      review('br2', 'ev_br2', 'Buen equipo pero el reporte llega tarde siempre', 3, 'COMPLAINT', '2026-08-06T00:00:00Z'),
    ],
  },
  digital_product_education: {
    request: { business_ref: 'ent_v_course', product_or_service: 'curso online de marketing', geography: { country: 'MX' }, objectives: ['PRICING', 'MESSAGING', 'OFFERS', 'CUSTOMER_PROBLEMS'] },
    records: [
      listing('e1', 'course_a', 'ev_e1', { price: 3990, currency: 'MXN', pricing_kind: 'ONE_TIME', headline: 'Domina Meta Ads en 30 días', promise: 'Campañas rentables sin agencia', mechanism: 'Método de 5 fases', proof: '1200 alumnos', bonus: 'Plantillas de campañas', guarantee: 'Garantía de 14 días', published_at: '2026-08-01T00:00:00Z' }),
      listing('e2', 'course_b', 'ev_e2', { price: 5990, currency: 'MXN', pricing_kind: 'ONE_TIME', headline: 'Certificación en performance', promise: 'Conviértete en trafficker', mechanism: 'Currículo por competencias', proof: 'Comunidad activa', bonus: 'Mentorías grupales', published_at: '2026-08-02T00:00:00Z' }),
      listing('e3', 'course_c', 'ev_e3', { price: 1490, currency: 'MXN', pricing_kind: 'ONE_TIME', headline: 'Curso exprés de anuncios', promise: 'Empieza hoy', discount: '50% lanzamiento', scarcity: 'Cupos limitados', published_at: '2026-08-03T00:00:00Z' }),
      review('er1', 'ev_er1', 'El contenido bien pero nunca respondieron mis dudas', 3, 'COMPLAINT', '2026-08-05T00:00:00Z'),
      review('er2', 'ev_er2', 'Me daba miedo que fuera relleno, pero valió la pena', 4, 'FEAR', '2026-08-06T00:00:00Z'),
    ],
  },
};

// ---------------- 8 adversarial cases ----------------
const ADVERSARIAL = {
  very_little_evidence: {
    request: { business_ref: 'ent_a1', product_or_service: 'servicio X', objectives: ['PRICING', 'MESSAGING'] },
    records: [listing('a1', 'x_a', 'ev_a1', { price: 1000, currency: 'MXN', headline: 'Servicio X', published_at: '2026-08-01T00:00:00Z' })],
  },
  conflicting_pricing: {
    request: { business_ref: 'ent_a2', product_or_service: 'servicio Y', objectives: ['PRICING'] },
    records: [
      listing('a2a', 'y_a', 'ev_a2a', { price: 999, currency: 'MXN', pricing_kind: 'LISTED_PRICE', published_at: '2026-08-01T00:00:00Z' }),
      { provider_hint: 'research_listing', source_category: 'WEB_PAGE', source_id: 'a2b', competitor_ref: 'y_a', competitor_label: 'y_a', evidence_ref: 'ev_a2b', captured_at: '2026-09-01T00:00:00Z', listing: { price: 1499, currency: 'MXN', pricing_kind: 'LISTED_PRICE', published_at: '2026-08-02T00:00:00Z' } },
      listing('a2c', 'y_b', 'ev_a2c', { price: 1200, currency: 'MXN', published_at: '2026-08-03T00:00:00Z' }),
    ],
  },
  stale_reviews: {
    request: { business_ref: 'ent_a3', product_or_service: 'servicio Z', objectives: ['CUSTOMER_PROBLEMS'] },
    records: [
      review('a3a', 'ev_a3a', 'El servicio fue lento hace tiempo', 2, 'COMPLAINT', '2023-01-01T00:00:00Z'),
      review('a3b', 'ev_a3b', 'Antes cobraban de más', 2, 'OBJECTION', '2023-02-01T00:00:00Z'),
    ],
  },
  single_competitor: {
    request: { business_ref: 'ent_a4', product_or_service: 'nicho raro', geography: { country: 'MX' }, research_scope: { scope: 'CATEGORY' }, objectives: ['PRICING', 'MESSAGING'] },
    records: [listing('a4', 'only_a', 'ev_a4', { price: 5000, currency: 'MXN', headline: 'El único proveedor', promise: 'Somos los mejores', published_at: '2026-08-01T00:00:00Z' }, { country: 'MX' })],
  },
  no_customer_evidence: {
    request: { business_ref: 'ent_a5', product_or_service: 'servicio W', objectives: ['CUSTOMER_PROBLEMS', 'PRICING'] },
    records: [
      listing('a5a', 'w_a', 'ev_a5a', { price: 2000, currency: 'MXN', headline: 'Servicio W premium', published_at: '2026-08-01T00:00:00Z' }),
      listing('a5b', 'w_b', 'ev_a5b', { price: 2200, currency: 'MXN', headline: 'Servicio W accesible', published_at: '2026-08-02T00:00:00Z' }),
    ],
  },
  misleading_provider_metadata: {
    // a raw payload carrying vendor ids that must be stripped; and an adapter-leak attempt.
    request: { business_ref: 'ent_a6', product_or_service: 'servicio V', objectives: ['MESSAGING'] },
    records: [
      { provider_hint: 'meta_ads', source_id: 'a6', source_category: 'ADVERTISEMENT', ad_creative_body: 'El más rápido del mercado', first_seen: '2026-08-01T00:00:00Z', captured_at: '2026-09-01T00:00:00Z', evidence_ref: 'ev_a6', ad_id: '999999', page_id: 'p_999', fbclid: 'abc', utm_source: 'ig' },
    ],
  },
  duplicate_evidence: {
    request: { business_ref: 'ent_a7', product_or_service: 'servicio U', objectives: ['PRICING'] },
    records: [
      listing('a7', 'u_a', 'ev_a7', { price: 3000, currency: 'MXN', published_at: '2026-08-01T00:00:00Z' }),
      listing('a7', 'u_a', 'ev_a7', { price: 3000, currency: 'MXN', published_at: '2026-08-01T00:00:00Z' }), // exact dup
    ],
  },
  high_volume_duplicated_reviews: {
    request: { business_ref: 'ent_a8', product_or_service: 'servicio T', objectives: ['CUSTOMER_PROBLEMS', 'DEMAND_SIGNALS'] },
    records: Array.from({ length: 6 }, (_, i) => review(`a8_${i}`, `ev_a8_${i}`, 'Nunca me respondieron el mensaje', 2, 'COMPLAINT', '2026-08-10T00:00:00Z'))
      .map((r, i) => i === 0 ? r : { ...r, review_text: 'Nunca me respondieron el mensaje' }), // identical verbatim, different source_id -> CONTENT_DUPLICATE
  },
};

// legacy exports (preserve the original benchmark surface)
const COMPETITOR_SOURCES = VERTICALS.dental_clinic.records.filter(r => r.provider_hint === 'research_listing');
const DIRECTORY_SOURCE = [ADVERSARIAL.conflicting_pricing.records[1]];
const REVIEW_SOURCES = VERTICALS.dental_clinic.records.filter(r => r.provider_hint === 'research_review');
function inferredObservation() {
  const { makeNormalizedObservation } = require('../../src/commercial/normalization/normalized_observation');
  const { makeSubjectRef } = require('../../src/commercial/evidence/subject_resolution');
  return makeNormalizedObservation({
    observation_type: 'TEXT',
    content: { text: 'El mercado probablemente crecerá 20% este año', normalized_text: 'el mercado probablemente crecerá 20% este año' },
    source_ref: 'analyst_note_1', provenance_class: 'INFERRED', subject: makeSubjectRef({ subject_type: 'Market' }),
  });
}

module.exports = { REFERENCE_TIME, VERTICALS, ADVERTISED: undefined, ADVERSARIAL, COMPETITOR_SOURCES, DIRECTORY_SOURCE, REVIEW_SOURCES, inferredObservation };
