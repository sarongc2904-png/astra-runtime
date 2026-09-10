'use strict';
// [ASTRA-11H §H] JourneyQuestion / information need. An OBSERVED_QUESTION traces to a real
// customer question (ASTRA-11F). An ANALYTICAL_INFORMATION_NEED is a reconstruction and is
// labelled as such. Marketer assumptions never become customer questions. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const QUESTION_STATUS = Object.freeze(['OBSERVED_QUESTION', 'ANALYTICAL_INFORMATION_NEED', 'UNKNOWN']);

// ASTRA-11F question_type -> the stage where the information need bites.
const QTYPE_STAGE = Object.freeze({
  price_question: 'PURCHASE_INTENT', duration_question: 'VENDOR_EVALUATION', process_question: 'INFORMATION_SEEKING',
  risk_question: 'VENDOR_EVALUATION', result_question: 'VENDOR_EVALUATION', eligibility_question: 'SOLUTION_EXPLORATION',
  availability_question: 'PURCHASE_INTENT', financing_question: 'PURCHASE_INTENT', guarantee_question: 'VENDOR_EVALUATION',
  comparison_question: 'ALTERNATIVE_COMPARISON', trust_question: 'VENDOR_EVALUATION',
});

// Concepts that imply an analytical information need even without an explicit question.
const CONCEPT_NEED = Object.freeze({
  PROCESS_UNCLEAR: { need: 'how the process works', stage: 'INFORMATION_SEEKING' },
  RESULTS_UNCERTAINTY: { need: 'proof the solution works', stage: 'VENDOR_EVALUATION' },
  TRUST_CONCERN: { need: 'reasons to trust the provider', stage: 'VENDOR_EVALUATION' },
});

function buildQuestions({ vocResult }) {
  const out = [];
  for (const q of (vocResult.questions || [])) {
    const body = {
      schema_version: 'ucdm-journey-1.0.0', kind: 'JourneyQuestion',
      status: 'OBSERVED_QUESTION',
      verbatim_question: q.verbatim_question,
      question_type: q.question_type,
      stage: QTYPE_STAGE[q.question_type] || 'INFORMATION_SEEKING',
      evidence_refs: [...new Set(q.evidence_refs || [])].sort(),
      source_ref: q.source_ref || null,
      speaker_pseudonym: q.speaker_pseudonym || null,
      generated_by: 'deterministic:ucdm/journey',
    };
    body.question_id = 'jq_' + sha256Hex(canonicalize({ ...body, question_id: undefined }));
    out.push(deepFreeze(body));
  }
  // analytical needs from concepts (clearly marked, evidence-linked)
  const seenNeed = new Set();
  for (const vo of (vocResult.observations || [])) {
    if (vo.status !== 'OBSERVED') continue;
    const n = CONCEPT_NEED[vo.normalized_concept];
    if (!n || seenNeed.has(n.need)) continue;
    seenNeed.add(n.need);
    const body = {
      schema_version: 'ucdm-journey-1.0.0', kind: 'JourneyQuestion',
      status: 'ANALYTICAL_INFORMATION_NEED',
      verbatim_question: null, information_need: n.need, question_type: null, stage: n.stage,
      evidence_refs: [...new Set((vocResult.observations || []).filter(o => o.normalized_concept === vo.normalized_concept && o.status === 'OBSERVED').flatMap(o => o.evidence_refs))].sort(),
      source_ref: null, speaker_pseudonym: null,
      generated_by: 'deterministic:ucdm/journey',
    };
    body.question_id = 'jq_' + sha256Hex(canonicalize({ ...body, question_id: undefined }));
    out.push(deepFreeze(body));
  }
  return out;
}

function validateQuestion(q) {
  const errors = [];
  if (!QUESTION_STATUS.includes(q.status)) errors.push(`bad question status "${q.status}"`);
  if (q.status === 'OBSERVED_QUESTION' && (!q.verbatim_question || q.evidence_refs.length === 0)) errors.push('an OBSERVED_QUESTION needs verbatim text + evidence');
  if (q.status === 'ANALYTICAL_INFORMATION_NEED' && q.verbatim_question) errors.push('an analytical information need must not claim a verbatim question');
  if (q.status === 'ANALYTICAL_INFORMATION_NEED' && q.evidence_refs.length === 0) errors.push('an analytical information need still needs supporting evidence');
  return { valid: errors.length === 0, errors };
}

module.exports = { QUESTION_STATUS, QTYPE_STAGE, buildQuestions, validateQuestion };
