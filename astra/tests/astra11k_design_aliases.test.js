'use strict';
// Regression: common A/B design labels must normalize to ASTRA's canonical controlled design
// without weakening allocation, contamination, measurement, or population safeguards.
const assert = require('assert');
const D = require('../src/commercial/experiment_intelligence/design');

const aliases = ['A/B_TEST', 'AB_TEST', 'A_B_TEST', 'SPLIT_TEST', 'CONTROL_TREATMENT', 'CONTROL_V_TREATMENT'];

for (const alias of aliases) {
  const d = D.buildDesign({
    design_type: alias,
    allocation: 'RANDOM',
    unit_of_assignment: 'eligible_prospect',
    treatment: 'Agenda IA Express — MXN 197 / 7 days, credited to first month',
    control: 'Free 3-day demo',
    contamination_status: 'ISOLATED',
    measurement_valid: true,
    treatment_population_comparable: true,
  });
  assert.strictEqual(d.design_type, 'CONTROL_VS_TREATMENT', alias);
  assert.strictEqual(d.input_design_type, alias, alias);
  assert.strictEqual(d.design_type_was_aliased, true, alias);
  assert.strictEqual(d.is_controlled, true, alias);
  assert.strictEqual(d.conclusion_permitted.causal_evaluation, true, alias);
  assert.deepStrictEqual(d.causal_blockers, [], alias);
  assert.strictEqual(D.validateDesign(d).valid, true, alias);
}

// Alias normalization must not bypass causal safeguards.
{
  const d = D.buildDesign({
    design_type: 'A/B_TEST',
    allocation: 'SELF_SELECTED',
    contamination_status: 'ISOLATED',
    measurement_valid: true,
  });
  assert.strictEqual(d.design_type, 'CONTROL_VS_TREATMENT');
  assert(d.causal_blockers.includes('ALLOCATION_NOT_RANDOM_OR_DETERMINISTIC'));
  assert.strictEqual(d.conclusion_permitted.causal_evaluation, false);
}

// Unknown labels remain invalid rather than silently coercing.
{
  const d = D.buildDesign({ design_type: 'MAGIC_TEST' });
  assert.strictEqual(d.design_type, 'UNKNOWN');
  const v = D.validateDesign(d);
  assert.strictEqual(v.valid, false);
  assert(v.errors.some(e => /bad design_type/.test(e)));
}

console.log('ASTRA11K_DESIGN_ALIASES_TEST_RESULT pass=8 fail=0');
