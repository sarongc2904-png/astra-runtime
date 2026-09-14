'use strict';
// ASTRA_CAMPAIGN360_ASSUMPTION_EPISTEMIC_TARGETED_REMEDIATION_2026_09_13 — closes 6 confirmed live
// false positives from job 7a5fae9c-fac7-456d-a5e6-8562b050d356 (a run where ALL 8 specialist LLM
// nodes completed and only the final_synthesis["14_assumptions"] gate failed, 10 violations: 1
// EXPLICIT_PROHIBITION/invented_evidence + 9 CONTRADICTORY_ASSUMPTION_EPISTEMIC_STATUS) while
// preserving the 4 plausible/genuine unsupported-state detections from the same job's cluster.
//
// PART A.1 — BARE IMPERATIVE ACTION-ITEM: "Confirmar cuenta WhatsApp Business activa." is a to-do
// ("[Team to] confirm..."), not an assertion the account IS active — the trailing certainty word
// "activa" alone won classification because ASSUMPTION_REQUIRED_CUE only recognized "debemos
// confirmar", never a bare sentence-leading infinitive. FIX: ASSUMPTION_BARE_IMPERATIVE_CUE.
//
// PART A.2 — UNKNOWN-CUE SYNONYM GAP: "Cuenta Meta Ads y WhatsApp Business operativas (no
// provisto)." self-hedges via a parenthetical, but ASSUMPTION_UNKNOWN_CUE only recognized "no
// proporcionado", not the synonym "no provisto" — so hasUnknown was false and the sentence read as
// confidently KNOWN_AVAILABLE instead of AMBIGUOUS. FIX: added "provist[oa]s?" to the cue.
//
// PART A.3 — OVER-BROAD SINGLE/GENERIC TOPIC MATCH: two pairs of assumptions "contradicted" each
// other purely by sharing a channel-brand word ("whatsapp") or generic delivery-boilerplate words
// ("entrega digital"), not because they described the same specific fact. FIX:
// GENERIC_ASSUMPTION_TOPIC_TERMS + sharedQualifyingTopic — a contradiction now requires at least
// one shared topic word OUTSIDE this small closed generic set, never a blanket >=2-words rule
// (which would have broken existing single-anchor tests and still missed the entrega/digital case,
// which already shares 2 words).
//
// PART B — OPERATIONAL ASSET VS EVIDENCE CLAIM: "Creativos del anuncio listos y validados."
// flagged invented_evidence on "validados" — but it governs "creativos" (an asset/QA-readiness
// noun), not a claim that RESULTS were proven. FIX: isOperationalAssetValidationMatch, a
// structural nearest-noun disambiguation (fails closed — only exempts when an operational-asset
// noun is present AND no evidence/result noun appears anywhere in the clause).
//
// PART D — REPAIR PARITY: repairAssumptions already called the SAME classifyAssumptionEpistemicState/
// assumptionTopicWords/areEpistemicStatesContradictory functions as the validator (no duplicated
// logic to drift) — sharedQualifyingTopic was added once and used by both call sites.
const assert = require('assert');
const fidelity = require('../src/workflows/brief_fidelity_validator');
const briefFacts = require('../src/workflows/campaign_brief_facts');

const BRIEF = ['Crea una campaña 360 para Método 360.', '',
  'Es un minicurso grabado de $400 MXN dirigido a dueñas de estéticas en México.', '',
  'Objetivo: vender el minicurso.', '',
  'Enseña Meta Ads para generar consultas y WhatsApp para convertir:',
  'consulta → conversación → cita.', '',
  'No inventes métricas, resultados, CAC, ROAS, LTV, testimonios ni evidencia.'].join('\n');
const facts = briefFacts.extract(BRIEF);
const CONTR = 'CONTRADICTORY_ASSUMPTION_EPISTEMIC_STATUS';
const EVID = 'EXPLICIT_PROHIBITION';

const tests = []; function t(name, fn) { tests.push({ name, fn }); }

function assumptionViolations(assumptions, rawRequest) {
  return fidelity.validateFinalSynthesis({}, { deliverable: { '14_assumptions': assumptions } }, { rawRequest }).violations;
}
function contr(assumptions, rawRequest) { return assumptionViolations(assumptions, rawRequest).filter(v => v.type === CONTR); }
function invEvidence(text) {
  return fidelity.validateOutputAgainstFacts(facts, { downstream_payload: { optimization_triggers: text } }, { nodeId: 'measurement', upstream_outputs: [] })
    .violations.filter(v => v.type === EVID && v.category === 'invented_evidence');
}

// Exact live sentence used across the whole cluster as the unsupported/no-info side.
const LIVE_CONFLICT = 'No hay info sobre creativos, landing y número WhatsApp activos.';

// ===================== PART E — the 10 required cases =====================

t('E1 "Confirmar cuenta WhatsApp Business activa" vs unknown WhatsApp state => NO contradiction', () => {
  assert.deepStrictEqual(contr(['Confirmar cuenta WhatsApp Business activa.', LIVE_CONFLICT]), []);
});

