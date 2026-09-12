'use strict';
// ASTRA_CAMPAIGN360_FINAL_SYNTHESIS_ROLE_COHERENCE_REMEDIATION — closes two confirmed defects from
// the first live Método 360 job that completed all 8 nodes (job bf7fca56-0575-45d4-8bc1-f8791ed1abf7).
//
// DEFECT A — ROLE CONFUSION. The brief has two distinct semantic levels: the CAMPAIGN OBJECTIVE
// (selling the minicourse) and the PRODUCT MECHANISM it teaches (Meta Ads -> consulta ->
// conversación -> cita). Each node individually described its own piece correctly — no per-node
// fidelity violation fired live — but the FINAL SYNTHESIS silently let the mechanism's own
// endpoint ("cita") get listed as an alternative CAMPAIGN CONVERSION alongside the actual product
// purchase, in 3 places: funnel.conversion_intent, whatsapp closing, measurement.conversion_metrics.
// ROOT CAUSE: synthesize() (synthesis_engine_v2.js) is a pure pass-through/aggregator of each
// node's own downstream_payload — it never reasons about role/provenance, and no per-node or
// final-synthesis validator previously checked cross-node coherence between "what conversion IS
// this campaign" and "what does the mechanism teach". Fix lives entirely in
// brief_fidelity_validator.js's validateFinalSynthesis() (a NEW check, not touching synthesize()
// or any specialist) — the mechanism's own arrow-chain stage terms are extracted generically
// (works for "consulta -> conversación -> cita" AND "anuncio -> reserva -> visita" identically,
// never hardcoded), and only flagged when they appear as an ENUMERATED ALTERNATIVE inside the
// three deliverable fields that literally ARE the campaign's own conversion definition.
//
// DEFECT B — CONTRADICTORY ASSUMPTIONS. final_synthesis.14_assumptions simultaneously asserted
// "Presupuesto de anuncios disponible y definido por usuario." (a fact the brief never gave) and
// "Presupuesto de ads desconocido." — dedupeStrings() only removes byte-identical strings, so two
// nodes' opposite epistemic claims about the same topic both survived. ROOT CAUSE: no cross-field
// epistemic-consistency check existed for the assumptions list at all. Fix: a NEW
// checkAssumptionEpistemicConsistency(), also in validateFinalSynthesis() only — symmetric,
// rawRequest-keyword-presence-based (an attribution to "the user" for a topic absent from the raw
// brief text is fabricated; a denial of a topic present in the raw brief text is a false denial),
// plus an independent same-list cross-item contradiction check that needs no rawRequest at all.
//
// Offline, deterministic. No network, no real LLM calls.
const assert = require('assert');
const H = require('../src/workflows/marketing_campaign_360_hardened');
const fidelity = require('../src/workflows/brief_fidelity_validator');
const { AgentV1Adapter } = require('../src/adapter/agent_v1_adapter');

const tests = []; let pass = 0, fail = 0;
function t(name, fn) { tests.push({ name, fn }); }

const M360_MECHANISM = 'Meta Ads para generar consultas y WhatsApp para convertir: consulta → conversación → cita';
const M360_FACTS = {
  business_objective: { value: 'vender el minicurso', status: 'USER_PROVIDED_FACT' },
  mechanism: { value: M360_MECHANISM, status: 'USER_PROVIDED_FACT' },
};
const RAW_M360_NO_BUDGET = [
  'Crea una campaña 360 para Método 360.',
  'Es un minicurso grabado de $400 MXN dirigido a dueñas de estéticas en México.',
  'Objetivo: vender el minicurso.',
  'Enseña Meta Ads para generar consultas y WhatsApp para convertir:',
  'consulta → conversación → cita.',
  'No inventes métricas, resultados, CAC, ROAS, LTV, testimonios ni evidencia.',
].join('\n');

