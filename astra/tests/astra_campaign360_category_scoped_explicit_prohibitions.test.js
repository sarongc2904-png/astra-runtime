'use strict';
const assert = require('assert');
const fidelity = require('../src/workflows/brief_fidelity_validator');

const tests = [];
function t(name, fn) { tests.push({ name, fn }); }
function violations(constraints, output, fieldKey = 'buying_triggers', nodeId = 'icp') {
  const facts = { constraints: { status: 'USER_PROVIDED_FACT', value: constraints } };
  return fidelity.validateOutputAgainstFacts(facts, { downstream_payload: { [fieldKey]: output } }, { nodeId })
    .violations.filter(v => v.type === 'EXPLICIT_PROHIBITION');
}
function passes(constraints, output) { assert.deepStrictEqual(violations(constraints, output), []); }
function fails(constraints, output, category) {
  const found = violations(constraints, output);
  assert(found.some(v => v.category === category), JSON.stringify({ constraints, output, found }));
}

const METHOD360 = 'No inventes métricas, resultados, CAC, ROAS, LTV, testimonios ni evidencia.';
t('A Método 360 does not activate scarcity for escasez', () => passes(METHOD360, 'escasez'));
t('B Método 360 does not activate scarcity for oferta limitada', () => passes(METHOD360, 'oferta limitada'));
t('C explicit escasez blocks escasez', () => fails('No inventes escasez.', 'escasez', 'scarcity'));
t('D explicit escasez blocks oferta limitada', () => fails('No inventes escasez.', 'oferta limitada', 'scarcity'));
t('E explicit urgencia blocks urgency', () => fails('No inventes urgencia.', 'urgencia', 'urgency'));
t('F explicit testimonios blocks testimonial', () => fails('No inventes testimonios.', 'testimonio de cliente', 'testimonials'));
t('G testimonios does not activate scarcity', () => passes('No inventes testimonios.', 'escasez'));
t('H explicit CAC or ROAS activates invented_metric', () => fails('No inventes CAC ni ROAS.', 'CAC estimado 200', 'invented_metric'));
t('I generic métricas activates invented_metric', () => fails('No inventes métricas.', 'ROAS proyectado 4', 'invented_metric'));
t('J negated active scarcity occurrence passes', () => passes('No inventes escasez.', 'No usar escasez'));
t('K UNKNOWN testimonial passes', () => passes('No inventes testimonios.', 'testimonios = UNKNOWN'));
t('L absent proof passes', () => passes('No inventes proof.', 'no hay proof'));
t('M exact live V7 path does not receive scarcity violations', () => {
  for (const output of ['escasez', 'oferta limitada']) {
    const found = violations(METHOD360, output);
    assert(!found.some(v => v.category === 'scarcity'), JSON.stringify(found));
  }
});
t('N explicitly prohibited scarcity remains blocked on the live path', () => {
  const found = violations('No inventes escasez.', 'oferta limitada');
  const violation = found.find(v => v.category === 'scarcity');
  assert(violation);
  assert.equal(violation.path, 'node_outputs.icp.downstream_payload.buying_triggers');
});
t('combined explicit categories activate independently', () => {
  fails('No inventes urgencia ni escasez.', 'urgencia', 'urgency');
  fails('No inventes urgencia ni escasez.', 'oferta limitada', 'scarcity');
});
t('unrelated categories never activate by association', () => {
  for (const output of ['urgencia', 'deadline', 'garantizamos resultados', 'caso de estudio']) passes('No inventes testimonios.', output);
});
t('proof and social proof remain distinct categories', () => {
  fails('No inventes proof.', 'Agregar proof', 'proof');
  passes('No inventes proof.', 'caso de estudio');
  fails('No inventes prueba social ni caso de estudio.', 'caso de estudio', 'social_proof');
});
t('deadline and guarantee activate only from their own terms', () => {
  fails('No inventes deadline.', 'deadline de inscripción', 'deadline');
  fails('No inventes garantía de resultado.', 'garantizamos resultados', 'guarantee');
  fails('No garantizamos resultados.', 'garantizamos resultados', 'guarantee');
  passes('No inventes resultados.', 'garantizamos resultados');
});
t('evidence and resultados alone create no unrelated category', () => {
  for (const constraint of ['No inventes evidencia.', 'No inventes resultados.']) {
    for (const output of ['escasez', 'urgencia', 'testimonio', 'deadline']) passes(constraint, output);
  }
});

(async () => {
  let pass = 0; let fail = 0;
  for (const test of tests) {
    try { await test.fn(); pass += 1; console.log('PASS', test.name); }
    catch (error) { fail += 1; console.log('FAIL', test.name, error.stack); }
  }
  console.log(`CATEGORY_SCOPED_EXPLICIT_PROHIBITIONS_TEST_RESULT pass=${pass} fail=${fail}`);
  if (fail) process.exitCode = 1;
})();