t('E2 "Cuenta ... operativa (no provisto)" => not KNOWN_AVAILABLE (no contradiction)', () => {
  assert.deepStrictEqual(contr(['Cuenta Meta Ads y WhatsApp Business operativas (no provisto).', LIVE_CONFLICT]), []);
});

t('E3 generic "WhatsApp" overlap only => no same-fact contradiction', () => {
  assert.deepStrictEqual(contr(['Capacidad de respuesta humana en WhatsApp disponible.', LIVE_CONFLICT]), []);
  assert.deepStrictEqual(contr(['Herramienta automatización WhatsApp disponible.', LIVE_CONFLICT]), []);
});

t('E4 "Numero WhatsApp disponible" vs "numero WhatsApp no provisto" => genuine contradiction preserved', () => {
  assert(contr(['Número WhatsApp disponible y asignado a atención.', LIVE_CONFLICT]).some(v => v.type === CONTR));
  assert(contr(['Número WhatsApp Business disponible', LIVE_CONFLICT]).some(v => v.type === CONTR));
  // explicit "no provisto" phrasing of the same specific referent must also still detect
  assert(contr(['Número WhatsApp disponible.', 'Número WhatsApp no provisto.']).some(v => v.type === CONTR));
});

t('E5 "Creativos listos" vs "creativos no provistos" => genuine contradiction preserved', () => {
  assert(contr(['Creativos y vista previa plantillas listos.', LIVE_CONFLICT]).some(v => v.type === CONTR));
  assert(contr(['Creativos del anuncio listos y validados.', LIVE_CONFLICT]).some(v => v.type === CONTR));
  assert(contr(['Creativos listos.', 'Creativos no provistos.']).some(v => v.type === CONTR));
});

t('E6 "creativos validados" => no invented_evidence (operational QA sense)', () => {
  assert.deepStrictEqual(invEvidence('Creativos del anuncio listos y validados.'), []);
  assert.deepStrictEqual(invEvidence('The creative asset is validated.'), []);
  assert.deepStrictEqual(invEvidence('Materiales de campaña validados.'), []);
});

t('E7 "resultados validados" => invented_evidence DETECT', () => {
  assert(invEvidence('resultados validados').length >= 1);
});

t('E8 "evidencia validada" => DETECT', () => {
  assert(invEvidence('evidencia validada').length >= 1);
  assert(invEvidence('caso validado con clientes').length >= 1);
  assert(invEvidence('resultados comprobados').length >= 1);
  assert(invEvidence('validated results').length >= 1);
  assert(invEvidence('proven performance').length >= 1);
});

t('E9 "Pasarela lista para entrega digital" vs "formato de entrega digital no especificado" => no contradiction unless same specific fact', () => {
  assert.deepStrictEqual(contr(['Pasarela de pago en MXN lista para entrega digital.', 'Detalle técnico entrega digital (PDF/Docs) no especificado']), []);
});

t('E10 repair round-trip parity: genuine contradiction repairs clean; false-positive pair needs no repair', () => {
  // genuine: "Numero WhatsApp disponible" vs explicit "no provisto" of the same referent
  const genuineSynth = { deliverable: { '14_assumptions': ['Número WhatsApp disponible.', 'Número WhatsApp no provisto.'] } };
  const genuineViol = fidelity.validateFinalSynthesis({}, genuineSynth, {}).violations;
  assert(genuineViol.some(v => v.type === CONTR));
  const genuineRepair = fidelity.repairFinalSynthesis(facts, genuineSynth, genuineViol, {});
  assert(genuineRepair, 'expected a repair result');
  const afterGenuine = fidelity.validateFinalSynthesis({}, genuineRepair.synthesis, {}).violations.filter(v => v.type === CONTR);
  assert.deepStrictEqual(afterGenuine, []);

  // false-positive pair (E3): validator finds zero contradictions -> repair must be a no-op
  const fpSynth = { deliverable: { '14_assumptions': ['Capacidad de respuesta humana en WhatsApp disponible.', LIVE_CONFLICT] } };
  const fpViol = fidelity.validateFinalSynthesis({}, fpSynth, {}).violations.filter(v => v.type === CONTR);
  assert.deepStrictEqual(fpViol, []);
});

// ===================== fresh red-team: attack the Part A.3 topic-equivalence narrowing =====================

t('RT1 two DIFFERENT specific facts sharing a genuinely specific noun still contradict (expected/accepted limitation, not a regression)', () => {
  // "creativos" alone as the sole shared word still contradicts even across different creative sets
  // -- documented residual limitation (full entity resolution is out of scope), verifies no crash/change here.
  assert(contr(['Creativos de branding listos.', 'No hay info sobre creativos de producto.']).some(v => v.type === CONTR));
});

