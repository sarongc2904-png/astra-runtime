'use strict';
const assert = require('assert');
const policy = require('../src/workflows/fidelity_hypothesis_policy');

const soft = policy.classify([{
  type: 'EXPLICIT_PROHIBITION',
  category: 'invented_result',
  field_key: 'pains',
  local_clause: 'Agendamientos duplicados o perdidos',
  matched_text: 'duplicados',
}], 'icp');

assert.equal(soft.hard.length, 0);
assert.equal(soft.hypotheses.length, 1);
assert.equal(soft.hypotheses[0].status, 'HYPOTHESIS_TO_VALIDATE');
assert.equal(soft.hypotheses[0].node, 'icp');

const testimonial = policy.classify([{
  type: 'EXPLICIT_PROHIBITION',
  category: 'testimonials',
  field_key: 'proof',
  local_clause: 'Clientes reportan mejor organización',
}], 'creative_strategy');
assert.equal(testimonial.hard.length, 0);
assert.equal(testimonial.hypotheses.length, 1);

const hard = policy.classify([{
  type: 'PRICE_SUBSTITUTION',
  field_key: 'offer_structure',
  canonical_value: '1397',
}], 'offer');
assert.equal(hard.hard.length, 1);
assert.equal(hard.hypotheses.length, 0);

const demo = policy.classify([{
  type: 'DEMO_DURATION_SUBSTITUTION',
  field_key: 'risk_reduction',
  canonical_value: '3 días',
  found_value: '14 días',
}], 'offer');
assert.equal(demo.hard.length, 1);

console.log('ASTRA12_FIDELITY_HYPOTHESIS_MODE PASS');
