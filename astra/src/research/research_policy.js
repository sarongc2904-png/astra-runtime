'use strict';

// ASTRA-12 — converts anti-fabrication wording into a provenance policy for the
// research-enabled Campaign360 path. It does NOT mutate the user's canonical brief.
// The hardened workflow receives a normalized operational request, while ASTRA-12
// keeps the original request/facts for research diagnostics and output provenance.

const FABRICATION_NOUNS = [
  'testimonios?', 'testimonials?', 'reseñas?', 'reviews?',
  'descuentos?', 'discounts?', 'm[eé]tricas?', 'metrics?',
  'resultados?', 'results?', 'evidencia', 'evidence',
  'cac', 'cpl', 'cpa', 'roas', 'conversiones?', 'conversions?',
  'presupuesto(?:\s+publicitario)?', 'ad\s+budget',
].join('|');

const NO_INVENTAR = new RegExp(
  `\\bno\\s+(?:invent\\w*|fabric\\w*|falsific\\w*|falsear\\w*)\\b[^.!?;\\n]*?(?:${FABRICATION_NOUNS})[^.!?;\\n]*`,
  'gi'
);
const NO_USAR_INVENTADO = new RegExp(
  `\\bno\\s+(?:usar|incluir|utilizar|presentar|afirmar)\\b[^.!?;\\n]*?(?:${FABRICATION_NOUNS})[^.!?;\\n]*?\\b(?:inventad[oa]s?|fabricad[oa]s?|fals[oa]s?|fictici[oa]s?|fake|made[- ]?up)\\b[^.!?;\\n]*`,
  'gi'
);
const SIN_DISPONIBLE = new RegExp(
  `\\bsin\\s+(?:${FABRICATION_NOUNS})\\s+(?:disponibles?|available)\\b`,
  'gi'
);

const RESEARCH_PROVENANCE_POLICY = [
  'POLÍTICA DE PROCEDENCIA ASTRA-12:',
  'Testimonios, reseñas, precios, descuentos, métricas, resultados y evidencia de mercado pueden utilizarse cuando provengan de investigación externa verificable y trazable.',
  'Un dato investigado describe exclusivamente a la fuente, competidor o mercado observado; nunca se atribuye al negocio del usuario como resultado propio.',
  'Un dato sin respaldo permanece UNKNOWN.',
  'Toda estrategia, oferta, bono, apilamiento de valor, descuento propio o recomendación nueva debe identificarse como PROPUESTA.',
].join(' ');

function normalizeResearchRequest(rawRequest) {
  let text = String(rawRequest || '');
  text = text.replace(NO_USAR_INVENTADO, ' ');
  text = text.replace(NO_INVENTAR, ' ');
  text = text.replace(SIN_DISPONIBLE, ' ');
  // Clean list remnants without changing business facts such as price, geography or mechanism.
  text = text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return `${text}\n\n${RESEARCH_PROVENANCE_POLICY}`.trim();
}

function provenancePolicySummary() {
  return {
    researched_facts: 'EXTERNAL_RESEARCH',
    user_facts: 'USER_PROVIDED_FACT',
    inference: 'INFERENCE',
    new_strategy: 'PROPUESTA',
    unsupported: 'UNKNOWN',
  };
}

module.exports = {
  normalizeResearchRequest,
  provenancePolicySummary,
  RESEARCH_PROVENANCE_POLICY,
};
