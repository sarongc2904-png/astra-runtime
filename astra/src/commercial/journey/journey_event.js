'use strict';
// [ASTRA-11H §D] JourneyEvent. Events require evidence — an event is NEVER inferred because
// it is typical. Detection is a controlled Spanish regex set over verbatim utterance text.
// No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const { classifyTemporal } = require('./temporal');

const EVENT_TYPES = Object.freeze([
  'PAIN_BECAME_URGENT', 'RECOMMENDATION_RECEIVED', 'AD_SEEN', 'SEARCH_PERFORMED', 'WEBSITE_VISIT',
  'INQUIRY_SENT', 'QUOTE_REQUESTED', 'COMPETITOR_EVALUATED', 'OBJECTION_RAISED', 'PAYMENT_ATTEMPTED',
  'PURCHASE_COMPLETED', 'ONBOARDING_STARTED', 'PRODUCT_FIRST_USED', 'RESULT_ACHIEVED',
  'RENEWAL_CONSIDERED', 'CANCELLATION_REQUESTED', 'UNKNOWN',
]);

// Controlled detection rules. Each maps an explicit customer phrasing to an event + the stage
// that event evidences.
const EVENT_RULES = Object.freeze([
  { type: 'PAIN_BECAME_URGENT', stage: 'PROBLEM_EMERGENCE', re: /(empeor[oó]|ya no aguant|se puso peor|cada vez peor|el dolor aument|se volvi[oó] urgente)/i },
  { type: 'RECOMMENDATION_RECEIVED', stage: 'INFORMATION_SEEKING', re: /(me recomend[oó]|un amigo me dijo|me lo recomendaron|por recomendaci[oó]n|un conocido me dijo)/i },
  { type: 'AD_SEEN', stage: 'PROBLEM_RECOGNITION', re: /(vi (un|el) anuncio|me sali[oó] (un|el) an[uú]ncio|vi (la|una) publicidad|me apareci[oó] en (facebook|instagram|redes))/i },
  { type: 'SEARCH_PERFORMED', stage: 'INFORMATION_SEEKING', re: /(busqu[eé] en google|googli?e[eé]|busqu[eé] en internet|estuve buscando)/i },
  { type: 'WEBSITE_VISIT', stage: 'SOLUTION_EXPLORATION', re: /(entr[eé] a (su|la) (p[aá]gina|web|sitio)|visit[eé] la web|en su sitio)/i },
  { type: 'INQUIRY_SENT', stage: 'VENDOR_EVALUATION', re: /(pregunt[eé] por whatsapp|les escrib[ií]|mand[eé] mensaje|contact[eé] por|les pregunt[eé])/i },
  { type: 'QUOTE_REQUESTED', stage: 'VENDOR_EVALUATION', re: /(ped[ií] (cotizaci[oó]n|presupuesto)|solicit[eé] (cotizaci[oó]n|precio)|pregunt[eé] (el )?precio|me pasaron (el|la) (precio|cotizaci[oó]n))/i },
  { type: 'COMPETITOR_EVALUATED', stage: 'ALTERNATIVE_COMPARISON', re: /(vi otra cl[ií]nica|compar[eé] con|fui a otro (lugar|lado)|cotic[eé] en otro|en otra parte)/i },
  { type: 'OBJECTION_RAISED', stage: 'PURCHASE_INTENT', re: /(les dije que (estaba|era) caro|me quej[eé]|puse la objeci[oó]n|no me convenc[ií][oa])/i },
  { type: 'PAYMENT_ATTEMPTED', stage: 'PURCHASE', re: /(intent[eé] pagar|no me pas[oó] el pago|fall[oó] el pago|el pago no)/i },
  { type: 'PURCHASE_COMPLETED', stage: 'PURCHASE', re: /(ya (soy|somos) cliente|contrat[eé]|compr[eé]|me atendieron|me hice el tratamiento|ya me lo hice|termin[eé] el tratamiento|hice la compra)/i },
  { type: 'ONBOARDING_STARTED', stage: 'ONBOARDING', re: /(empezamos el onboarding|me dieron de alta|configur|primera sesi[oó]n|arrancamos)/i },
  { type: 'PRODUCT_FIRST_USED', stage: 'ACTIVATION', re: /(lo us[eé] por primera vez|la primera vez que|empec[eé] a usar)/i },
  { type: 'RESULT_ACHIEVED', stage: 'VALUE_REALIZATION', re: /(vi resultados|el resultado fue|funcion[oó]|qued[eé] (feliz|content|satisfech)|super[oó] mis expectativas|logr[eé] lo que quer[ií]a)/i },
  { type: 'RENEWAL_CONSIDERED', stage: 'RETENTION', re: /(voy a renovar|estoy pensando renovar|renovaci[oó]n|seguir[eé] otro (mes|a[ñn]o))/i },
  { type: 'CANCELLATION_REQUESTED', stage: 'CHURN', re: /(cancel[eé]|me di de baja|ped[ií] la baja|dej[eé] de ir|ya no volv[ií]|me cambi[eé] a otro)/i },
]);

