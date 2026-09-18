'use strict';
const assert = require('assert');
const briefFacts = require('../src/workflows/campaign_brief_facts');
const fidelity = require('../src/workflows/brief_fidelity_validator');
const fidelityGuard = require('../src/workflows/fidelity_false_positive_guard');
const adsNormalizer = require('../src/workflows/ads_fidelity_normalizer');

const brief = `Crea una Campaign360 para un CRM con IA dirigido a estéticas y salones de belleza en México.

NEGOCIO / PRODUCTO
CRM con IA para estéticas y salones de belleza. El sistema centraliza prospectos provenientes de WhatsApp y agenda citas en Google Calendar.

OBJETIVO PRINCIPAL
Conseguir clientes nuevos para el CRM mediante demos y ventas, priorizando prospectos con intención real de contratar el servicio.

AUDIENCIA
Dueñas, dueños y administradores de estéticas y salones de belleza.

MERCADO / GEOGRAFÍA
México.

RESTRICCIONES
- No garantizar ventas, ingresos, citas, ROAS ni crecimiento.
- Toda táctica nueva debe marcarse como PROPUESTA.
`;

const facts = briefFacts.extract(brief);
const raw = { downstream_payload: {
  campaign_objective: 'Conseguir nuevos leads que soliciten demo vía WhatsApp',
  creative_testing: 'probar 3 hooks'
} };

const normalized = adsNormalizer.normalizeAdsOutput(raw, facts);
assert.equal(normalized.output.downstream_payload.campaign_objective, facts.business_objective.value);
assert(/^PROPUESTA:/i.test(normalized.output.downstream_payload.creative_testing));
assert(normalized.repairs.some(r => r.field_key === 'campaign_objective'));
assert(normalized.repairs.some(r => r.field_key === 'creative_testing'));

let checked = fidelity.validateOutputAgainstFacts(facts, normalized.output, { nodeId: 'ads', upstream_outputs: [] });
checked.violations = fidelityGuard.adjudicateNodeViolations('ads', checked.violations, facts).violations;
assert.deepStrictEqual(checked.violations, [], 'normalized live Ads failure should pass fidelity');

const dangerous = { downstream_payload: {
  campaign_objective: 'anything',
  creative_testing: 'Garantizamos 20 ventas en 30 días'
} };
const normalizedDangerous = adsNormalizer.normalizeAdsOutput(dangerous, facts);
assert.equal(
  normalizedDangerous.output.downstream_payload.creative_testing,
  'Garantizamos 20 ventas en 30 días',
  'hard result claim must remain untouched so the strict validator can adjudicate it; normalizer must never add PROPUESTA'
);
assert(!/^PROPUESTA:/i.test(normalizedDangerous.output.downstream_payload.creative_testing));

console.log('ASTRA12_ADS_FIDELITY_NORMALIZER_REGRESSION PASS');