function synthWithFunnel(field, subKey, text, facts = M360_FACTS) {
  return { facts, synth: { deliverable: { [field]: { [subKey]: text } } } };
}
function mechanismViolations(facts, synth, rawRequest) {
  return fidelity.validateFinalSynthesis(facts, synth, { rawRequest }).violations.filter(v => v.type === 'MECHANISM_TO_CAMPAIGN_CONVERSION_PROMOTION');
}
function assumptionViolations(assumptions, rawRequest) {
  const synth = { deliverable: { '14_assumptions': assumptions } };
  return fidelity.validateFinalSynthesis({}, synth, { rawRequest }).violations.filter(v => ['UNSUPPORTED_USER_ATTRIBUTION', 'KNOWN_FACT_DENIAL', 'CONTRADICTORY_ASSUMPTION_EPISTEMIC_STATUS'].includes(v.type));
}

// ========== LIVE FIXTURE — reproduce the exact live defect, offline ==========
t('LIVE FIXTURE: the exact live final_synthesis reproduces all 5 violations (3 mechanism-promotion + 2 assumption-consistency)', () => {
  const synthesis = {
    deliverable: {
      '1_business_objective': 'vender el minicurso',
      '6_funnel': { conversion_intent: 'Comprar minicurso 400 MXN o agendar cita' },
      '12_whatsapp_followup_closing': { closing: 'PROPUESTA: Ofrecer link pago o agendar cita por calendario según preferencia' },
      '13_measurement_kpis': { conversion_metrics: 'Registros de compra; tasa respuesta WhatsApp; citas agendadas' },
      '14_assumptions': ['Presupuesto de anuncios disponible y definido por usuario.', 'Presupuesto de ads desconocido.'],
    },
  };
  const { violations } = fidelity.validateFinalSynthesis(M360_FACTS, synthesis, { rawRequest: RAW_M360_NO_BUDGET });
  const mechanismViols = violations.filter(v => v.type === 'MECHANISM_TO_CAMPAIGN_CONVERSION_PROMOTION');
  const assumptionViols = violations.filter(v => v.type === 'UNSUPPORTED_USER_ATTRIBUTION' || v.type === 'CONTRADICTORY_ASSUMPTION_EPISTEMIC_STATUS');
  assert.equal(mechanismViols.length, 3, JSON.stringify(violations));
  assert(mechanismViols.some(v => v.section === '6_funnel'));
  assert(mechanismViols.some(v => v.section === '12_whatsapp_followup_closing'));
  assert(mechanismViols.some(v => v.section === '13_measurement_kpis'));
  assert(assumptionViols.length >= 2, JSON.stringify(violations));
});