// extractEvents(utterance, referenceTime) -> [{ event, journeyObservationSpec }]
function extractEvents(utterance, referenceTime) {
  const text = utterance.verbatim_text;
  const t = classifyTemporal(utterance.timestamp, referenceTime);
  const out = [];
  for (const rule of EVENT_RULES) {
    const m = rule.re.exec(text);
    if (!m) continue;
    const start = m.index >= 0 ? m.index : text.indexOf(m[0]);
    const span = { text: m[0], start, end: start + m[0].length };
    const event = deepFreeze({
      schema_version: 'ucdm-journey-1.0.0', kind: 'JourneyEvent',
      event_type: rule.type, evidenced_stage: rule.stage,
      verbatim_span: m[0], span,
      utterance_ref: utterance.content_hash, source_ref: utterance.source_ref,
      speaker_role: utterance.speaker_role, speaker_pseudonym: utterance.speaker_pseudonym,
      evidence_refs: [...((utterance.provenance && utterance.provenance.evidence_refs) || [])].sort(),
      timestamp: utterance.timestamp || null, temporal_status: t.status,
      grounded_in_evidence: true,
      generated_by: 'deterministic:ucdm/journey',
    });
    const withId = deepFreeze({ ...event, event_id: 'jev_' + sha256Hex(canonicalize({ ...event, event_id: undefined })) });
    out.push({
      event: withId,
      observationSpec: {
        element: 'EVENT', stage: rule.stage, stage_basis: 'OBSERVED', detail: rule.type,
        span, channel: utterance.source_type || 'UNKNOWN', timestamp: utterance.timestamp,
        temporal_status: t.status, temporal_age_days: t.age_days,
        speaker_role: utterance.speaker_role, speaker_pseudonym: utterance.speaker_pseudonym,
        subject_ref: utterance.speaker_pseudonym || null,
        source_ref: utterance.source_ref, evidence_refs: withId.evidence_refs, source_class: 'OBSERVED',
        utterance_ref: utterance.content_hash,
        status: ['CUSTOMER', 'PROSPECT', 'FORMER_CUSTOMER'].includes(utterance.speaker_role) ? 'OBSERVED' : 'ANALYTICAL',
      },
    });
  }
  return out;
}

function validateEvent(e) {
  const errors = [];
  if (!EVENT_TYPES.includes(e.event_type)) errors.push(`bad event_type "${e.event_type}"`);
  if (!e.grounded_in_evidence || e.evidence_refs.length === 0) errors.push('a JourneyEvent must be grounded in evidence (never inferred because it is typical)');
  return { valid: errors.length === 0, errors };
}

module.exports = { EVENT_TYPES, EVENT_RULES, extractEvents, validateEvent };