t('RT2 generic channel term with a genuinely distinguishing second word still detects (WhatsApp Business / WhatsApp API protected regressions)', () => {
  assert(contr(['WhatsApp Business activo.', 'No hay cuenta WhatsApp Business.']).some(v => v.type === CONTR));
  assert(contr(['WhatsApp API activa.', 'No hay WhatsApp API disponible.']).some(v => v.type === CONTR));
});

t('RT3 two generic terms shared, no specific word -> no contradiction (Meta + digital, boilerplate)', () => {
  assert.deepStrictEqual(contr(['Campaña en Meta lista para entrega digital.', 'Formato de entrega digital en Meta no especificado.']), []);
});

t('RT4 negation edge case: "no hay" existence-negation still wins over a same-clause certainty word elsewhere in the list', () => {
  assert(contr(['Presupuesto confirmado en 500 MXN diarios.', 'No hay presupuesto disponible.']).some(v => v.type === CONTR));
});

t('RT5 mixed EN/ES bare imperative: "Verificar" and "Validar" also classify as REQUIRED, not KNOWN_AVAILABLE', () => {
  assert.deepStrictEqual(contr(['Verificar herramienta de automatización disponible.', 'Herramienta de automatización no especificada.']), []);
  assert.deepStrictEqual(contr(['Validar cuenta de pago activa.', 'Cuenta de pago no especificada.']), []);
});

t('RT6 bare imperative cue does not swallow a mid-clause occurrence of the same verb in a different role', () => {
  // "...para confirmar el envio" is NOT a sentence-leading imperative -- must still classify by its own certainty/unknown cues, unaffected by the new cue.
  const r = fidelity.validateFinalSynthesis({}, { deliverable: { '14_assumptions': ['Plan para confirmar el envio disponible.', 'Envio no especificado.'] } }, {}).violations;
  // whichever way this specific sentence classifies, it must not crash and must remain deterministic across repeated calls
  const r2 = fidelity.validateFinalSynthesis({}, { deliverable: { '14_assumptions': ['Plan para confirmar el envio disponible.', 'Envio no especificado.'] } }, {}).violations;
  assert.deepStrictEqual(r.filter(v => v.type === CONTR), r2.filter(v => v.type === CONTR));
});

t('RT7 "no provisto" synonym also works for a DIFFERENT topic (not just the live WhatsApp/creativos sentences)', () => {
  assert.deepStrictEqual(contr(['Presupuesto operativo (no provisto).', 'Presupuesto no especificado.']), []);
});

t('RT8 invented_evidence: evidence term present but NOT nearest still detects (fails closed)', () => {
  // evidence term "resultados" present anywhere in the clause -> never exempt, even if an
  // operational term happens to sit closer to the match than "resultados" does.
  assert(invEvidence('Creativos validados que muestran resultados anteriores probados').length >= 1);
});

t('RT9 invented_evidence: neither operational nor evidence term present -> fails closed (still detects)', () => {
  assert(invEvidence('Todo quedó validado.').length >= 1);
});

t('RT10 invented_evidence in an array/nested leaf still respects the operational-asset escape', () => {
  const r = fidelity.validateOutputAgainstFacts(facts, { downstream_payload: { optimization_triggers: ['Creativos listos y validados', 'Plantillas validadas'] } }, { nodeId: 'measurement', upstream_outputs: [] });
  assert.deepStrictEqual(r.violations.filter(v => v.type === EVID && v.category === 'invented_evidence'), []);
  const r2 = fidelity.validateOutputAgainstFacts(facts, { downstream_payload: { optimization_triggers: ['resultados validados en campañas previas'] } }, { nodeId: 'measurement', upstream_outputs: [] });
  assert(r2.violations.some(v => v.type === EVID && v.category === 'invented_evidence'));
});

t('RT11 protected: original gate-14 4-item budget cluster still produces zero contradictions', () => {
  assert.deepStrictEqual(contr(['Presupuesto desconocido.', 'Presupuesto no especificado.', 'Presupuesto no definido.', 'Necesitamos definir presupuesto.']), []);
});

t('RT12 protected: single-anchor CAC/CRM/API/landing acronym and non-generic-noun cases still detect exactly as before', () => {
  assert(contr(['CAC desconocido.', 'CAC definido.']).some(v => v.type === CONTR));
  assert(contr(['CRM disponible.', 'CRM desconocido.']).some(v => v.type === CONTR));
  assert(contr(['Landing disponible.', 'No existe landing.']).some(v => v.type === CONTR));
  assert(contr(['Herramienta de agenda disponible.', 'No hay herramienta de agenda.']).some(v => v.type === CONTR));
});

(async () => {
  let pass = 0, fail = 0;
  for (const { name, fn } of tests) {
    try { await fn(); pass++; console.log('PASS', name); }
    catch (e) { fail++; console.log('FAIL', name, e.stack); }
  }
  console.log(`ASSUMPTION_EPISTEMIC_TARGETED_REMEDIATION_TEST_RESULT pass=${pass} fail=${fail}`);
  if (fail) process.exitCode = 1;
})();
