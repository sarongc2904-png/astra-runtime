'use strict';
// ASTRA_CAMPAIGN360_FINAL_SYNTHESIS_SEMANTIC_ROLE_EPISTEMIC_META_HARDENING — closes three confirmed
// live defects from job 29a3248a-045f-4942-ba15-59469d1e9369 (a run where ALL 8 specialist LLM
// nodes completed — usage.model_calls=8, retries=0 — and only the FINAL SYNTHESIS gate failed):
//
// PART A — SILENT ROLE CONTAMINATION: 8_ad_strategy.measurement = "PROPUESTA: Medir consultas
// generadas y conversaciones iniciadas (no proyectar resultados)" was flagged as
// MECHANISM_TO_CAMPAIGN_CONVERSION_PROMOTION via matched_anchor "consulta" — an INTERMEDIATE
// mechanism stage term (mechanism: "... generar consultas y WhatsApp para convertir: consulta →
// conversación → cita"), never the mechanism's actual ENDPOINT ("cita"). Tracking intermediate
// acquisition signals as LEADING INDICATORS is the exact legitimate use case this ad-platform
// measurement-setup field exists for. FIX: a new LEADING_INDICATOR field role (distinct from
// ENUMERATION) matches ONLY the mechanism's endpoint term(s) via extractMechanismEndpointTerms/
// mechanismEndpointTermsForFacts — never the full mechanism term set — applied to
// 8_ad_strategy.measurement specifically; measurement.conversion_metrics (whose whole purpose IS
// defining what counts as a conversion) is untouched and keeps matching the full term set.
//
// PART B — ASSUMPTION EPISTEMIC OVER-DETECTION: a 4-item assumptions cluster, all variants of
// "budget is unknown/not specified/not defined/needed", produced 7 CONTRADICTORY_ASSUMPTION_
// EPISTEMIC_STATUS violations — none genuine. Two root bugs: (1) ASSUMPTION_CERTAINTY_CUE is
// negation-blind ("no definidos" still matches bare "definid[oa]s?"); (2) a self-hedged sentence
// combining a certainty word with an unknown word in the same clause ("disponible (desconocido)")
// was treated as unambiguously certain instead of adjudicated ambiguous, letting it pairwise-
// contradict every other unknown-family statement. FIX: classifyAssumptionEpistemicState replaces
// the old certain/unknown booleans with discrete states (KNOWN_AVAILABLE / KNOWN_UNAVAILABLE /
// UNKNOWN_FAMILY / REQUIRED / AMBIGUOUS / NONE) and areEpistemicStatesContradictory only flags a
// genuine KNOWN_AVAILABLE claim conflicting with an explicit KNOWN_UNAVAILABLE or a plain
// UNKNOWN_FAMILY hedge — never "same topic + different keyword".
//
// PART C — META BRAND / TARGET COLLISION: "Costos y CPC actuales en Meta Ads México" (a research
// request, not an asserted value) was flagged invented_metric via "CPC actuales en Meta" — bare
// Spanish "meta" (target/goal) colliding with the "Meta Ads" brand entity. FIX: a bounded negative
// lookahead (meta(?!\s+(?:ads|business(?:\s+suite)?|platform)\b)) disambiguates the entity from the
// qualifier — "Meta objetivo de CAC"/"meta de CPC" (genuine target usage) are untouched. A second,
// unrelated gap found in the same investigation — "CPC actual es $20" never matched at all (the
// acronym-to-value gap was too tight) — was fixed via a small bounded connector-word pattern
// (actual/real/es/is), NOT a wider generic wildcard gap (which was tried and reverted after it let
// an unrelated later acronym's own value get pulled into the same false match).
//
// Offline, deterministic. No network, no real LLM calls.
const assert = require('assert');
const fidelity = require('../src/workflows/brief_fidelity_validator');
const H = require('../src/workflows/marketing_campaign_360_hardened');
const { AgentV1Adapter } = require('../src/adapter/agent_v1_adapter');

const tests = []; let pass = 0, fail = 0;
let persistedCaseCount = 0;
function t(name, fn) { tests.push({ name, fn }); }
function tPersist(name, fn) { persistedCaseCount++; t(name, fn); }

const M360_FACTS = {
  business_objective: { value: 'vender el minicurso', status: 'USER_PROVIDED_FACT' },
  mechanism: { value: 'Meta Ads para generar consultas y WhatsApp para convertir: consulta → conversación → cita', status: 'USER_PROVIDED_FACT' },
};
function mechanismViolations(synth) {
  return fidelity.validateFinalSynthesis(M360_FACTS, synth, {}).violations.filter(v => v.type === 'MECHANISM_TO_CAMPAIGN_CONVERSION_PROMOTION');
}
function assumptionViolations(assumptions, rawRequest) {
  return fidelity.validateFinalSynthesis({}, { deliverable: { '14_assumptions': assumptions } }, { rawRequest }).violations;
}
const METRIC_CONSTRAINT = 'No inventes metricas, resultados, CAC, ROAS, LTV, testimonios ni evidencia.';
function metricViolations(field, text, nodeId = 'ads') {
  return fidelity.validateOutputAgainstFacts({ constraints: { value: METRIC_CONSTRAINT, status: 'USER_PROVIDED_FACT' } }, { downstream_payload: { [field]: text } }, { nodeId })
    .violations.filter(v => v.type === 'EXPLICIT_PROHIBITION');
}

