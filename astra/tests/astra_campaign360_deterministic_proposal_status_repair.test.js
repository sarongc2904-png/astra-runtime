'use strict';
const assert = require('assert');
const fidelity = require('../src/workflows/brief_fidelity_validator');

const facts = {
  product_type: { status: 'USER_PROVIDED_FACT', value: 'minicurso grabado' },
  price: { status: 'USER_PROVIDED_FACT', value: '400' },
  currency: { status: 'USER_PROVIDED_FACT', value: 'MXN' },
  mechanism: { status: 'USER_PROVIDED_FACT', value: 'consulta → conversación → cita' },
};
const upstream = [{ work_unit_id: 'offer', downstream_payload: {
  offer_structure: 'PROPUESTA: Minicurso grabado 400 MXN venta directa; upsell consultoría cita.',
} }];
const tests = [];
function t(name, fn) { tests.push({ name, fn }); }
function repair(output, source = upstream) {
  return fidelity.repairUpstreamProposalStatus(facts, output, source);
}
function proposalViolations(output, source = upstream) {
  return fidelity.validateOutputAgainstFacts(facts, output, { nodeId: 'funnel', upstream_outputs: source })
    .violations.filter(v => v.type === 'UNLABELED_UPSTREAM_PROPOSAL_PROPAGATION');
}
function assertSecondValidationPass(result, source = upstream) {
  assert.deepStrictEqual(proposalViolations(result.output, source), []);
}

t('A prefixes a single affected string and passes second validation', () => {
  const original = { downstream_payload: { stages: 'Upsell consultoría cita' } };
  const before = JSON.stringify(original);
  const result = repair(original);
  assert.equal(JSON.stringify(original), before, 'input output was mutated');
  assert.equal(result.output.downstream_payload.stages, 'PROPUESTA: Upsell consultoría cita');
  assertSecondValidationPass(result);
  assert.deepStrictEqual(result.repairs.map(r => ({ field_key: r.field_key, matched_anchor: r.matched_anchor, repair_type: r.repair_type, deterministic: r.deterministic })), [
    { field_key: 'stages', matched_anchor: 'upsell', repair_type: 'PREFIX_PROPUESTA', deterministic: true },
  ]);
});
t('B marks only the contaminated sentence', () => {
  const result = repair({ downstream_payload: { stages: 'Confirmar compra. Ofrecer consultoría.' } });
  assert.equal(result.output.downstream_payload.stages, 'Confirmar compra. PROPUESTA: Ofrecer consultoría.');
  assertSecondValidationPass(result);
});
t('C repairs only the affected array leaf', () => {
  const result = repair({ downstream_payload: { stages: ['Paso canónico', 'Agendar consultoría'] } });
  assert.deepStrictEqual(result.output.downstream_payload.stages, ['Paso canónico', 'PROPUESTA: Agendar consultoría']);
  assert.equal(result.repairs[0].leaf_path, '$[1]');
  assertSecondValidationPass(result);
});
t('D repairs only the affected nested-object leaf', () => {
  const result = repair({ downstream_payload: { stages: { canonical: 'Paso canónico', optional: { action: 'Agendar consultoría' } } } });
  assert.deepStrictEqual(result.output.downstream_payload.stages, { canonical: 'Paso canónico', optional: { action: 'PROPUESTA: Agendar consultoría' } });
  assert.equal(result.repairs[0].leaf_path, '$.optional.action');
  assertSecondValidationPass(result);
});
t('E already marked proposal is unchanged', () => {
  const output = { downstream_payload: { stages: 'PROPUESTA: Agendar consultoría' } };
  assert.deepStrictEqual(repair(output), { output, repairs: [] });
});
t('F explicit rejection is unchanged', () => {
  const output = { downstream_payload: { stages: 'No incluir consultoría' } };
  assert.deepStrictEqual(repair(output), { output, repairs: [] });
  assertSecondValidationPass({ output });
});
t('G UNKNOWN and CURRENT_RESEARCH_REQUIRED stay unchanged', () => {
  for (const value of ['consultoría = UNKNOWN', 'CURRENT_RESEARCH_REQUIRED: consultoría', { status: 'UNKNOWN', value: 'consultoría' }, { support_class: 'CURRENT_RESEARCH_REQUIRED', value: 'consultoría' }]) {
    const output = { downstream_payload: { stages: value } };
    assert.deepStrictEqual(repair(output), { output, repairs: [] });
  }
});
t('H canonical mechanism reuse is unchanged', () => {
  const output = { downstream_payload: { stages: 'consulta → conversación → cita' } };
  assert.deepStrictEqual(repair(output), { output, repairs: [] });
});
t('multiple contaminated clauses get separate local prefixes', () => {
  const result = repair({ downstream_payload: { stages: 'Agendar consultoría. Paso canónico; ofrecer consultoría.' } });
  assert.equal(result.output.downstream_payload.stages, 'PROPUESTA: Agendar consultoría. Paso canónico; PROPUESTA: ofrecer consultoría.');
  assert.equal(result.repairs.length, 2);
  assertSecondValidationPass(result);
});

(async () => {
  let pass = 0; let fail = 0;
  for (const test of tests) {
    try { await test.fn(); pass += 1; console.log('PASS', test.name); }
    catch (error) { fail += 1; console.log('FAIL', test.name, error.stack); }
  }
  console.log(`DETERMINISTIC_PROPOSAL_STATUS_REPAIR_TEST_RESULT pass=${pass} fail=${fail}`);
  if (fail) process.exitCode = 1;
})();