// ========== CASE A1-A12 — role semantics matrix ==========
t('CASE A1/A2: funnel "Comprar minicurso 400 MXN o agendar cita" -> FAIL cross-role coherence', () => {
  const { facts, synth } = synthWithFunnel('6_funnel', 'conversion_intent', 'Comprar minicurso 400 MXN o agendar cita');
  assert(mechanismViolations(facts, synth).some(v => v.matched_text === 'agendar cita'));
});
t('CASE A3: whatsapp closing "Ofrecer link pago o agendar cita" -> FAIL, cita not treated as campaign conversion', () => {
  const { facts, synth } = synthWithFunnel('12_whatsapp_followup_closing', 'closing', 'Ofrecer link pago o agendar cita');
  assert(mechanismViolations(facts, synth).length > 0);
});
t('CASE A4: measurement "compras completadas; citas agendadas" -> cita NOT left as a conversion KPI', () => {
  const { facts, synth } = synthWithFunnel('13_measurement_kpis', 'conversion_metrics', 'compras completadas; citas agendadas');
  assert(mechanismViolations(facts, synth).some(v => v.matched_text === 'citas agendadas'));
});
t('CASE A5: mechanism field itself describing the taught process -> PASS (not a campaign-conversion field)', () => {
  const synth = { deliverable: { '5_offer': { offer_structure: 'El curso enseña a convertir consulta -> conversación -> cita' } } };
  assert.deepStrictEqual(mechanismViolations(M360_FACTS, synth), []);
});
t('CASE A6: educational_content describing the process -> PASS', () => {
  const synth = { deliverable: { '2_target_audience_icp': { educational_content: 'Aprende a gestionar conversaciones de WhatsApp hasta la cita' } } };
  assert.deepStrictEqual(mechanismViolations(M360_FACTS, synth), []);
});
t('CASE A7: buyer desired outcome mentioning the mechanism -> PASS (not a campaign-conversion field, not auto-confused)', () => {
  const synth = { deliverable: { '2_target_audience_icp': { desired_outcomes: 'PROPUESTA: aprender a convertir consultas en citas' } } };
  assert.deepStrictEqual(mechanismViolations(M360_FACTS, synth), []);
});
t('CASE A8: explicit business_objective = "generar citas..." -> "citas" CAN be a campaign conversion (no universal ban)', () => {
  const facts = { business_objective: { value: 'generar citas para la estética', status: 'USER_PROVIDED_FACT' }, mechanism: M360_FACTS.mechanism };
  const synth = { deliverable: { '6_funnel': { conversion_intent: 'Comprar minicurso o agendar cita' } } };
  assert.deepStrictEqual(mechanismViolations(facts, synth), []);
});
t('CASE A9: business_objective explicitly states BOTH conversions -> both preserved', () => {
  const facts = { business_objective: { value: 'vender el minicurso y agendar una cita de diagnóstico', status: 'USER_PROVIDED_FACT' }, mechanism: M360_FACTS.mechanism };
  const synth = { deliverable: { '6_funnel': { conversion_intent: 'Comprar minicurso o agendar cita' } } };
  assert.deepStrictEqual(mechanismViolations(facts, synth), []);
});
t('CASE A10: no-arrow mechanism ("Meta Ads para conseguir clientes") -> "clientes" cannot become the campaign conversion without support', () => {
  const facts = { business_objective: { value: 'vender el minicurso', status: 'USER_PROVIDED_FACT' }, mechanism: { value: 'Meta Ads para conseguir clientes', status: 'USER_PROVIDED_FACT' } };
  const synth = { deliverable: { '6_funnel': { conversion_intent: 'Comprar el curso o conseguir clientes' } } };
  assert(mechanismViolations(facts, synth).some(v => v.matched_text === 'conseguir clientes'));
});
t('CASE A11: a PROPUESTA-marked new conversion idea is not silently confused with the mechanism endpoint', () => {
  const synth = { deliverable: { '6_funnel': { conversion_intent: 'PROPUESTA: ofrecer llamada opcional con asesor antes de comprar' } } };
  // No mechanism term ("cita"/"consulta"/"conversación") present at all -> not flagged by this check;
  // proposal-status handling (a separate, already-covered architecture) governs whether it stays PROPOSAL.
  assert.deepStrictEqual(mechanismViolations(M360_FACTS, synth), []);
});
t('CASE A12: clean final synthesis (objective=sale, conversion=purchase, mechanism_outcome=cita elsewhere) -> PASS', () => {
  const synth = { deliverable: { '6_funnel': { conversion_intent: 'Compra del minicurso' } } };
  assert.deepStrictEqual(mechanismViolations(M360_FACTS, synth), []);
});