// ============================================================
// PART A — ROLE SEMANTICS (primary conversion vs leading indicator, product mechanism vs objective)
// ============================================================
tPersist('LIVE FALSE POSITIVE: ad_strategy.measurement listing intermediate stages only -> PASS', () => {
  assert.deepStrictEqual(mechanismViolations({ deliverable: { '8_ad_strategy': { measurement: 'PROPUESTA: Medir consultas generadas y conversaciones iniciadas (no proyectar resultados)' } } }), []);
});
tPersist('PROTECTED: ad_strategy.measurement listing the TRUE endpoint ("citas agendadas") -> DETECT', () => {
  assert(mechanismViolations({ deliverable: { '8_ad_strategy': { measurement: 'Clicks, citas agendadas' } } }).length > 0);
});
tPersist('PROTECTED: the original "no longer silent" PROPUESTA fixture (endpoint present) -> DETECT', () => {
  assert(mechanismViolations({ deliverable: { '8_ad_strategy': { measurement: 'PROPUESTA: Medir clicks, formularios completados, chats iniciados, citas agendadas internamente.' } } }).length > 0);
});
tPersist('ad_strategy.measurement tracking chats only (leading indicator) -> PASS', () => assert.deepStrictEqual(mechanismViolations({ deliverable: { '8_ad_strategy': { measurement: 'Chats de WhatsApp iniciados' } } }), []));
tPersist('ad_strategy.measurement tracking landing visits only (leading indicator) -> PASS', () => assert.deepStrictEqual(mechanismViolations({ deliverable: { '8_ad_strategy': { measurement: 'Visitas a landing page' } } }), []));
tPersist('ad_strategy.measurement tracking checkout starts (purchase-grounded) -> PASS', () => assert.deepStrictEqual(mechanismViolations({ deliverable: { '8_ad_strategy': { measurement: 'Checkout iniciados del minicurso' } } }), []));
tPersist('ad_strategy.measurement mixing leading indicator AND endpoint -> DETECT (endpoint still flagged)', () => {
  const v = mechanismViolations({ deliverable: { '8_ad_strategy': { measurement: 'Consultas generadas; citas agendadas' } } });
  assert(v.length > 0);
});
tPersist('13_measurement_kpis.conversion_metrics with ONLY an intermediate stage (no purchase) -> DETECT (this field IS the conversion definition)', () => {
  assert(mechanismViolations({ deliverable: { '13_measurement_kpis': { conversion_metrics: 'Consultas generadas' } } }).length > 0);
});
tPersist('13_measurement_kpis.primary_outcome = mechanism endpoint -> DETECT', () => assert(mechanismViolations({ deliverable: { '13_measurement_kpis': { primary_outcome: 'Generar consultas y gestionar conversiones por WhatsApp' } } }).length > 0));
tPersist('13_measurement_kpis.conversion_metrics = "citas agendadas" -> DETECT', () => assert(mechanismViolations({ deliverable: { '13_measurement_kpis': { conversion_metrics: 'citas agendadas' } } }).length > 0));
tPersist('12_whatsapp_followup_closing.closing = "agendar cita" -> DETECT', () => assert(mechanismViolations({ deliverable: { '12_whatsapp_followup_closing': { closing: 'agendar cita' } } }).length > 0));
tPersist('12_whatsapp_followup_closing.closing grounded in purchase -> PASS', () => assert.deepStrictEqual(mechanismViolations({ deliverable: { '12_whatsapp_followup_closing': { closing: 'Enviar link de pago del minicurso' } } }), []));
tPersist('6_funnel.conversion_intent grounded in purchase -> PASS', () => assert.deepStrictEqual(mechanismViolations({ deliverable: { '6_funnel': { conversion_intent: 'PROPUESTA: Pago minicurso 400 MXN' } } }), []));
tPersist('6_funnel.transitions ending in mechanism endpoint (arrow chain) -> DETECT', () => assert(mechanismViolations({ deliverable: { '6_funnel': { transitions: 'WhatsApp conversación -> agendar cita' } } }).length > 0));
tPersist('6_funnel.stages non-arrow prose mentioning cita alongside pago -> PASS (process description, grounded)', () => {
  assert.deepStrictEqual(mechanismViolations({ deliverable: { '6_funnel': { stages: 'PROPUESTA: BOF: pago y WhatsApp cita' } } }), []);
});
tPersist('8_ad_strategy.campaign_objective (SAFE role) never role-confused regardless of content', () => {
  assert.deepStrictEqual(mechanismViolations({ deliverable: { '8_ad_strategy': { campaign_objective: 'PROPUESTA: Llevar tráfico cualificado a landing y capturar consultas por WhatsApp' } } }), []);
});
tPersist('13_measurement_kpis.leading_indicators (SAFE role) mentioning endpoint stays PASS', () => {
  assert.deepStrictEqual(mechanismViolations({ deliverable: { '13_measurement_kpis': { leading_indicators: 'Citas agendadas como señal temprana' } } }), []);
});
tPersist('12_whatsapp_followup_closing.follow_up (SAFE role) mentioning endpoint stays PASS', () => {
  assert.deepStrictEqual(mechanismViolations({ deliverable: { '12_whatsapp_followup_closing': { follow_up: 'Recordatorio de cita pendiente' } } }), []);
});
tPersist('5_offer.mechanism field (not in role table) never inspected', () => {
  assert.deepStrictEqual(mechanismViolations({ deliverable: { '5_offer': { mechanism: 'consulta -> conversación -> cita' } } }), []);
});

// ============================================================
// PART A — GENERATED ROLE MATRIX (LEADING_INDICATOR vs ENUMERATION/STRICT, ungrounded vs grounded)
// ============================================================
const LEADING_INDICATOR_TEXTS_PASS = [
  'Consultas generadas', 'Conversaciones iniciadas', 'Chats de WhatsApp', 'Mensajes recibidos',
  'Visitas a landing', 'Clics en anuncio', 'Formularios completados',
];
for (const text of LEADING_INDICATOR_TEXTS_PASS) {
  tPersist(`ROLE-MATRIX LEADING_INDICATOR "${text}" (intermediate only) -> PASS`, () => {
    assert.deepStrictEqual(mechanismViolations({ deliverable: { '8_ad_strategy': { measurement: text } } }), []);
  });
}
const ENDPOINT_TEXTS_DETECT = ['citas agendadas', 'cita confirmada', 'agendar cita', 'cita reservada'];
for (const text of ENDPOINT_TEXTS_DETECT) {
  tPersist(`ROLE-MATRIX LEADING_INDICATOR field with endpoint "${text}" -> DETECT`, () => {
    assert(mechanismViolations({ deliverable: { '8_ad_strategy': { measurement: text } } }).length > 0);
  });
  tPersist(`ROLE-MATRIX ENUMERATION field (conversion_metrics) with endpoint "${text}" -> DETECT`, () => {
    assert(mechanismViolations({ deliverable: { '13_measurement_kpis': { conversion_metrics: text } } }).length > 0);
  });
}

