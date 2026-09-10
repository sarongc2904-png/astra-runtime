'use strict';
// [ASTRA-11E §F §M] CompetitorMessageProfile. Exact text stays traceable to ASTRA-11C
// verbatim (verbatim_text + verbatim_hash). Analytical categorization (message_angle,
// message_pattern) is a CONTROLLED taxonomy — never an uncontrolled LLM taxonomy.
// No LLM, no web, no I/O.
const { canonicalize, sha256Hex, deepFreeze, nfcLF } = require('../validation/canonical');

const MESSAGE_FIELDS = Object.freeze(['headline', 'hook', 'promise', 'pain', 'desired_outcome', 'mechanism', 'proof', 'cta', 'objection', 'identity', 'urgency', 'tone', 'message_angle']);

// CONTROLLED message-pattern taxonomy (spec §M). Deterministic keyword mapping only.
// UNKNOWN when nothing matches.
const MESSAGE_PATTERNS = Object.freeze({
  BEST_PRICE: /\b(mejor precio|más barato|mas barato|precio accesible|económic|economic|sin sorpresas|precio claro)\b/i,
  PREMIUM: /\b(premium|de lujo|exclusiv|alta gama|autor)\b/i,
  FAST: /\b(rápid|rapid|en una cita|el mismo día|mismo dia|hoy|24 ?h|inmediat|exprés|expres)\b/i,
  PAIN_FREE: /\b(sin dolor|indolor|sin molestias|sin miedo)\b/i,
  RESULTS: /\b(resultado|resultados|rentab|roi|de por vida|durader)\b/i,
  TECHNOLOGY: /\b(tecnolog|led|sistema|última generación|ultima generacion|digitaliza)\b/i,
  PERSONALIZED: /\b(personaliz|a tu medida|estrategia personalizada|para ti)\b/i,
  GUARANTEED: /\b(garant|garantizado|garantía|garantia)\b/i,
});

function classifyPattern(text) {
  const t = nfcLF(text || '');
  const hits = [];
  for (const [label, re] of Object.entries(MESSAGE_PATTERNS)) if (re.test(t)) hits.push(label);
  return hits.length ? hits : ['UNKNOWN'];
}

// buildMessageProfile({ profile, messageObs })
function buildMessageProfile({ profile, messageObs = [] }) {
  const ref = profile.competitor_ref;
  const mine = messageObs.filter(m => m.subject_ref === ref);
  const items = mine.map(m => {
    const patterns = classifyPattern(m.verbatim_text);
    const item = {
      schema_version: 'ucdm-competitor-1.0.0',
      message_field: m.message_field,
      // RAW text (traceable to ASTRA-11C) — kept strictly separate from analysis
      raw: { verbatim_text: m.verbatim_text, verbatim_hash: m.verbatim_hash, evidence_refs: m.evidence_refs, source_ref: m.source_ref, source_class: 'OBSERVED' },
      // ANALYTICAL categorization from the CONTROLLED taxonomy
      analysis: { message_patterns: patterns, taxonomy: 'ucdm-competitor-message-v1', analytical: true, produced_by: 'deterministic:ucdm/competitor' },
    };
    item.message_item_id = 'cmmsg_' + sha256Hex(canonicalize({ ...item, message_item_id: undefined }));
    return deepFreeze(item);
  });

  const body = {
    schema_version: 'ucdm-competitor-1.0.0',
    competitor_ref: ref,
    message_count: items.length,
    items,
    fields_present: [...new Set(items.map(i => i.message_field))].sort(),
    patterns_present: [...new Set(items.flatMap(i => i.analysis.message_patterns))].sort(),
  };
  body.message_profile_id = 'cmmsgp_' + sha256Hex(canonicalize({ ...body, message_profile_id: undefined }));
  return deepFreeze(body);
}

function validateMessageItem(it) {
  const errors = [];
  // Traceability to ASTRA-11C: a verbatim_hash (for QUOTE/CLAIM text) OR raw text plus an
  // evidence ref (for an attribute-captured field like a CTA).
  const traceable = !!(it.raw && (it.raw.verbatim_hash || (it.raw.verbatim_text && (it.raw.evidence_refs || []).length > 0)));
  if (!traceable) errors.push('raw message text must be traceable to ASTRA-11C (verbatim_hash or text + evidence_ref)');
  if (!it.analysis || it.analysis.analytical !== true) errors.push('analytical categorization must be marked analytical');
  if (it.analysis && it.analysis.taxonomy !== 'ucdm-competitor-message-v1') errors.push('message taxonomy must be the controlled one (no uncontrolled LLM taxonomy)');
  return { valid: errors.length === 0, errors };
}

module.exports = { MESSAGE_FIELDS, MESSAGE_PATTERNS, classifyPattern, buildMessageProfile, validateMessageItem };