// ========== CASE B1-B10 — epistemic consistency matrix ==========
const RAW_WITH_BUDGET = RAW_M360_NO_BUDGET + '\nPresupuesto Meta Ads: 500 MXN diarios.';
t('CASE B1: "Presupuesto de ads desconocido." (budget absent) -> PASS', () => {
  assert.deepStrictEqual(assumptionViolations(['Presupuesto de ads desconocido.'], RAW_M360_NO_BUDGET), []);
});
t('CASE B2: "Presupuesto definido por usuario." (budget absent) -> FAIL', () => {
  assert(assumptionViolations(['Presupuesto definido por usuario.'], RAW_M360_NO_BUDGET).some(v => v.type === 'UNSUPPORTED_USER_ATTRIBUTION'));
});
t('CASE B3: both "definido por usuario" and "desconocido" present -> FAIL contradiction', () => {
  const v = assumptionViolations(['Presupuesto definido por usuario.', 'Presupuesto desconocido.'], RAW_M360_NO_BUDGET);
  assert(v.some(x => x.type === 'CONTRADICTORY_ASSUMPTION_EPISTEMIC_STATUS'));
});
t('CASE B4: "PROPUESTA: definir presupuesto de ads." -> PASS', () => {
  assert.deepStrictEqual(assumptionViolations(['PROPUESTA: definir presupuesto de ads.'], RAW_M360_NO_BUDGET), []);
});
t('CASE B5: "Asumo que habrá presupuesto operativo; monto por confirmar." -> PASS (stays an ASSUMPTION)', () => {
  assert.deepStrictEqual(assumptionViolations(['Asumo que habrá presupuesto operativo; monto por confirmar.'], RAW_M360_NO_BUDGET), []);
});
t('CASE B6: brief states "Presupuesto Meta Ads: 500 MXN diarios", synthesis "Presupuesto definido: 500 MXN/día." -> PASS', () => {
  assert.deepStrictEqual(assumptionViolations(['Presupuesto definido: 500 MXN/día.'], RAW_WITH_BUDGET), []);
});
t('CASE B7: brief states the budget, synthesis "Presupuesto desconocido." -> FAIL known-fact denial', () => {
  const v = assumptionViolations(['Presupuesto desconocido.'], RAW_WITH_BUDGET);
  assert(v.some(x => x.type === 'KNOWN_FACT_DENIAL'));
});
t('CASE B8: "Cliente tiene enlace de pago listo." (isolated, UNKNOWN topic) -> not silently promoted to a hard contradiction', () => {
  assert.deepStrictEqual(assumptionViolations(['Cliente tiene enlace de pago listo.'], RAW_M360_NO_BUDGET), []);
});
t('CASE B9: "Equipo responde WhatsApp en tiempos comerciales adecuados." -> stays ASSUMPTION-safe', () => {
  assert.deepStrictEqual(assumptionViolations(['Equipo responde WhatsApp en tiempos comerciales adecuados.'], RAW_M360_NO_BUDGET), []);
});
t('CASE B10: "Link de pago operativo." + "Proveedor de pago por confirmar." (shared topic, opposite certainty) -> FAIL cross-field contradiction', () => {
  const v = assumptionViolations(['Link de pago operativo.', 'Proveedor de pago por confirmar.'], RAW_M360_NO_BUDGET);
  assert(v.some(x => x.type === 'CONTRADICTORY_ASSUMPTION_EPISTEMIC_STATUS'));
});

// ========== TEST P1-P5 — direct preservation ==========
t('TEST P1: canonical mechanism text remains available in final synthesis (never deleted)', () => {
  const synth = { deliverable: { '5_offer': { mechanism: M360_MECHANISM } } };
  const { violations } = fidelity.validateFinalSynthesis(M360_FACTS, synth, {});
  assert.deepStrictEqual(violations.filter(v => v.type === 'MECHANISM_TO_CAMPAIGN_CONVERSION_PROMOTION'), []);
  assert.equal(synth.deliverable['5_offer'].mechanism, M360_MECHANISM); // untouched, not stripped
});
t('TEST P2: campaign conversion aligned with purchase stays valid', () => {
  const { facts, synth } = synthWithFunnel('6_funnel', 'conversion_intent', 'Compra o pago del minicurso');
  assert.deepStrictEqual(mechanismViolations(facts, synth), []);
});
t('TEST P3: explicit user objective to book appointments keeps appointment conversion allowed', () => {
  const facts = { business_objective: { value: 'agendar citas para la consulta inicial', status: 'USER_PROVIDED_FACT' }, mechanism: M360_FACTS.mechanism };
  const synth = { deliverable: { '6_funnel': { conversion_intent: 'Agendar cita o confirmar la consulta' } } };
  assert.deepStrictEqual(mechanismViolations(facts, synth), []);
});
t('TEST P4: a PROPUESTA (módulo muestra gratuito) stays PROPUESTA, never promoted to USER_PROVIDED_FACT by this gate', () => {
  const facts = { constraints: { status: 'USER_PROVIDED_FACT', value: 'No inventes resultados.' } };
  const synth = { deliverable: { '5_offer': { value_stack: 'PROPUESTA: módulo de muestra gratuito' } } };
  const { violations } = fidelity.validateFinalSynthesis(facts, synth, {});
  assert.deepStrictEqual(violations.filter(v => v.type === 'UNLABELED_PROPOSAL'), []);
});
t('TEST P5: "No inventes resultados" explicit prohibition behavior is completely unchanged', () => {
  const facts = { constraints: { status: 'USER_PROVIDED_FACT', value: 'No inventes resultados.' } };
  const synth = { deliverable: { '6_funnel': { conversion_intent: 'PROPUESTA: Aumenta tus ventas' } } };
  const { violations } = fidelity.validateFinalSynthesis(facts, synth, {});
  assert(violations.some(v => v.category === 'invented_result'));
});