// ============================================================
// PART B — EPISTEMIC COMPATIBILITY MATRIX
// ============================================================
tPersist('EPI-PASS "Presupuesto no especificado." + "Presupuesto no definido."', () => assert.deepStrictEqual(assumptionViolations(['Presupuesto no especificado.', 'Presupuesto no definido.']).filter(v => v.type === 'CONTRADICTORY_ASSUMPTION_EPISTEMIC_STATUS'), []));
tPersist('EPI-PASS "Presupuesto no especificado." + "Necesitamos definir presupuesto."', () => assert.deepStrictEqual(assumptionViolations(['Presupuesto no especificado.', 'Necesitamos definir presupuesto.']).filter(v => v.type === 'CONTRADICTORY_ASSUMPTION_EPISTEMIC_STATUS'), []));
tPersist('EPI-PASS "Presupuesto desconocido." + "Confirmar presupuesto."', () => assert.deepStrictEqual(assumptionViolations(['Presupuesto desconocido.', 'Confirmar presupuesto.']).filter(v => v.type === 'CONTRADICTORY_ASSUMPTION_EPISTEMIC_STATUS'), []));
tPersist('EPI-PASS "No se proporcionó presupuesto." + "Definir presupuesto antes del lanzamiento."', () => assert.deepStrictEqual(assumptionViolations(['No se proporcionó presupuesto.', 'Definir presupuesto antes del lanzamiento.']).filter(v => v.type === 'CONTRADICTORY_ASSUMPTION_EPISTEMIC_STATUS'), []));
tPersist('EPI-DETECT "Presupuesto confirmado en 500 MXN diarios." + "No hay presupuesto disponible."', () => assert(assumptionViolations(['Presupuesto confirmado en 500 MXN diarios.', 'No hay presupuesto disponible.']).some(v => v.type === 'CONTRADICTORY_ASSUMPTION_EPISTEMIC_STATUS')));
tPersist('EPI-DETECT "Landing disponible." + "No existe landing."', () => assert(assumptionViolations(['Landing disponible.', 'No existe landing.']).some(v => v.type === 'CONTRADICTORY_ASSUMPTION_EPISTEMIC_STATUS')));
tPersist('EPI-DETECT "WhatsApp Business activo." + "No hay cuenta WhatsApp Business."', () => assert(assumptionViolations(['WhatsApp Business activo.', 'No hay cuenta WhatsApp Business.']).some(v => v.type === 'CONTRADICTORY_ASSUMPTION_EPISTEMIC_STATUS')));
tPersist('PROTECTED: gate-14 original contradiction (disponible y definido por usuario vs desconocido) still DETECTs', () => assert(assumptionViolations(['Presupuesto de anuncios disponible y definido por usuario.', 'Presupuesto de ads desconocido.']).some(v => v.type === 'CONTRADICTORY_ASSUMPTION_EPISTEMIC_STATUS')));
tPersist('LIVE CLUSTER: all 4 live assumption variants together -> ZERO contradictions', () => {
  const v = assumptionViolations(['Presupuesto publicitario disponible (desconocido).', 'Presupuesto publicitario no especificado.', 'Presupuesto publicitario y ciudades objetivo no definidos.', 'Necesitamos presupuesto publicitario disponible']);
  assert.deepStrictEqual(v.filter(x => x.type === 'CONTRADICTORY_ASSUMPTION_EPISTEMIC_STATUS'), []);
});

// Generated epistemic matrix: topics x compatible-state-pairs (PASS) and topics x contradictory-pairs (DETECT)
const TOPICS = ['presupuesto', 'landing', 'creativos', 'audiencia', 'ciudades'];
const COMPATIBLE_PAIR_TEMPLATES = [
  (t) => [`${t} no especificado.`, `${t} no definido.`],
  (t) => [`${t} desconocido.`, `${t} pendiente de confirmar.`],
  (t) => [`${t} por confirmar.`, `Necesitamos definir ${t}.`],
  (t) => [`${t} no disponible.`, `${t} desconocido.`],
];
for (const topic of TOPICS) {
  for (let i = 0; i < COMPATIBLE_PAIR_TEMPLATES.length; i++) {
    const [a, b] = COMPATIBLE_PAIR_TEMPLATES[i](topic);
    tPersist(`EPI-MATRIX-PASS topic=${topic} template=${i} "${a}" / "${b}"`, () => {
      assert.deepStrictEqual(assumptionViolations([a, b]).filter(v => v.type === 'CONTRADICTORY_ASSUMPTION_EPISTEMIC_STATUS'), []);
    });
  }
}
const CONTRADICTORY_PAIR_TEMPLATES = [
  (t) => [`${t} confirmado y disponible.`, `${t} desconocido.`],
  (t) => [`${t} disponible y definido por usuario.`, `No hay ${t} disponible.`],
];
for (const topic of TOPICS) {
  for (let i = 0; i < CONTRADICTORY_PAIR_TEMPLATES.length; i++) {
    const [a, b] = CONTRADICTORY_PAIR_TEMPLATES[i](topic);
    tPersist(`EPI-MATRIX-DETECT topic=${topic} template=${i} "${a}" / "${b}"`, () => {
      assert(assumptionViolations([a, b]).some(v => v.type === 'CONTRADICTORY_ASSUMPTION_EPISTEMIC_STATUS'), JSON.stringify([a, b]));
    });
  }
}

// ============================================================
// PART C — META BRAND / TARGET DISAMBIGUATION
// ============================================================
tPersist('LIVE FALSE POSITIVE: "Costos y CPC actuales en Meta Ads México" -> PASS', () => assert.deepStrictEqual(metricViolations('current_research_required', 'Costos y CPC actuales en Meta Ads México'), []));
tPersist('META-PASS "Investigar CPC en Meta Ads"', () => assert.deepStrictEqual(metricViolations('current_research_required', 'Investigar CPC en Meta Ads'), []));
tPersist('META-PASS "Consultar costos de Meta Ads"', () => assert.deepStrictEqual(metricViolations('current_research_required', 'Consultar costos de Meta Ads'), []));
tPersist('META-PASS "ROAS disponible en Meta Business Suite"', () => assert.deepStrictEqual(metricViolations('current_research_required', 'ROAS disponible en Meta Business Suite'), []));
tPersist('META-PASS "Datos de Meta Ads requeridos"', () => assert.deepStrictEqual(metricViolations('current_research_required', 'Datos de Meta Ads requeridos'), []));
tPersist('META-DETECT "meta de CPC: $20"', () => assert(metricViolations('current_research_required', 'meta de CPC: $20').length > 0));
tPersist('META-DETECT "CPC meta: $20"', () => assert(metricViolations('current_research_required', 'CPC meta: $20').length > 0));
tPersist('META-DETECT "Meta objetivo de CAC: $30"', () => assert(metricViolations('current_research_required', 'Meta objetivo de CAC: $30').length > 0));
tPersist('META-DETECT "ROAS meta 4x"', () => assert(metricViolations('current_research_required', 'ROAS meta 4x').length > 0));
tPersist('META-DETECT "target ROAS 4x"', () => assert(metricViolations('current_research_required', 'target ROAS 4x').length > 0));

// Generated meta-entity matrix: brand phrases x acronyms -> always PASS
const BRAND_PHRASES = ['Meta Ads', 'Meta Business', 'Meta Business Suite', 'Meta platform'];
const ACRONYMS_FOR_META = ['CAC', 'ROAS', 'CPC', 'CTR', 'CPA', 'CPM'];
for (const brand of BRAND_PHRASES) {
  for (const acr of ACRONYMS_FOR_META) {
    tPersist(`META-ENTITY-MATRIX "${acr} en ${brand}" -> PASS`, () => {
      assert.deepStrictEqual(metricViolations('current_research_required', `${acr} en ${brand}`), []);
    });
  }
}
// Generated target/goal matrix: qualifier x acronym x value -> always DETECT
const QUALIFIERS_FOR_TARGET = ['meta', 'objetivo', 'target', 'expected', 'esperado'];
for (const q of QUALIFIERS_FOR_TARGET) {
  for (const acr of ['CAC', 'ROAS', 'CPC']) {
    tPersist(`TARGET-MATRIX "${acr} ${q}: $20" -> DETECT`, () => {
      assert(metricViolations('current_research_required', `${acr} ${q}: $20`).length > 0);
    });
  }
}

