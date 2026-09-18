'use strict';
const assert = require('assert');
const briefFacts = require('../src/workflows/campaign_brief_facts');
const fidelity = require('../src/workflows/brief_fidelity_validator');

const brief = `OBJETIVO PRINCIPAL
Conseguir clientes nuevos para el CRM mediante demos y ventas, priorizando prospectos con intención real de contratar el servicio.

AUDIENCIA
Dueñas, dueños y administradores de estéticas y salones de belleza.

RESTRICCIONES
- No garantizar ventas, ingresos, citas, ROAS ni crecimiento.
`;

const facts = briefFacts.extract(brief);

const synthesis = { deliverable: {
  '1_business_objective': facts.business_objective.value,
  '2_target_audience_icp': {
    pains: ['Agenda desordenada y citas duplicadas']
  },
  '8_ad_strategy': {
    campaign_objective: facts.business_objective.value
  }
} };

const check = fidelity.validateFinalSynthesis(facts, synthesis, { rawRequest: brief });
assert(
  !check.violations.some(v => v.category === 'invented_result' && /conseguir clientes nuevos/i.test(String(v.local_clause || v.matched_text || ''))),
  'numbered final business objective must not be flagged when it exactly matches canonical objective'
);
assert(
  !check.violations.some(v => v.category === 'invented_result' && /duplicad/i.test(String(v.matched_text || v.local_clause || ''))),
  'descriptive duplicated-appointments pain must not be treated as invented commercial result'
);

const unsafePain = { deliverable: {
  '2_target_audience_icp': {
    pains: ['PROPUESTA: duplicar 20 citas en 30 días']
  }
} };
const unsafeCheck = fidelity.validateFinalSynthesis(facts, unsafePain, { rawRequest: brief });
assert(
  unsafeCheck.violations.some(v => v.category === 'invented_result' || v.category === 'guarantee'),
  'actionable or quantified duplicate-result claims must remain blocked'
);

console.log('ASTRA12_FINAL_OBJECTIVE_PAINS_FIDELITY_REGRESSION PASS');
