'use strict';
const assert = require('assert');
const guard = require('../src/workflows/fidelity_false_positive_guard');

function adjudicate(v) {
  return guard.adjudicateNodeViolations('icp', [v]);
}

const descriptive = {
  type: 'EXPLICIT_PROHIBITION',
  category: 'invented_result',
  field_key: 'pains',
  matched_text: 'duplicados',
  local_clause: 'Agendamientos duplicados o perdidos',
  leaf_path: 'pains[2]',
};
assert.equal(adjudicate(descriptive).violations.length, 0);
assert.equal(adjudicate(descriptive).suppressed.length, 1);

const imperative = { ...descriptive, matched_text: 'duplica', local_clause: 'Duplica tus citas' };
assert.equal(adjudicate(imperative).violations.length, 1);

const quantified = { ...descriptive, local_clause: 'Agendamientos duplicados 2x' };
assert.equal(adjudicate(quantified).violations.length, 1);

const possessivePain = { ...descriptive, local_clause: 'Tus agendamientos duplicados' };
assert.equal(adjudicate(possessivePain).violations.length, 0);
assert.equal(adjudicate(possessivePain).suppressed.length, 1);

const directPromise = { ...descriptive, matched_text: 'duplica', local_clause: 'Duplica tus citas' };
assert.equal(adjudicate(directPromise).violations.length, 1);

const wrongField = { ...descriptive, field_key: 'primary_outcome', leaf_path: 'primary_outcome' };
assert.equal(adjudicate(wrongField).violations.length, 1);

const wrongNode = guard.adjudicateNodeViolations('offer', [descriptive]);
assert.equal(wrongNode.violations.length, 1);

console.log('ASTRA12_ICP_PAINS_FIDELITY_GUARD PASS');