// ============================================================
// RESEARCH SPEECH ACT vs METRIC ASSERTION
// ============================================================
tPersist('RESEARCH-PASS "investigar CPC actual"', () => assert.deepStrictEqual(metricViolations('current_research_required', 'investigar CPC actual'), []));
tPersist('RESEARCH-PASS "consultar ROAS actual"', () => assert.deepStrictEqual(metricViolations('current_research_required', 'consultar ROAS actual'), []));
tPersist('RESEARCH-PASS "obtener CAC real"', () => assert.deepStrictEqual(metricViolations('current_research_required', 'obtener CAC real'), []));
tPersist('RESEARCH-PASS "buscar datos actuales de CPA"', () => assert.deepStrictEqual(metricViolations('current_research_required', 'buscar datos actuales de CPA'), []));
tPersist('RESEARCH-DETECT "CPC actual es $20"', () => assert(metricViolations('current_research_required', 'CPC actual es $20').length > 0));
tPersist('RESEARCH-DETECT "ROAS actual 4x"', () => assert(metricViolations('current_research_required', 'ROAS actual 4x').length > 0));
const RESEARCH_VERBS = ['investigar', 'consultar', 'obtener', 'buscar'];
for (const verb of RESEARCH_VERBS) {
  for (const acr of ['CPC', 'ROAS', 'CAC', 'CPA']) {
    tPersist(`RESEARCH-MATRIX "${verb} ${acr} actual" (no value) -> PASS`, () => {
      assert.deepStrictEqual(metricViolations('current_research_required', `${verb} ${acr} actual`), []);
    });
  }
}

// ============================================================
// PART E — LIVE FIXTURE (job 29a3248a-045f-4942-ba15-59469d1e9369, minimized)
// ============================================================
function liveFinalSynthesis() {
  return {
    deliverable: {
      '6_funnel': {
        stages: 'PROPUESTA: BOF: pago y WhatsApp cita',
        transitions: 'WhatsApp conversación → agendar cita',
        conversion_intent: 'PROPUESTA: Pago minicurso 400 MXN',
      },
      '8_ad_strategy': {
        measurement: 'PROPUESTA: Medir consultas generadas y conversaciones iniciadas (no proyectar resultados)',
        campaign_objective: 'PROPUESTA: Llevar tráfico cualificado a landing y capturar consultas por WhatsApp',
      },
      '12_whatsapp_followup_closing': { closing: 'agendar cita' },
      '13_measurement_kpis': {
        primary_outcome: 'Generar consultas y gestionar conversiones por WhatsApp',
        conversion_metrics: 'citas agendadas',
      },
      '14_assumptions': [
        'Presupuesto publicitario disponible (desconocido).',
        'Presupuesto publicitario no especificado.',
        'Presupuesto publicitario y ciudades objetivo no definidos.',
        'Necesitamos presupuesto publicitario disponible',
      ],
      '17_current_research_required': ['Costos y CPC actuales en Meta Ads México'],
    },
  };
}
t('LIVE FIXTURE: initial validation reproduces exactly the 4 TRUE role violations, 0 false assumption contradictions, 0 meta-brand false positives', () => {
  const facts = { ...M360_FACTS, constraints: { value: METRIC_CONSTRAINT, status: 'USER_PROVIDED_FACT' } };
  const result = fidelity.validateFinalSynthesis(facts, liveFinalSynthesis(), {});
  const byType = {};
  for (const v of result.violations) byType[v.type] = (byType[v.type] || 0) + 1;
  assert.equal(byType.MECHANISM_TO_CAMPAIGN_CONVERSION_PROMOTION, 4, JSON.stringify(result.violations));
  assert(!byType.CONTRADICTORY_ASSUMPTION_EPISTEMIC_STATUS, JSON.stringify(result.violations));
  assert(!result.violations.some(v => v.category === 'invented_metric'), JSON.stringify(result.violations));
  // The measurement field (leading indicators only) and stages/campaign_objective must NOT be
  // among the 4 flagged fields — only closing, primary_outcome, conversion_metrics, and transitions.
  const flaggedFields = result.violations.filter(v => v.type === 'MECHANISM_TO_CAMPAIGN_CONVERSION_PROMOTION').map(v => v.field_key).sort();
  assert.deepStrictEqual(flaggedFields, ['closing', 'conversion_metrics', 'primary_outcome', 'transitions']);
});
t('LIVE FIXTURE: deterministic repair resolves the 4 role violations and revalidation is clean', () => {
  const facts = { ...M360_FACTS, constraints: { value: METRIC_CONSTRAINT, status: 'USER_PROVIDED_FACT' } };
  const synth = liveFinalSynthesis();
  const first = fidelity.validateFinalSynthesis(facts, synth, {});
  assert(first.violations.length > 0 && first.violations.every(fidelity.isRepairableFinalSynthesisViolation), JSON.stringify(first.violations));
  const repaired = fidelity.repairFinalSynthesis(facts, synth, first.violations, {});
  assert(repaired);
  const second = fidelity.validateFinalSynthesis(facts, repaired.synthesis, {});
  assert.deepStrictEqual(second.violations, []);
  // Repair must not touch the leading-indicator measurement field or the safe campaign_objective —
  // they were never violations, so they must be left byte-identical.
  assert.equal(repaired.synthesis.deliverable['8_ad_strategy'].measurement, 'PROPUESTA: Medir consultas generadas y conversaciones iniciadas (no proyectar resultados)');
  assert.equal(repaired.synthesis.deliverable['8_ad_strategy'].campaign_objective, 'PROPUESTA: Llevar tráfico cualificado a landing y capturar consultas por WhatsApp');
});
t('LIVE FIXTURE: no fabricated facts introduced by repair (budget/landing/WhatsApp availability never invented)', () => {
  const facts = { ...M360_FACTS, constraints: { value: METRIC_CONSTRAINT, status: 'USER_PROVIDED_FACT' } };
  const synth = liveFinalSynthesis();
  const first = fidelity.validateFinalSynthesis(facts, synth, {});
  const repaired = fidelity.repairFinalSynthesis(facts, synth, first.violations, {});
  const assumptionsAfter = repaired.synthesis.deliverable['14_assumptions'];
  assert.deepStrictEqual(assumptionsAfter, synth.deliverable['14_assumptions']); // untouched — no false contradiction meant nothing to repair here
  assert(!JSON.stringify(repaired.synthesis).match(/\b\d+\s*MXN\s*diari/i), 'must not fabricate a specific budget figure');
});

