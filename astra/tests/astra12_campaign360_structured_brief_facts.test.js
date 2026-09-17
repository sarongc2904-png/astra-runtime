'use strict';
const assert = require('assert');
const briefFacts = require('../src/workflows/campaign_brief_facts');
const guard = require('../src/workflows/fidelity_false_positive_guard');

const brief = `Crea una Campaign360 para un CRM con IA dirigido a estéticas y salones de belleza en México.

NEGOCIO / PRODUCTO
CRM con IA para estéticas y salones de belleza. El sistema centraliza prospectos provenientes de WhatsApp y utiliza un bot con IA para responder, clasificar leads según intención y nivel de interés, dar seguimiento comercial y agendar citas automáticamente en Google Calendar.

OBJETIVO PRINCIPAL
Conseguir clientes nuevos para el CRM mediante demos y ventas, priorizando prospectos con intención real de contratar el servicio.

AUDIENCIA
Dueñas, dueños y administradores de:
- estéticas;
- salones de belleza;
- centros de uñas;
- depilación;
- tratamientos faciales;
- spas y negocios similares.

Problema principal: reciben consultas por WhatsApp y pueden perder oportunidades por respuestas tardías, falta de seguimiento, mala clasificación de prospectos o desorganización de agenda.

OFERTA ACTUAL
Precio: $1,397 MXN al mes.

CANAL PRINCIPAL
WhatsApp.

MERCADO / GEOGRAFÍA
México.
Inicialmente orientado al sector de estética y belleza.

RESTRICCIONES
- No garantizar ventas, ingresos, citas, ROAS ni crecimiento.
- No inventar métricas históricas del negocio.

REGLA DE PROCEDENCIA
Clasifica las afirmaciones como HECHO_DEL_BRIEF, EVIDENCIA_EXTERNA, INFERENCIA, PROPUESTA o UNKNOWN.
`;

const facts = briefFacts.extract(brief);

assert.equal(facts.product_type.status, 'USER_PROVIDED_FACT');
assert(/CRM con IA/i.test(facts.product_type.value), 'product_type should capture CRM con IA');

assert.equal(facts.business_objective.status, 'USER_PROVIDED_FACT');
assert.equal(
  facts.business_objective.value,
  'Conseguir clientes nuevos para el CRM mediante demos y ventas, priorizando prospectos con intención real de contratar el servicio'
);

assert.equal(facts.geography.status, 'USER_PROVIDED_FACT');
assert.equal(facts.geography.value, 'México');

assert.equal(facts.buyer.status, 'USER_PROVIDED_FACT');
assert(/Dueñas, dueños y administradores de/i.test(facts.buyer.value));
assert(/estéticas/i.test(facts.buyer.value));
assert(/spas/i.test(facts.buyer.value));
assert(!/procedencia/i.test(facts.buyer.value), 'buyer must not come from provenance rules');

assert.equal(facts.mechanism.status, 'USER_PROVIDED_FACT');
assert(/WhatsApp/i.test(facts.mechanism.value));
assert(/Google Calendar/i.test(facts.mechanism.value));

const violation = {
  type: 'EXPLICIT_PROHIBITION',
  category: 'invented_result',
  field_key: 'problem_context',
  matched_text: 'Conseguir',
  local_clause: facts.business_objective.value,
};
const adjudicated = guard.adjudicateNodeViolations('market_context', [violation], facts);
assert.equal(adjudicated.violations.length, 0, 'exact canonical objective restatement must not fail');

const embellished = {
  ...violation,
  local_clause: facts.business_objective.value + ' garantizado',
};
const strict = guard.adjudicateNodeViolations('market_context', [embellished], facts);
assert.equal(strict.violations.length, 1, 'embellished objective claim must remain blocked');

console.log('ASTRA12_CAMPAIGN360_STRUCTURED_BRIEF_FACTS_REGRESSION PASS');