// ========== FULL PIPELINE — live-shaped mock run ==========
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
function buildMockLLM(payloadOverrides = {}, assumptionOverrides = {}) {
  return async (system) => {
    const st = specTypeFromSystem(system);
    const fields = SPEC_FIELDS[st] || [];
    const payload = {};
    for (const f of fields) payload[f] = CLEAN_STATEMENT;
    Object.assign(payload, payloadOverrides[st] || {});
    const current = /META_ADS/.test(st) ? ['CAPI', 'current attribution'] : (/WHATSAPP/.test(st) ? ['current WhatsApp API mechanics'] : []);
    const obj = {
      findings: [{ claim: 'grounded finding', support_class: 'DIRECTLY_SUPPORTED', evidence_ref: 'E1' }],
      recommendations: [{ recommendation: 'action for ' + st, support_class: 'INFERENCE', basis: 'method' }],
      decisions: [{ decision: 'd', rationale: 'r' }],
      assumptions: assumptionOverrides[st] || ['needs USER_PROVIDED_FACTS: budget'],
      conflicts: [], confidence: 0.7, current_research_required: current, downstream_payload: payload,
    };
    return { raw: JSON.stringify(obj), usage: { prompt: 10, completion: 10 } };
  };
}
function runWith(payloadOverrides, assumptionOverrides) {
  return H.run(RAW_M360_NO_BUDGET, { mode: 'llm', adapter: mockAdapter(), llm: buildMockLLM(payloadOverrides, assumptionOverrides), retrieve: true, salt: 'final-synthesis-role-coherence' });
}

t('LIVE REGRESSION FIXTURE (full pipeline): the exact live bad outputs, reproduced through mock node generation, fail closed at final synthesis', async () => {
  const r = await runWith(
    {
      FUNNEL_SPECIALIST: { conversion_intent: 'Comprar minicurso 400 MXN o agendar cita' },
      WHATSAPP_SALES_SPECIALIST: { appointment_closing: 'PROPUESTA: Ofrecer link pago o agendar cita por calendario según preferencia' },
      MEASUREMENT_CRO_SPECIALIST: { conversion_metrics: 'Registros de compra; tasa respuesta WhatsApp; citas agendadas' },
    },
    { MARKET_CONTEXT_SPECIALIST: ['Presupuesto de anuncios disponible y definido por usuario.'], ICP_SPECIALIST: ['Presupuesto de ads desconocido.'] }
  );
  assert.equal(r.workflow_state_status, 'FAILED');
  assert.equal(r.reason, 'BRIEF_FIDELITY_VIOLATION');
  const types = r.brief_fidelity_violations.map(v => v.type);
  assert(types.includes('MECHANISM_TO_CAMPAIGN_CONVERSION_PROMOTION'), JSON.stringify(r.brief_fidelity_violations));
  assert(types.includes('UNSUPPORTED_USER_ATTRIBUTION') || types.includes('CONTRADICTORY_ASSUMPTION_EPISTEMIC_STATUS'), JSON.stringify(r.brief_fidelity_violations));
});

t('LIVE REGRESSION FIXTURE (full pipeline): the clean/faithful Método 360 run still reaches COMPLETE', async () => {
  const r = await runWith({}, {});
  assert.equal(r.workflow_state_status, 'COMPLETE');
  assert.notEqual(r.reason, 'BRIEF_FIDELITY_VIOLATION');
});

(async () => {
  for (const x of tests) {
    try { await x.fn(); pass += 1; console.log('PASS', x.name); }
    catch (e) { fail += 1; console.log('FAIL', x.name, '::', e && e.message); }
  }
  console.log(`\nASTRA_CAMPAIGN360_FINAL_SYNTHESIS_ROLE_COHERENCE_REMEDIATION_TEST_RESULT pass=${pass} fail=${fail}`);
  if (fail) process.exit(1);
})();
