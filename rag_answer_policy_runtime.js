'use strict';

const CANONICAL_ABSTENTIONS = Object.freeze({
  en: 'There is not enough evidence in the retrieved sources to answer that confidently.',
  es: 'No hay evidencia suficiente en las fuentes recuperadas para responder eso con confianza.',
});

function canonicalAbstention(language) {
  const normalized = String(language || '').trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(CANONICAL_ABSTENTIONS, normalized)) {
    throw new Error(`Unsupported canonical-abstention language: ${language}`);
  }
  return CANONICAL_ABSTENTIONS[normalized];
}

function removeGlobalAbstentions(answer) {
  let cleaned = String(answer || '');
  let removed = false;
  for (const abstention of Object.values(CANONICAL_ABSTENTIONS)) {
    if (cleaned.includes(abstention)) {
      cleaned = cleaned.split(abstention).join('');
      removed = true;
    }
  }
  cleaned = cleaned.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean).join('\n\n');
  return { cleaned, removed };
}

function enforceSufficiencyOutput(decision, answer, options = {}) {
  const normalized = String(decision || '').trim().toUpperCase();
  const language = options.language;
  if (['FULL', 'SUFFICIENT', 'AMBIGUOUS'].includes(normalized)) {
    return { requestedDecision: normalized, effectiveDecision: normalized, answer: String(answer || ''), generationBypassed: false, globalAbstentionRemoved: false, specificLimitationAdded: false };
  }
  if (normalized === 'INSUFFICIENT') {
    return { requestedDecision: normalized, effectiveDecision: normalized, answer: canonicalAbstention(language), generationBypassed: true, globalAbstentionRemoved: false, specificLimitationAdded: false };
  }
  if (normalized !== 'PARTIAL') throw new Error(`Unknown sufficiency decision: ${decision}`);
  if (!options.hasSupportedMaterial) {
    return { requestedDecision: normalized, effectiveDecision: 'INSUFFICIENT', answer: canonicalAbstention(language), generationBypassed: true, globalAbstentionRemoved: false, specificLimitationAdded: false };
  }
  const { cleaned, removed } = removeGlobalAbstentions(answer);
  if (!cleaned) {
    return { requestedDecision: normalized, effectiveDecision: 'INSUFFICIENT', answer: canonicalAbstention(language), generationBypassed: true, globalAbstentionRemoved: removed, specificLimitationAdded: false };
  }
  const limitation = String(options.specificLimitation || '').trim();
  if (limitation && Object.values(CANONICAL_ABSTENTIONS).some(a => limitation.includes(a))) {
    throw new Error('A PARTIAL limitation cannot be a global INSUFFICIENT abstention');
  }
  let guarded = cleaned;
  if (limitation && !guarded.includes(limitation)) guarded += `\n\n${limitation}`;
  if (Object.values(CANONICAL_ABSTENTIONS).some(a => guarded.includes(a))) {
    throw new Error('PARTIAL output still contains a global INSUFFICIENT abstention');
  }
  return { requestedDecision: normalized, effectiveDecision: normalized, answer: guarded, generationBypassed: false, globalAbstentionRemoved: removed, specificLimitationAdded: !!limitation };
}

function detectLanguage(text) {
  const value = String(text || '').toLowerCase();
  return /[áéíóúñ¿¡]|\b(que|como|para|cual|donde|fuentes|evidencia)\b/.test(value) ? 'es' : 'en';
}

module.exports = { CANONICAL_ABSTENTIONS, canonicalAbstention, enforceSufficiencyOutput, detectLanguage };
