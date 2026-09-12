'use strict';
// ASTRA_CAMPAIGN360_QUALITATIVE_RESULT_CLAIM_ADJUDICATION — the prior invented_result detector
// (added under the NEGATIVE_CONSTRAINT_AND_PROPOSAL_STATUS_REMEDIATION gate) required an explicit
// numeric/temporal magnitude to fire, which missed purely qualitative result claims/promises:
// "aumentar ticket promedio", "conseguir más ventas", "mejorar ingresos", "citas que pagan más"
// carry no digit at all yet are just as much an invented result as "aumentar ventas 30%".
//
// Fix: invented_result now also fires on a CLAIM_VERB (aumentar/incrementar/subir/mejorar/
// conseguir/lograr/obtener/reducir/bajar/pagan) paired with an OUTCOME_TERM in EITHER order, with
// no magnitude required — these are comparative/achievement verbs that essentially never appear
// in ordinary mechanism/funnel description without asserting a change. "generar" is kept in its
// own, magnitude-REQUIRED tier since it is completely ordinary language for describing what a
// funnel itself does ("generar consultas", "generar leads") — see the regression guards below.
// A CLAIM_VERB inside a "para <goal>" clause whose OWN clause opens with a MEASUREMENT_VERB
// (medir/analizar/registrar/probar/testear/...) is excluded — it describes an experiment's goal,
// not an asserted/expected result ("probar mensajes para mejorar conversión").
//
// Offline, deterministic. No network, no real LLM calls.
const assert = require('assert');
const fidelity = require('../src/workflows/brief_fidelity_validator');

const tests = []; let pass = 0, fail = 0;
function t(name, fn) { tests.push({ name, fn }); }

function violations(text, constraintsValue = 'no inventar resultados', fieldKey = 'hooks', nodeId = 'creative_strategy') {
  const facts = { constraints: { status: 'USER_PROVIDED_FACT', value: constraintsValue } };
  return fidelity.validateOutputAgainstFacts(facts, { downstream_payload: { [fieldKey]: text } }, { nodeId }).violations;
}
function detects(text) {
  const v = violations(text);
  assert(v.some(x => x.type === 'EXPLICIT_PROHIBITION' && x.category === 'invented_result'), JSON.stringify({ text, v }));
}
function passes(text) {
  const v = violations(text).filter(x => x.type === 'EXPLICIT_PROHIBITION' && x.category === 'invented_result');
  assert.deepStrictEqual(v, [], JSON.stringify({ text, v }));
}

t('CASE 1 "PROPUESTA: aumentar ticket promedio" => DETECT', () => detects('PROPUESTA: aumentar ticket promedio'));
t('CASE 2 "PROPUESTA: conseguir más ventas" => DETECT', () => detects('PROPUESTA: conseguir más ventas'));
t('CASE 3 "PROPUESTA: mejorar ingresos" => DETECT', () => detects('PROPUESTA: mejorar ingresos'));
t('CASE 4 "PROPUESTA: citas que pagan más" => DETECT', () => detects('PROPUESTA: citas que pagan más'));
t('CASE 5 "PROPUESTA: medir ventas" => PASS (measurement action)', () => passes('PROPUESTA: medir ventas'));
t('CASE 6 "PROPUESTA: analizar ticket promedio" => PASS (analysis action)', () => passes('PROPUESTA: analizar ticket promedio'));
t('CASE 7 "PROPUESTA: registrar ingresos" => PASS (recording action)', () => passes('PROPUESTA: registrar ingresos'));
t('CASE 8 "PROPUESTA: probar mensajes para mejorar conversión" => PASS (experiment goal, no asserted result)', () => passes('PROPUESTA: probar mensajes para mejorar conversión'));
t('CASE 9 "PROPUESTA: aumentar ventas 30%" => DETECT', () => detects('PROPUESTA: aumentar ventas 30%'));
t('CASE 10 "PROPUESTA: citas que pagan más en 30 días" => DETECT', () => detects('PROPUESTA: citas que pagan más en 30 días'));

// ========== False-positive control: measurement/analysis/experiment verbs stay safe generally ==========
t('measurement verbs stay safe even directly adjacent to outcome terms', () => {
  for (const text of ['PROPUESTA: medir leads generados', 'PROPUESTA: analizar conversión del funnel', 'PROPUESTA: registrar clientes atendidos', 'PROPUESTA: revisar ticket promedio semanal']) {
    passes(text);
  }
});
t('a bare claim verb with no outcome term nearby stays safe (no unrelated-topic false positive)', () => {
  passes('PROPUESTA: mejorar la velocidad de carga de la landing page');
});

// ========== Regression guards: prior magnitude-based detection and mechanism prose still safe ==========
t('REGRESSION GUARD: required mechanism-preservation prose ("generar consultas ... convertir consulta -> cita") still never false-positives', () => {
  passes('Enseña Meta Ads para generar consultas y WhatsApp para convertir consulta → conversación → cita.');
});
t('REGRESSION GUARD: "generar leads" alone (no magnitude) stays safe — generar is magnitude-gated', () => {
  passes('PROPUESTA: generar leads calificados para el equipo de ventas.');
});
t('REGRESSION GUARD: "generar" WITH a magnitude still detects (magnitude-gated tier still fires when earned)', () => {
  detects('PROPUESTA: generar 50 leads calificados.');
});
t('REGRESSION GUARD: prior magnitude-based CASE (obtener 50 ventas) still detects', () => detects('PROPUESTA: obtener 50 ventas'));
t('REGRESSION GUARD: prior CASE (Objetivo ROAS 4x) still detects via invented_metric', () => {
  const v = violations('PROPUESTA: Objetivo ROAS 4x', 'No inventes métricas, resultados, CAC, ROAS, LTV, testimonios ni evidencia.');
  assert(v.some(x => x.type === 'EXPLICIT_PROHIBITION' && x.category === 'invented_metric'), JSON.stringify(v));
});

(async () => {
  for (const x of tests) {
    try { await x.fn(); pass += 1; console.log('PASS', x.name); }
    catch (e) { fail += 1; console.log('FAIL', x.name, '::', e && e.message); }
  }
  console.log(`\nASTRA_CAMPAIGN360_QUALITATIVE_RESULT_CLAIM_ADJUDICATION_TEST_RESULT pass=${pass} fail=${fail}`);
  if (fail) process.exit(1);
})();
