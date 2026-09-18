'use strict';
const assert = require('assert');
const briefFacts = require('../src/workflows/campaign_brief_facts');
const fidelity = require('../src/workflows/brief_fidelity_validator');

const brief = `OBJETIVO PRINCIPAL
Conseguir clientes nuevos para el CRM mediante demos y ventas, priorizando prospectos con intención real de contratar el servicio.

OFERTA ACTUAL
Precio: $1,397 MXN al mes.
Demo actual: 3 días.
CTA actual: “Quiero probar la demo de 3 días”.

RESTRICCIONES
- No atribuir resultados o testimonios de terceros como propios.
- No garantizar ventas, ingresos, citas, ROAS ni crecimiento.
- Cualquier estrategia nueva debe marcarse como PROPUESTA.
`;

const facts = briefFacts.extract(brief);

const upstream = [{
  work_unit_id: 'offer',
  downstream_payload: {
    risk_reduction: 'PROPUESTA: probar una demo de 14 días sin tarjeta como experimento.',
    value_stack: [
      'PROPUESTA: piloto pagado.',
      'PROPUESTA: landing/formulario para captación.',
      'PROPUESTA: onboarding guiado.'
    ]
  }
}];

const funnel = {
  downstream_payload: {
    stages: [
      'Captación con landing/formulario.',
      'Demo de 14 días sin tarjeta.',
      'Piloto pagado.',
      'Onboarding guiado.'
    ],
    transitions: 'Landing/formulario → demo de 14 días → piloto pagado → onboarding.',
    conversion_intent: 'Solicitar la demo vigente por WhatsApp.',
    qualification_points: [],
    drop_off_risks: [],
    dependencies: []
  }
};

const first = fidelity.validateOutputAgainstFacts(facts, funnel, {
  nodeId: 'funnel',
  upstream_outputs: upstream
});
assert(
  first.violations.some(v => v.type === 'UNLABELED_UPSTREAM_PROPOSAL_PROPAGATION'),
  'fixture must reproduce proposal-status loss from Offer into Funnel'
);

const repaired = fidelity.repairUpstreamProposalStatus(facts, funnel, upstream);
assert(repaired.repairs.length > 0, 'deterministic repair must record at least one proposal-status repair');

const second = fidelity.validateOutputAgainstFacts(facts, repaired.output, {
  nodeId: 'funnel',
  upstream_outputs: upstream
});
const proposalViolations = second.violations.filter(v =>
  v.type === 'UNLABELED_UPSTREAM_PROPOSAL_PROPAGATION' ||
  v.type === 'UNLABELED_PROPOSAL'
);
assert.deepStrictEqual(
  proposalViolations,
  [],
  'Offer proposals propagated into Funnel must remain explicitly PROPUESTA after deterministic repair'
);

console.log('ASTRA12_OFFER_FUNNEL_PROPOSAL_PROPAGATION_REGRESSION PASS');
