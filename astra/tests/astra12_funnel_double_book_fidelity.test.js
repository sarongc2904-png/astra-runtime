'use strict';
const assert = require('assert');
const factsMod = require('../src/workflows/campaign_brief_facts');
const fidelity = require('../src/workflows/brief_fidelity_validator');

const brief = `OBJETIVO PRINCIPAL
Conseguir clientes nuevos para el CRM mediante demos y ventas.

OFERTA ACTUAL
Precio: $1,397 MXN al mes.
Demo actual: 3 días.
Canal principal: WhatsApp.
El bot clasifica prospectos y agenda citas en Google Calendar.

RESTRICCIONES
- No inventar resultados comerciales ni garantizar ventas, ingresos, citas, ROAS ni crecimiento.
- Cualquier estrategia nueva debe marcarse como PROPUESTA.
`;

const facts = factsMod.extract(brief);
const upstream = [{
  work_unit_id: 'offer',
  output: { downstream_payload: {
    offer_structure: 'PROPUESTA: el bot recoge datos, clasifica el lead y crea un evento en Google Calendar.'
  }}
}];

const funnel = { downstream_payload: {
  stages: 'El bot recoge datos, clasifica el lead y crea un evento en Google Calendar.',
  drop_off_risks: ['Calendar double-book or timezone mismatch']
}};

const first = fidelity.validateOutputAgainstFacts(facts, funnel, { nodeId: 'funnel', upstream_outputs: upstream });
assert(
  !first.violations.some(v => v.type === 'EXPLICIT_PROHIBITION' && v.category === 'invented_result'),
  'technical double-book/timezone risk must not be treated as an invented commercial result'
);
assert(
  first.violations.some(v => v.type === 'UNLABELED_UPSTREAM_PROPOSAL_PROPAGATION'),
  'unlabeled propagated proposal must still be detected before deterministic repair'
);

const repaired = fidelity.repairUpstreamProposalStatus(facts, funnel, upstream);
assert(repaired.repairs.length > 0, 'propagated proposal should be deterministically relabeled');
const second = fidelity.validateOutputAgainstFacts(facts, repaired.output, { nodeId: 'funnel', upstream_outputs: upstream });
assert(
  !second.violations.some(v => v.type === 'UNLABELED_UPSTREAM_PROPOSAL_PROPAGATION'),
  'proposal relabel repair must clear propagation violation'
);
assert(
  !second.violations.some(v => v.type === 'EXPLICIT_PROHIBITION' && v.category === 'invented_result'),
  'technical double-book risk must remain clean after proposal repair'
);

const unsafe = { downstream_payload: { stages: 'We will double appointments in 30 days.' } };
const unsafeCheck = fidelity.validateOutputAgainstFacts(facts, unsafe, { nodeId: 'funnel', upstream_outputs: [] });
assert(
  unsafeCheck.violations.some(v => v.type === 'EXPLICIT_PROHIBITION' && v.category === 'invented_result'),
  'real doubled-appointments result claim must remain blocked'
);

console.log('ASTRA12_FUNNEL_DOUBLE_BOOK_FIDELITY_REGRESSION PASS');