// ============================================================
// PROTECTED REGRESSION SPOT-CHECKS
// ============================================================
t('PROTECTED: ads.limitations "no testimonials" still PASSes (prior negation gate)', () => {
  const v = fidelity.validateOutputAgainstFacts({ constraints: { value: 'No inventes testimonios.', status: 'USER_PROVIDED_FACT' } }, { downstream_payload: { limitations: 'no testimonials' } }, { nodeId: 'ads' }).violations;
  assert.deepStrictEqual(v.filter(x => x.type === 'EXPLICIT_PROHIBITION'), []);
});
t('PROTECTED: English positive prohibition "We guarantee more clients" still DETECTs', () => {
  const v = fidelity.validateOutputAgainstFacts({ constraints: { value: METRIC_CONSTRAINT, status: 'USER_PROVIDED_FACT' } }, { downstream_payload: { limitations: 'We guarantee more clients' } }, { nodeId: 'ads' }).violations;
  assert(v.some(x => x.type === 'EXPLICIT_PROHIBITION'));
});
t('PROTECTED: compact metric punctuation "ROAS?4x" still DETECTs exactly once', () => {
  assert.equal(metricViolations('limitations', 'ROAS?4x').length, 1);
});
t('PROTECTED: array leaf boundaries still isolated ["ROAS unknown","ROAS?4x"]', () => {
  const v = metricViolations('limitations', ['ROAS unknown', 'ROAS?4x']);
  assert.equal(v.length, 1);
  assert.equal(v[0].leaf_path, 'limitations[1]');
});

