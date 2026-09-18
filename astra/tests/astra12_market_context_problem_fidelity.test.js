'use strict';
const assert = require('assert');
const briefFacts = require('../src/workflows/campaign_brief_facts');
const fidelity = require('../src/workflows/brief_fidelity_validator');
const fidelityGuard = require('../src/workflows/fidelity_false_positive_guard');
const marketNormalizer = require('../src/workflows/market_context_fidelity_normalizer');

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

RESTRICCIONES
- No garantizar ventas, ingresos, citas, ROAS ni crecimiento.
- No inventar métricas históricas del negocio.
`;

const facts = briefFacts.extract(brief);
assert.equal(facts.problem_context.status, 'USER_PROVIDED_FACT');
assert.equal(
  facts.problem_context.value,
  'reciben consultas por WhatsApp y pueden perder oportunidades por respuestas tardías, falta de seguimiento, mala clasificación de prospectos o desorganización de agenda'
);

const raw = { downstream_payload: {
  problem_context: 'Conseguir clientes nuevos para CRM mediante demos centradas en prospectos con intención',
  market_assumptions: ['Competencia local'],
  constraints: ['Sin garantías']
} };

const normalized = marketNormalizer.normalizeMarketContextOutput(raw, facts);
assert.equal(normalized.output.downstream_payload.problem_context, facts.problem_context.value);
assert(normalized.repairs.some(r => r.field_key === 'problem_context'));

let checked = fidelity.validateOutputAgainstFacts(facts, normalized.output, { nodeId:'market_context', upstream_outputs:[] });
checked.violations = fidelityGuard.adjudicateNodeViolations('market_context', checked.violations, facts).violations;
assert.deepStrictEqual(checked.violations, [], 'canonical problem context must pass fidelity');

console.log('ASTRA12_MARKET_CONTEXT_PROBLEM_FIDELITY_REGRESSION PASS');
