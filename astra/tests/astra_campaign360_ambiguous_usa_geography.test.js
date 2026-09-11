'use strict';
const assert = require('assert');
const fidelity = require('../src/workflows/brief_fidelity_validator');

const facts = { geography: { status: 'USER_PROVIDED_FACT', value: 'México' } };
const tests = [];
function t(name, fn) { tests.push({ name, fn }); }
function validate(fieldKey, value, nodeId = 'icp') {
  return fidelity.validateOutputAgainstFacts(
    facts,
    { downstream_payload: { [fieldKey]: value } },
    { nodeId },
  ).violations.filter(v => v.type === 'GEOGRAPHY_SUBSTITUTION');
}
function passes(fieldKey, value, nodeId) {
  assert.deepStrictEqual(validate(fieldKey, value, nodeId), [], JSON.stringify({ fieldKey, value }));
}
function fails(fieldKey, value, expected = 'usa', nodeId) {
  const violations = validate(fieldKey, value, nodeId);
  assert.equal(violations.length, 1, JSON.stringify({ fieldKey, value, violations }));
  assert.equal(violations[0].found_value, expected);
}

t('A sentence-case Usa WhatsApp is a Spanish verb', () => passes('qualification_signals', 'Usa WhatsApp Business para atender consultas.'));
t('B no usa Meta Ads is a Spanish verb', () => passes('non_fit_signals', 'No usa Meta Ads actualmente.'));
t('C quien usa herramientas digitales is a Spanish verb', () => passes('qualification_signals', 'Dueña que usa herramientas digitales.'));
t('D geographic en USA remains blocked', () => fails('problem_context', 'Campaña dirigida a dueñas de estéticas en USA.'));
t('E mercado objetivo USA remains blocked', () => fails('audience_approach', 'Mercado objetivo: USA.', 'usa', 'ads'));
t('F bare USA in target_geo remains blocked', () => fails('target_geo', 'USA'));
t('G unambiguous España remains blocked', () => fails('problem_context', 'Campaña dirigida a dueñas de estéticas en España.', 'espana'));
t('H canonical México passes', () => passes('problem_context', 'Campaña dirigida a dueñas de estéticas en México.'));
t('I proposal containing verbal usa stays unrelated to geography', () => passes('qualification_signals', 'PROPUESTA: dueña que usa CRM'));
t('J exact live ICP verbal uses pass on both paths', () => {
  const violations = fidelity.validateOutputAgainstFacts(facts, { downstream_payload: {
    qualification_signals: 'Usa WhatsApp Business para atender consultas.',
    non_fit_signals: 'No usa Meta Ads actualmente.',
  } }, { nodeId: 'icp' }).violations.filter(v => v.type === 'GEOGRAPHY_SUBSTITUTION');
  assert.deepStrictEqual(violations, []);
});
t('K true USA drift fails closed with exact path', () => {
  const violations = validate('problem_context', 'El mercado objetivo de la campaña será USA.', 'market_context');
  assert.equal(violations.length, 1);
  assert.equal(violations[0].found_value, 'usa');
  assert.equal(violations[0].path, 'node_outputs.market_context.downstream_payload.problem_context');
});

for (const text of [
  'usa WhatsApp',
  'usa Meta Ads',
  'no usa publicidad',
  'quien usa herramientas digitales',
  'si usa agenda digital',
  'negocio que usa WhatsApp',
  'no usa seguimiento',
]) t('verbal negative fixture: ' + text, () => passes('notes', text));

for (const [fieldKey, text] of [
  ['problem_context', 'campaña dirigida a usa'],
  ['audience_approach', 'mercado usa'],
  ['problem_context', 'geografía: usa'],
  ['problem_context', 'target market usa'],
  ['problem_context', 'país: usa'],
  ['problem_context', 'operaremos en usa'],
  ['problem_context', 'audiencia en usa'],
  ['problem_context', 'clientes objetivo en usa'],
]) t('lowercase geographic context remains blocked: ' + text, () => fails(fieldKey, text));

for (const [country, expected] of [
  ['España', 'espana'], ['Colombia', 'colombia'], ['Argentina', 'argentina'],
  ['Chile', 'chile'], ['Perú', 'peru'], ['Estados Unidos', 'estados unidos'],
  ['United States', 'united states'],
]) t('unambiguous country remains blocked: ' + country, () => fails('problem_context', 'Mercado para ' + country, expected));

(async () => {
  let pass = 0; let fail = 0;
  for (const test of tests) {
    try { await test.fn(); pass += 1; console.log('PASS', test.name); }
    catch (error) { fail += 1; console.log('FAIL', test.name, error.stack); }
  }
  console.log(`AMBIGUOUS_USA_GEOGRAPHY_TEST_RESULT pass=${pass} fail=${fail}`);
  if (fail) process.exitCode = 1;
})();
