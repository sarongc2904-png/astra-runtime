'use strict';
// ASTRA_CAMPAIGN360_RESULT_CLAIM_INTENT_CONTEXT_REMEDIATION — confirmed live false positive
// (job ec5fa16f-2cdf-4a9d-9439-8e6ea7761725, request 844abe70-6a29-483e-8f4d-77fdfcb27ae3):
// market_context.market_assumptions = "Compradoras buscan capacitación práctica para aumentar
// ingresos" was flagged EXPLICIT_PROHIBITION/invented_result. That sentence describes the BUYER's
// own goal/desire ("buscan ... para aumentar ingresos") — not a promise or claim the system is
// making. The prior invented_result detector (CLAIM_VERB + OUTCOME_TERM, added under the
// negative-constraint remediation) had no notion of GOAL/INTENT/DESIRE context at all.
//
// Fix: a clause-scoped GOAL_INTENT_ESCAPE_CUE (buscan/quieren/desean/necesitan/aspiran/esperan +
// "objetivo/meta/intención es", all in THIRD PERSON) suppresses invented_result within that
// clause — grammatical person is the load-bearing signal: third-person forms describe someone
// else's goal and escape; first-person-plural forms (queremos/buscamos/...) are the advertiser's
// OWN voice and are deliberately excluded from the cue list, so "Queremos aumentar tus ventas"
// still detects. A second, independent gap surfaced while building the required test matrix: the
// verb list only matched bare infinitives, missing conjugated/imperative forms ("Consigue más
// ventas", "Aumenta tu ticket promedio") — fixed by matching each verb's shared conjugation stem.
//
// Offline, deterministic. No network, no real LLM calls.
const assert = require('assert');
const fidelity = require('../src/workflows/brief_fidelity_validator');

const tests = []; let pass = 0, fail = 0;
function t(name, fn) { tests.push({ name, fn }); }

const METHOD360_CONSTRAINTS = 'No inventes métricas, resultados, CAC, ROAS, LTV, testimonios ni evidencia.';
function violations(text, fieldKey = 'hooks', nodeId = 'creative_strategy', constraintsValue = METHOD360_CONSTRAINTS) {
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

// ========== CASE 1-5: goal/desire/intent context => PASS ==========
t('CASE 1 "Compradoras buscan capacitación práctica para aumentar ingresos" => PASS', () => passes('Compradoras buscan capacitación práctica para aumentar ingresos'));
t('CASE 2 "Las dueñas quieren aumentar sus ventas" => PASS', () => passes('Las dueñas quieren aumentar sus ventas'));
t('CASE 3 "Su objetivo es conseguir más citas" => PASS', () => passes('Su objetivo es conseguir más citas'));
t('CASE 4 "Necesitan mejorar sus ingresos" => PASS', () => passes('Necesitan mejorar sus ingresos'));
t('CASE 5 "Desean aumentar el ticket promedio" => PASS', () => passes('Desean aumentar el ticket promedio'));

// ========== CASE 6-10: direct claims still DETECT ==========
t('CASE 6 "PROPUESTA: aumentar ingresos" => DETECT', () => detects('PROPUESTA: aumentar ingresos'));
t('CASE 7 "Consigue más ventas" => DETECT (conjugated/imperative form)', () => detects('Consigue más ventas'));
t('CASE 8 "Citas que pagan más" => DETECT', () => detects('Citas que pagan más'));
t('CASE 9 "Aumenta tu ticket promedio" => DETECT (conjugated/imperative form)', () => detects('Aumenta tu ticket promedio'));
t('CASE 10 "PROPUESTA: mejorar ingresos" => DETECT', () => detects('PROPUESTA: mejorar ingresos'));

// ========== CASE 11-13: measurement/experiment context stays safe ==========
t('CASE 11 "medir ventas" => PASS', () => passes('medir ventas'));
t('CASE 12 "analizar ticket promedio" => PASS', () => passes('analizar ticket promedio'));
t('CASE 13 "probar mensajes para mejorar conversión" => PASS', () => passes('probar mensajes para mejorar conversión'));

// ========== CASE 14-15: magnitude-based claims still DETECT (prior remediation preserved) ==========
t('CASE 14 "PROPUESTA: aumentar ventas 30%" => DETECT', () => detects('PROPUESTA: aumentar ventas 30%'));
t('CASE 15 "PROPUESTA: citas que pagan más en 30 días" => DETECT', () => detects('PROPUESTA: citas que pagan más en 30 días'));

// ========== Person-sensitivity: third-party desire escapes, advertiser's own voice does not ==========
t('third-person desire escapes: "Buscan generar más consultas" => PASS', () => passes('Buscan generar más consultas'));
t('first-person-plural is the advertiser\'s own claim, must NOT escape: "Queremos aumentar tus ventas" => DETECT', () => detects('Queremos aumentar tus ventas'));
t('first-person-plural "Necesitamos mejorar los ingresos" (system framing, not buyer desire) => DETECT', () => detects('Necesitamos mejorar los ingresos'));

// ========== LIVE REGRESSION FIXTURE — job ec5fa16f-2cdf-4a9d-9439-8e6ea7761725 ==========
t('LIVE FIXTURE: market_context.market_assumptions exact live false-positive text no longer flagged', () => {
  const v = violations('Compradoras buscan capacitación práctica para aumentar ingresos', 'market_assumptions', 'market_context');
  assert.deepStrictEqual(v.filter(x => x.type === 'EXPLICIT_PROHIBITION' && x.category === 'invented_result'), [], JSON.stringify(v));
});

// ========== False-positive control: goal/intent cue does not blanket-suppress OTHER categories ==========
t('FALSE_POSITIVE_CONTROL: a goal/intent-framed sentence that also names a genuinely prohibited category (testimonials) still detects that category', () => {
  const v = violations('Buscan testimonios de otras clientas antes de decidir', 'pains', 'icp');
  assert(v.some(x => x.type === 'EXPLICIT_PROHIBITION' && x.category === 'testimonials'), JSON.stringify(v));
});
t('FALSE_POSITIVE_CONTROL: required mechanism-preservation prose still never false-positives', () => {
  passes('Enseña Meta Ads para generar consultas y WhatsApp para convertir consulta → conversación → cita.');
});

(async () => {
  for (const x of tests) {
    try { await x.fn(); pass += 1; console.log('PASS', x.name); }
    catch (e) { fail += 1; console.log('FAIL', x.name, '::', e && e.message); }
  }
  console.log(`\nASTRA_CAMPAIGN360_RESULT_CLAIM_INTENT_CONTEXT_REMEDIATION_TEST_RESULT pass=${pass} fail=${fail}`);
  if (fail) process.exit(1);
})();
