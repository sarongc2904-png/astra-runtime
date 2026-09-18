'use strict';
const assert = require('assert');
const briefFacts = require('../src/workflows/campaign_brief_facts');
const fidelity = require('../src/workflows/brief_fidelity_validator');

const brief = `OBJETIVO PRINCIPAL
Conseguir clientes nuevos para el CRM mediante demos y ventas, priorizando prospectos con intención real de contratar el servicio.

RESTRICCIONES
- No garantizar ventas, ingresos, citas, ROAS ni crecimiento.
`;

const facts = briefFacts.extract(brief);
assert.equal(facts.business_objective.status, 'USER_PROVIDED_FACT');

const nodeOutput = { downstream_payload: {
  campaign_objective: facts.business_objective.value
} };
const nodeCheck = fidelity.validateOutputAgainstFacts(facts, nodeOutput, { nodeId: 'ads', upstream_outputs: [] });
assert.deepStrictEqual(nodeCheck.violations, [], 'exact canonical objective in Ads objective field must not be treated as invented_result');

const synthesis = { deliverable: {
  '1_business_objective': facts.business_objective.value,
  '8_ad_strategy': { campaign_objective: facts.business_objective.value }
} };
const finalCheck = fidelity.validateFinalSynthesis(facts, synthesis, { rawRequest: brief });
assert(!finalCheck.violations.some(v => v.category === 'invented_result'), 'canonical objective must survive final synthesis fidelity even when comma splitting shortens local_clause');

const embellished = { downstream_payload: {
  campaign_objective: facts.business_objective.value + ' y garantizamos 20 ventas en 30 días'
} };
const bad = fidelity.validateOutputAgainstFacts(facts, embellished, { nodeId: 'ads', upstream_outputs: [] });
assert(bad.violations.some(v => v.category === 'invented_result' || v.category === 'guarantee'), 'embellished objective must remain blocked');

console.log('ASTRA12_CANONICAL_OBJECTIVE_LEAF_FIDELITY_REGRESSION PASS');
