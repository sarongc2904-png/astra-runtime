'use strict';
const assert = require('assert');
const briefFacts = require('../src/workflows/campaign_brief_facts');
const metaGuard = require('../src/workflows/synthesis_meta_guard');

const brief = `Crea una Campaign360 para un CRM con IA dirigido a estéticas en México.

**NEGOCIO / PRODUCTO**
CRM con IA para estéticas y salones de belleza. El sistema centraliza prospectos de WhatsApp y agenda en Google Calendar.

## OBJETIVO PRINCIPAL
Conseguir clientes nuevos para el CRM mediante demos y ventas, priorizando prospectos con intención real de contratar el servicio.

**AUDIENCIA**
Dueñas, dueños y administradores de:
- estéticas;
- salones de belleza;
- spas.

## MERCADO / GEOGRAFÍA
México.

**RESTRICCIONES**
- No garantizar ventas, ingresos, citas, ROAS ni crecimiento.
- No inventar métricas históricas del negocio.

**REGLA DE PROCEDENCIA**
Clasifica como HECHO_DEL_BRIEF, EVIDENCIA_EXTERNA, INFERENCIA, PROPUESTA o UNKNOWN.

**ENTREGABLE FINAL**
Devuelve UNA sola Campaign360 consolidada y accionable para México.
`;

const facts = briefFacts.extract(brief);
assert.equal(facts.product_name.value, 'CRM con IA');
assert.equal(facts.product_type.value, 'CRM con IA');
assert.equal(facts.geography.value, 'México');
assert(/Dueñas, dueños y administradores de/i.test(facts.buyer.value));
assert(!/procedencia/i.test(facts.buyer.value));
assert(/Google Calendar/i.test(facts.mechanism.value));
assert(!/REGLA DE PROCEDENCIA/i.test(facts.constraints.value));
assert(!/ENTREGABLE FINAL/i.test(facts.constraints.value));

const synthesis = { deliverable: {
  '14_assumptions': ['Presupuesto definido y disponible', 'Segmento no definido'],
  '18_recommended_next_actions': ['Ofrecer demo gratis de 7 días', 'Medir demo iniciada'],
  '5_offer': { offer_structure: 'Demo actual de 3 días' }
} };
const violations = [
  { field_key:'14_assumptions', leaf_path:'14_assumptions[0]', matched_text:'Presupuesto definido' },
  { field_key:'18_recommended_next_actions', leaf_path:'18_recommended_next_actions[0]', matched_text:'demo gratis de 7 días' },
  { field_key:'5_offer', leaf_path:'5_offer.offer_structure', matched_text:'Demo actual de 3 días' }
];
const repaired = metaGuard.pruneMetaViolations(synthesis, violations);
assert.deepStrictEqual(repaired.synthesis.deliverable['14_assumptions'], ['Segmento no definido']);
assert.deepStrictEqual(repaired.synthesis.deliverable['18_recommended_next_actions'], ['Medir demo iniciada']);
assert.deepStrictEqual(repaired.synthesis.deliverable['5_offer'], { offer_structure: 'Demo actual de 3 días' });
assert.equal(repaired.repairs.length, 2);

console.log('ASTRA12_FINAL_SYNTHESIS_META_GUARD_REGRESSION PASS');
