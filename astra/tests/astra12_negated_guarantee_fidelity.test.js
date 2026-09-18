'use strict';
const assert = require('assert');
const factsMod = require('../src/workflows/campaign_brief_facts');
const fidelity = require('../src/workflows/brief_fidelity_validator');

const brief = `OBJETIVO PRINCIPAL
Conseguir clientes nuevos para el CRM mediante demos y ventas.

OFERTA ACTUAL
Precio: $1,397 MXN al mes.
Demo actual: 3 días.

RESTRICCIONES
- No inventes resultados comerciales.
- No debes garantizar ventas, ingresos, citas, crecimiento, ROAS ni otros resultados.
- Cualquier estrategia nueva debe marcarse como PROPUESTA.
`;

const facts = factsMod.extract(brief);

const safeVariants = [
  'No garantizar ventas, ingresos, citas, crecimiento, ROAS ni otros resultados.',
  'No debes garantizar ventas, ingresos, citas, crecimiento, ROAS ni otros resultados.',
  'No se debe garantizar ventas, ingresos, citas, crecimiento, ROAS ni otros resultados.',
  'Nunca garantizar resultados.',
  'Do not guarantee sales, revenue, appointments, growth, ROAS or other results.',
];

for (const text of safeVariants) {
  const output = { downstream_payload: { constraints: text } };
  const check = fidelity.validateOutputAgainstFacts(facts, output, { nodeId: 'offer', upstream_outputs: [] });
  assert(
    !check.violations.some(v => v.type === 'EXPLICIT_PROHIBITION' && (v.category === 'guarantee' || v.category === 'invented_result')),
    'negated/advisory guarantee instruction must not be treated as a positive guarantee: ' + text
  );
}

const unsafe = { downstream_payload: { value_proposition: 'Garantizamos más ventas y citas.' } };
const unsafeCheck = fidelity.validateOutputAgainstFacts(facts, unsafe, { nodeId: 'offer', upstream_outputs: [] });
assert(
  unsafeCheck.violations.some(v => v.type === 'EXPLICIT_PROHIBITION' && (v.category === 'guarantee' || v.category === 'invented_result')),
  'positive guarantee claim must remain blocked'
);

console.log('ASTRA12_NEGATED_GUARANTEE_FIDELITY_REGRESSION PASS');