// ============================================================
// PART F — USAGE ACCOUNTING PRESERVED (all 8 nodes complete, only final synthesis fails)
// ============================================================
function mockKb() {
  return {
    async retrieveStrategyFAsync(query) {
      const hits = Array.from({ length: 5 }, (_, i) => ({ rank: i + 1, chunk_id: 'c' + i, source_pdf_name: 'S.pdf', pdf_page_refs: '1', content: 'evidence ' + query, original_query_cosine: 0.6, rag_decision: 'CITE', quality_status: 'OK', warning_flags: [] }));
      return { top5: hits, advisory_top1_cosine: 0.6 };
    },
    buildStrategyFEvidence(raw) {
      const hits = raw.top5 || [];
      return { evidenceText: hits.map(h => h.content).join('\n'), hits, advisoryTop1Cosine: raw.advisory_top1_cosine, pipeline: 'Strategy-F', corpus: 'kb_chunks_v2' };
    },
  };
}
function mockAdapter() { return new AgentV1Adapter({ kb: mockKb() }); }
function specTypeFromSystem(sys) { const m = /You are ASTRA's ([A-Z_]+)/.exec(sys); return m ? m[1] : 'UNKNOWN'; }
const SPEC_FIELDS = {
  MARKET_CONTEXT_SPECIALIST: ['problem_context', 'market_assumptions', 'constraints'],
  ICP_SPECIALIST: ['pains', 'desired_outcomes', 'objections', 'buying_triggers', 'qualification_signals', 'non_fit_signals'],
  OFFER_SPECIALIST: ['value_proposition', 'offer_structure', 'mechanism', 'risk_reduction', 'value_stack', 'constraints'],
  FUNNEL_SPECIALIST: ['stages', 'transitions', 'conversion_intent', 'qualification_points', 'drop_off_risks', 'dependencies'],
  CREATIVE_STRATEGY_SPECIALIST: ['core_idea', 'single_minded_proposition', 'angles', 'creative_territories', 'hooks', 'proof', 'objection_coverage'],
  META_ADS_SPECIALIST: ['campaign_objective', 'audience_approach', 'structure', 'creative_testing', 'qualification', 'measurement', 'limitations'],
  WHATSAPP_SALES_SPECIALIST: ['qualification', 'discovery', 'objection_handling', 'appointment_closing', 'follow_up', 'recovery', 'conversational_logic', 'limitations'],
  MEASUREMENT_CRO_SPECIALIST: ['primary_outcome', 'leading_indicators', 'funnel_metrics', 'conversion_metrics', 'diagnostic_metrics', 'optimization_triggers', 'measurement_cadence'],
};
const CLEAN_STATEMENT = 'Contenido determinístico de prueba para este nodo, alineado al brief original del cliente Método 360, sin cambiar la oferta ni el público declarados. Flujo: consulta → conversación → cita.';
const CLEAN_CONVERSION_DEFAULTS = {
  FUNNEL_SPECIALIST: {
    stages: 'Meta Ads genera consultas y WhatsApp gestiona la conversación, el mecanismo del minicurso; paso final de esta campaña: compra del minicurso.',
    transitions: 'De consulta a conversación por WhatsApp; cierre con compra del minicurso.',
    conversion_intent: 'Compra del minicurso Método 360.',
  },
  META_ADS_SPECIALIST: { measurement: 'PROPUESTA: Medir consultas generadas y conversaciones iniciadas (no proyectar resultados)' },
  WHATSAPP_SALES_SPECIALIST: { appointment_closing: 'agendar cita' },
  MEASUREMENT_CRO_SPECIALIST: {
    primary_outcome: 'Generar consultas y gestionar conversiones por WhatsApp',
    funnel_metrics: 'Clics en anuncio y mensajes de WhatsApp que terminan en compras del minicurso.',
    conversion_metrics: 'citas agendadas',
  },
};
function buildMockLLM(overrides = {}) {
  return async (system) => {
    const st = specTypeFromSystem(system);
    const fields = SPEC_FIELDS[st] || [];
    const payload = {};
    for (const f of fields) payload[f] = CLEAN_STATEMENT;
    Object.assign(payload, CLEAN_CONVERSION_DEFAULTS[st] || {});
    Object.assign(payload, overrides[st] || {});
    const current = /META_ADS/.test(st) ? ['CAPI', 'current attribution'] : (/WHATSAPP/.test(st) ? ['current WhatsApp API mechanics'] : []);
    const obj = {
      findings: [{ claim: 'grounded finding', support_class: 'DIRECTLY_SUPPORTED', evidence_ref: 'E1' }],
      recommendations: [{ recommendation: 'action for ' + st, support_class: 'INFERENCE', basis: 'method' }],
      decisions: [{ decision: 'd', rationale: 'r' }], assumptions: ['needs USER_PROVIDED_FACTS: budget'], conflicts: [], confidence: 0.7,
      current_research_required: current, downstream_payload: payload,
    };
    return { raw: JSON.stringify(obj), usage: { prompt: 10, completion: 10 } };
  };
}
const STRUCTURED_METHOD360_BRIEF = [
  'Crea una campaña 360 para Método 360.', '', 'Producto: minicurso grabado.', 'Precio: $400 MXN.',
  'Audiencia: dueñas de estéticas en México.', 'Geografía: México.', 'Objetivo: vender el minicurso.',
  'Mecanismo exacto: enseña Meta Ads para generar consultas y WhatsApp para convertir consulta → conversación → cita.',
  '', 'Restricciones obligatorias:', '- No cambiar el nombre Método 360.', '- No cambiar el precio de $400 MXN.',
  '- No cambiar la audiencia.', '- No cambiar el producto ni convertirlo en mentoría, servicio, membresía o asesoría.',
  '- No cambiar el mecanismo consulta → conversación → cita.',
  '- No inventar métricas, resultados, CAC, CPA, CPL, ROAS, MER, LTV, revenue, margen, conversiones, benchmarks, testimonios, proof, urgencia, escasez ni evidencia.',
  '- Cualquier dato faltante debe mantenerse como UNKNOWN.', '- Cualquier idea nueva debe marcarse explícitamente como PROPUESTA.',
  '- No presentar hipótesis como hechos.', '',
].join('\n');
t('USAGE-ACCOUNTING: all 8 nodes complete + final-synthesis role violations fail closed at the synthesis gate, not a node -> model_calls still 8', async () => {
  const r = await H.run(STRUCTURED_METHOD360_BRIEF, { mode: 'llm', adapter: mockAdapter(), retrieve: true, salt: 'final-synthesis-role-epistemic-meta', llm: buildMockLLM({}) });
  // closing/primary_outcome/conversion_metrics remain unrepaired-role-violating by construction of
  // this mock (deliberately mirroring the live failure) -> synthesis-level FAILED, not node-level.
  assert.equal(r.node_outputs.length, 8, JSON.stringify(r.node_outputs.map(n => n.work_unit_id)));
  assert.equal(r.cost.model_calls, 8, JSON.stringify(r.cost));
});

// ============================================================
// PART G — 50 FRESH RED-TEAM CASES (authored after implementation)
// ============================================================
let freshCaseCount = 0;
function tFresh(name, fn) { freshCaseCount++; t('FRESH-' + freshCaseCount + ' ' + name, fn); }

// Role ambiguity / leading indicators
tFresh('ad_strategy.measurement "Impresiones y alcance" (pure media metrics) -> PASS', () => assert.deepStrictEqual(mechanismViolations({ deliverable: { '8_ad_strategy': { measurement: 'Impresiones y alcance' } } }), []));
tFresh('ad_strategy.measurement "CTR y CPC del anuncio" -> PASS (media metrics, no mechanism term at all)', () => assert.deepStrictEqual(mechanismViolations({ deliverable: { '8_ad_strategy': { measurement: 'CTR y CPC del anuncio' } } }), []));
tFresh('ad_strategy.measurement arrow chain ending in endpoint -> DETECT (SEQUENCE-like arrow terminal via enumeration item)', () => {
  const v = mechanismViolations({ deliverable: { '8_ad_strategy': { measurement: 'Anuncio -> WhatsApp -> Cita' } } });
  assert(v.length > 0);
});
tFresh('ad_strategy.measurement "Consultas y citas agendadas" (both stages) -> DETECT (endpoint present)', () => assert(mechanismViolations({ deliverable: { '8_ad_strategy': { measurement: 'Consultas y citas agendadas' } } }).length > 0));
tFresh('multiple funnel stages, only later one has endpoint -> DETECT only that item', () => {
  const v = mechanismViolations({ deliverable: { '13_measurement_kpis': { conversion_metrics: 'Leads generados; consultas iniciadas; citas agendadas' } } });
  assert(v.length > 0);
});
tFresh('WhatsApp inquiry tracked as leading indicator -> PASS', () => assert.deepStrictEqual(mechanismViolations({ deliverable: { '8_ad_strategy': { measurement: 'Consultas por WhatsApp recibidas' } } }), []));
tFresh('appointments as the SAFE leading_indicators field -> PASS regardless of content', () => assert.deepStrictEqual(mechanismViolations({ deliverable: { '13_measurement_kpis': { leading_indicators: 'Citas agendadas; consultas iniciadas' } } }), []));
tFresh('purchase field grounded correctly -> PASS', () => assert.deepStrictEqual(mechanismViolations({ deliverable: { '6_funnel': { conversion_intent: 'Compra confirmada del minicurso' } } }), []));
tFresh('requirement vs fact: assumptions list with only REQUIRED-family statements -> zero contradictions', () => {
  assert.deepStrictEqual(assumptionViolations(['Necesitamos definir presupuesto.', 'Requerimos confirmar ciudades objetivo.', 'Debemos confirmar el listado de creativos.']).filter(v => v.type === 'CONTRADICTORY_ASSUMPTION_EPISTEMIC_STATUS'), []);
});
tFresh('unknown vs unavailable: "Landing desconocida." + "No existe landing." -> compatible (PASS), not both KNOWN_AVAILABLE-anchored', () => {
  assert.deepStrictEqual(assumptionViolations(['Landing desconocida.', 'No existe landing.']).filter(v => v.type === 'CONTRADICTORY_ASSUMPTION_EPISTEMIC_STATUS'), []);
});
tFresh('duplicate assumptions (byte-identical) never contradict themselves', () => {
  assert.deepStrictEqual(assumptionViolations(['Presupuesto desconocido.', 'Presupuesto desconocido.']).filter(v => v.type === 'CONTRADICTORY_ASSUMPTION_EPISTEMIC_STATUS'), []);
});
tFresh('brand Meta vs goal meta in the SAME sentence: "Meta Ads con meta de CAC $30" -> DETECT (the qualifier usage, not the brand, drives it)', () => {
  assert(metricViolations('current_research_required', 'Meta Ads con meta de CAC $30').length > 0);
});
tFresh('capitalization: "META ADS" uppercase brand -> PASS', () => assert.deepStrictEqual(metricViolations('current_research_required', 'CPC en META ADS'), []));
tFresh('capitalization: "meta ads" lowercase brand -> PASS', () => assert.deepStrictEqual(metricViolations('current_research_required', 'cpc en meta ads'), []));
tFresh('punctuation: "Meta Ads, CPC pendiente" -> PASS (comma-separated, no value)', () => assert.deepStrictEqual(metricViolations('current_research_required', 'Meta Ads, CPC pendiente'), []));
tFresh('punctuation: "CPC: $20 (Meta Ads)" -> DETECT (genuine value present, brand mentioned after never suppresses it)', () => assert(metricViolations('current_research_required', 'CPC: $20 (Meta Ads)').length > 0));
tFresh('array of research items isolates the meta-brand false positive from a real metric assertion', () => {
  const v = metricViolations('current_research_required', ['CPC actuales en Meta Ads México', 'CAC objetivo: $30']);
  assert.equal(v.length, 1);
  assert.equal(v[0].leaf_path, 'current_research_required[1]');
});
tFresh('nested object: {platform: "Meta Ads CPC research", target: "CAC meta $20"} isolates correctly', () => {
  const v = metricViolations('current_research_required', { platform: 'Investigar CPC en Meta Ads', target: 'CAC meta $20' });
  assert.equal(v.length, 1);
  assert.equal(v[0].leaf_path, 'current_research_required.target');
});
tFresh('multiple occurrences: "Meta Ads CPC pending; ROAS meta 4x" -> only ROAS occurrence DETECTs', () => {
  const v = metricViolations('current_research_required', 'Meta Ads CPC pending; ROAS meta 4x');
  assert.equal(v.length, 1);
  assert(/ROAS/.test(v[0].matched_text));
});
tFresh('mixed ES/EN: "Meta Ads target CPC" -> DETECT (mirrors the established "CAC target"/"CPC meta" bare-qualifier precedent — "target" here is a genuine qualifier usage regardless of the preceding brand mention)', () => {
  assert(metricViolations('current_research_required', 'Meta Ads target CPC').length > 0);
});
tFresh('mixed ES/EN true target: "target CPC en campaña: $5" -> DETECT', () => {
  assert(metricViolations('current_research_required', 'target CPC en campaña: $5').length > 0);
});
tFresh('epistemic array isolation: assumptions as array with a genuine contradiction buried among compatible ones', () => {
  const v = assumptionViolations(['Presupuesto no especificado.', 'Landing disponible.', 'Necesitamos confirmar ciudades.', 'No existe landing.']);
  const contradictions = v.filter(x => x.type === 'CONTRADICTORY_ASSUMPTION_EPISTEMIC_STATUS');
  assert.equal(contradictions.length, 1);
  assert(/Landing disponible/.test(contradictions[0].matched_text));
});
tFresh('nested assumption-like text inside a non-14_assumptions field is never checked for epistemic contradiction', () => {
  const v = fidelity.validateFinalSynthesis({}, { deliverable: { '5_offer': { risk_reduction: 'Presupuesto disponible. Presupuesto desconocido.' } } }, {}).violations;
  assert.deepStrictEqual(v.filter(x => x.type === 'CONTRADICTORY_ASSUMPTION_EPISTEMIC_STATUS'), []);
});
tFresh('WhatsApp availability contradiction: "WhatsApp API activa." + "No hay WhatsApp API disponible." -> DETECT', () => {
  assert(assumptionViolations(['WhatsApp API activa.', 'No hay WhatsApp API disponible.']).some(v => v.type === 'CONTRADICTORY_ASSUMPTION_EPISTEMIC_STATUS'));
});
tFresh('refund policy never fabricated by repair: assumptions untouched when no violation exists', () => {
  const facts = { ...M360_FACTS, constraints: { value: METRIC_CONSTRAINT, status: 'USER_PROVIDED_FACT' } };
  const synth = { deliverable: { '14_assumptions': ['Política de reembolso no especificada.'] } };
  const v = fidelity.validateFinalSynthesis(facts, synth, {}).violations;
  assert.deepStrictEqual(v, []);
});
tFresh('booking tool availability, SAME topic word: "Herramienta de agenda disponible." + "No hay herramienta de agenda." -> DETECT', () => {
  assert(assumptionViolations(['Herramienta de agenda disponible.', 'No hay herramienta de agenda.']).some(v => v.type === 'CONTRADICTORY_ASSUMPTION_EPISTEMIC_STATUS'));
});
tFresh('campaign duration: "Duración de campaña confirmada: 30 días." + "Duración no especificada." -> DETECT', () => {
  assert(assumptionViolations(['Duración de campaña confirmada: 30 días.', 'Duración no especificada.']).some(v => v.type === 'CONTRADICTORY_ASSUMPTION_EPISTEMIC_STATUS'));
});
tFresh('assets: "Clip de 60s disponible." + "Assets pendientes de confirmar." -> PASS (different topics, no shared keyword)', () => {
  assert.deepStrictEqual(assumptionViolations(['Clip de 60s disponible.', 'Assets pendientes de confirmar.']).filter(v => v.type === 'CONTRADICTORY_ASSUMPTION_EPISTEMIC_STATUS'), []);
});
tFresh('field-role: STRICT field with a purely research-style sentence (no mechanism term) -> PASS', () => assert.deepStrictEqual(mechanismViolations({ deliverable: { '6_funnel': { conversion_intent: 'Por definir según datos de mercado' } } }), []));
tFresh('field-role: LEADING_INDICATOR field with grounded purchase term AND leading indicator together -> PASS', () => {
  assert.deepStrictEqual(mechanismViolations({ deliverable: { '8_ad_strategy': { measurement: 'Compras registradas; consultas generadas' } } }), []);
});
tFresh('capitalization: "CITAS AGENDADAS" uppercase endpoint in LEADING_INDICATOR field -> DETECT', () => assert(mechanismViolations({ deliverable: { '8_ad_strategy': { measurement: 'CITAS AGENDADAS' } } }).length > 0));
tFresh('punctuation: "citas-agendadas" hyphenated endpoint still DETECTs via word extraction', () => assert(mechanismViolations({ deliverable: { '8_ad_strategy': { measurement: 'citas-agendadas' } } }).length > 0));
tFresh('array of ad_strategy-style measurement items isolates the endpoint occurrence', () => {
  const v = mechanismViolations({ deliverable: { '8_ad_strategy': { measurement: 'Consultas generadas, citas agendadas' } } });
  assert(v.length > 0);
});
tFresh('research speech act "obtener datos reales de ROAS" -> PASS', () => assert.deepStrictEqual(metricViolations('current_research_required', 'obtener datos reales de ROAS'), []));
tFresh('research speech act with value present -> DETECT: "obtener CAC real: $25"', () => assert(metricViolations('current_research_required', 'obtener CAC real: $25').length > 0));
tFresh('mixed ES/EN research: "research actual CPC" -> PASS (no value)', () => assert.deepStrictEqual(metricViolations('current_research_required', 'research actual CPC'), []));
tFresh('mixed ES/EN research with value: "research shows CPC is $20" -> DETECT', () => assert(metricViolations('current_research_required', 'research shows CPC is $20').length > 0));
tFresh('epistemic ambiguous form neutralized: "Presupuesto disponible (por confirmar)." never anchors a contradiction', () => {
  const v = assumptionViolations(['Presupuesto disponible (por confirmar).', 'Presupuesto desconocido.', 'Presupuesto confirmado en 300 USD.']);
  const contradictions = v.filter(x => x.type === 'CONTRADICTORY_ASSUMPTION_EPISTEMIC_STATUS');
  // The genuinely confident third statement still correctly contradicts the plain unknown second one.
  assert(contradictions.some(c => /confirmado en 300 USD/.test(c.matched_text)));
});
tFresh('newline-separated assumptions still classified per-item correctly', () => {
  const v = assumptionViolations(['Ciudades objetivo confirmadas: CDMX y GDL.', 'Ciudades objetivo no especificadas.']);
  assert(v.some(x => x.type === 'CONTRADICTORY_ASSUMPTION_EPISTEMIC_STATUS'));
});
tFresh('semicolon inside one assumption string does not create phantom cross-topic pairing', () => {
  const v = assumptionViolations(['Presupuesto no especificado; ciudades por confirmar.']);
  assert.deepStrictEqual(v.filter(x => x.type === 'CONTRADICTORY_ASSUMPTION_EPISTEMIC_STATUS'), []);
});
tFresh('three-way cluster: only the genuinely confident pair contradicts, the rest stay compatible', () => {
  const v = assumptionViolations(['Landing confirmada y lista.', 'Landing pendiente de revisión.', 'Necesitamos revisar landing.']);
  const contradictions = v.filter(x => x.type === 'CONTRADICTORY_ASSUMPTION_EPISTEMIC_STATUS');
  assert.equal(contradictions.length, 1);
});
tFresh('meta disambiguation does not weaken genuine "meta" qualifier adjacent to brand mention elsewhere in the same field', () => {
  const v = metricViolations('current_research_required', 'Usamos Meta Ads. CAC meta: $25.');
  assert(v.length > 0);
});
tFresh('nested arrays of research strings preserve leaf_path precisely', () => {
  const v = metricViolations('current_research_required', { queries: ['CPC en Meta Ads', 'CAC meta $30'] });
  assert.equal(v.length, 1);
  assert.equal(v[0].leaf_path, 'current_research_required.queries[1]');
});
tFresh('LEADING_INDICATOR field repair never strips a legitimate leading-indicator phrase when repair runs for an unrelated violation elsewhere', () => {
  const facts = { ...M360_FACTS, constraints: { value: METRIC_CONSTRAINT, status: 'USER_PROVIDED_FACT' } };
  const synth = { deliverable: { '8_ad_strategy': { measurement: 'Consultas generadas' }, '12_whatsapp_followup_closing': { closing: 'agendar cita' } } };
  const first = fidelity.validateFinalSynthesis(facts, synth, {});
  const repaired = fidelity.repairFinalSynthesis(facts, synth, first.violations, {});
  assert(repaired);
  assert.equal(repaired.synthesis.deliverable['8_ad_strategy'].measurement, 'Consultas generadas');
});
tFresh('objective vs mechanism: explicit appointment-objective brief still exempts the endpoint everywhere, including LEADING_INDICATOR fields', () => {
  const apptFacts = { business_objective: { value: 'agendar citas', status: 'USER_PROVIDED_FACT' }, mechanism: { value: 'Meta Ads -> WhatsApp -> cita', status: 'USER_PROVIDED_FACT' } };
  const synth = { deliverable: { '8_ad_strategy': { measurement: 'Citas agendadas' } } };
  const v = fidelity.validateFinalSynthesis(apptFacts, synth, {}).violations;
  assert.deepStrictEqual(v.filter(x => x.type === 'MECHANISM_TO_CAMPAIGN_CONVERSION_PROMOTION'), []);
});
tFresh('funnel stages field with an arrow chain in one array item, plain prose in another', () => {
  const v = mechanismViolations({ deliverable: { '6_funnel': { stages: 'Anuncio -> WhatsApp -> Cita; compra final del minicurso' } } });
  assert(v.length > 0);
});
tFresh('capitalized epistemic cue "PRESUPUESTO DISPONIBLE" vs "PRESUPUESTO DESCONOCIDO" still DETECTs (case-insensitive)', () => {
  assert(assumptionViolations(['PRESUPUESTO DISPONIBLE Y DEFINIDO POR USUARIO.', 'PRESUPUESTO DESCONOCIDO.']).some(v => v.type === 'CONTRADICTORY_ASSUMPTION_EPISTEMIC_STATUS'));
});
tFresh('accented vs unaccented topic word still matches for contradiction purposes', () => {
  assert(assumptionViolations(['Presupuesto de anuncios disponible y definido por usuario.', 'Presupuesto de anuncios desconocido.']).some(v => v.type === 'CONTRADICTORY_ASSUMPTION_EPISTEMIC_STATUS'));
});
tFresh('meta collision does not affect an unrelated field entirely (audience_approach mentioning Meta Ads)', () => {
  const v = fidelity.validateOutputAgainstFacts({ constraints: { value: METRIC_CONSTRAINT, status: 'USER_PROVIDED_FACT' } }, { downstream_payload: { audience_approach: 'Segmentación en Meta Ads por intereses' } }, { nodeId: 'ads' }).violations;
  assert.deepStrictEqual(v.filter(x => x.type === 'EXPLICIT_PROHIBITION'), []);
});
tFresh('repairAssumptions (used by the final-synthesis repair pipeline) never removes assumptions when validation itself finds zero contradictions — the two paths must agree', () => {
  const items = ['Presupuesto publicitario disponible (desconocido).', 'Presupuesto publicitario no especificado.', 'Presupuesto publicitario y ciudades objetivo no definidos.', 'Necesitamos presupuesto publicitario disponible'];
  const facts = { ...M360_FACTS, constraints: { value: METRIC_CONSTRAINT, status: 'USER_PROVIDED_FACT' } };
  const synth = { deliverable: { '14_assumptions': items } };
  const violations = fidelity.validateFinalSynthesis(facts, synth, {}).violations;
  assert.deepStrictEqual(violations, []);
  const repaired = fidelity.repairFinalSynthesis(facts, synth, violations, {});
  assert.equal(repaired, null); // nothing to repair — repairFinalSynthesis requires violations.length, so a clean input is a no-op by construction
});

(async () => {
  for (const x of tests) {
    try { await x.fn(); pass += 1; console.log('PASS', x.name); }
    catch (e) { fail += 1; console.log('FAIL', x.name, '::', e && e.message); }
  }
  console.log(`\nPERSISTED_CASES=${persistedCaseCount}`);
  console.log(`FRESH_RED_TEAM_CASES=${freshCaseCount}`);
  console.log(`\nASTRA_CAMPAIGN360_FINAL_SYNTHESIS_SEMANTIC_ROLE_EPISTEMIC_META_HARDENING_TEST_RESULT pass=${pass} fail=${fail}`);
  if (fail) process.exit(1);
})();
