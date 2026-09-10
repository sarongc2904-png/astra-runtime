'use strict';
// [ASTRA-11F §H] Customer question model. Exact question language is preserved. Controlled
// taxonomy (voc-question-v1). No LLM, no web, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const T = require('./taxonomy');

// A question is marked by explicit punctuation (? / ¿) or a clause opening with an
// ACCENTED Spanish interrogative — bare unaccented "que"/"como" (very common non-question
// words) are deliberately NOT treated as interrogative.
// Only explicit punctuation or an ACCENTED interrogative opener counts. Bare unaccented
// "que" / "como" (ubiquitous non-question words in Spanish) are excluded by design.
const INTERROGATIVE = /[?¿]|(?:^|[\s,;:¿])(cuánto|cuántas|cuántos|cómo|cuándo|dónde|cuál|cuáles|qué|por qué|quién)\s/i;

// extractQuestions(utterance) -> [VocQuestion]
function extractQuestions(utterance) {
  const text = utterance.verbatim_text;
  // segment into clause-ish units on sentence + question punctuation; keep '?' with its clause
  const sentences = text.split(/(?<=[?.!¿])\s+|(?<=\?)/).map(s => s.trim()).filter(Boolean);
  const out = [];
  for (const s of sentences) {
    const isQ = /[?¿]/.test(s) || INTERROGATIVE.test(s);
    if (!isQ) continue;
    let type = 'UNKNOWN';
    for (const rule of T.QUESTION_RULES) if (rule.re.test(s)) { type = rule.type; break; }
    const start = text.indexOf(s);
    const q = {
      schema_version: 'ucdm-voc-1.0.0',
      utterance_ref: utterance.content_hash,
      question_type: type,
      question_taxonomy_version: T.QUESTION_TAXONOMY_VERSION,
      verbatim_question: s,                 // exact language preserved
      span: { text: s, start, end: start + s.length },
      speaker_role: utterance.speaker_role,
      speaker_pseudonym: utterance.speaker_pseudonym,
      source_ref: utterance.source_ref,
      evidence_refs: [...((utterance.provenance && utterance.provenance.evidence_refs) || [])],
    };
    q.question_id = 'vocq_' + sha256Hex(canonicalize({ ...q, question_id: undefined }));
    out.push(deepFreeze(q));
  }
  return out;
}

function validateQuestion(q) {
  const errors = [];
  if (!T.QUESTION_TYPES.includes(q.question_type)) errors.push(`bad question_type "${q.question_type}"`);
  if (q.question_taxonomy_version !== T.QUESTION_TAXONOMY_VERSION) errors.push('uncontrolled question taxonomy');
  if (!q.verbatim_question) errors.push('exact question language must be preserved');
  return { valid: errors.length === 0, errors };
}

module.exports = { extractQuestions, validateQuestion, INTERROGATIVE };
