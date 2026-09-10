'use strict';
// [ASTRA-11G §K] Awareness classification. ANALYTICAL unless explicitly observed. Evidence
// refs required. MIXED is preserved — evidence is never forced into one stage. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const AWARENESS_STAGES = Object.freeze(['UNAWARE', 'PROBLEM_AWARE', 'SOLUTION_AWARE', 'PRODUCT_AWARE', 'MOST_AWARE', 'MIXED', 'UNKNOWN']);

// Deterministic concept -> stage signal map (controlled).
const STAGE_SIGNALS = Object.freeze({
  PROBLEM_AWARE: ['PAIN_EXPERIENCED', 'PAIN_FEAR', 'SLOW_SERVICE', 'RESPONSIVENESS_COMPLAINT', 'PROCESS_UNCLEAR'],
  SOLUTION_AWARE: ['RESULTS_DESIRED', 'RESULTS_UNCERTAINTY', 'SPEED_NEED'],
  PRODUCT_AWARE: ['PRICE_CONCERN', 'PRICE_ACCEPTANCE', 'GUARANTEE_DEMAND', 'FINANCING_DEMAND', 'TRUST_CONCERN'],
  MOST_AWARE: ['QUALITY_PRAISE', 'CONVENIENCE_VALUE'],
});

// classifyAwareness(observations, { explicit, alternatives, questions }) -> frozen assessment
//   explicit: { stage, evidence_refs } supplied/observed directly (USER_PROVIDED / OBSERVED)
function classifyAwareness(observations, { explicit = null, alternatives = [], questions = [] } = {}) {
  if (explicit && AWARENESS_STAGES.includes(explicit.stage)) {
    return deepFreeze(mk({ stage: explicit.stage, basis: 'OBSERVED', evidence_refs: explicit.evidence_refs || [], stage_hits: {}, note: 'explicitly supplied/observed' }));
  }
  const hits = {};
  const evByStage = {};
  const bump = (stage, refs) => { hits[stage] = (hits[stage] || 0) + 1; (evByStage[stage] = evByStage[stage] || []).push(...(refs || [])); };
  for (const o of observations) {
    if (o.status !== 'OBSERVED') continue;
    for (const [stage, concepts] of Object.entries(STAGE_SIGNALS)) {
      if (concepts.includes(o.normalized_concept)) bump(stage, o.evidence_refs);
    }
  }
  // an alternative already tried/considered => the customer is at least SOLUTION_AWARE
  for (const a of alternatives) if (['diy', 'manual_process', 'cheaper_option', 'existing_provider', 'different_category', 'competitor'].includes(a.alternative_type)) bump('SOLUTION_AWARE', a.evidence_refs);
  // a comparison question => PRODUCT_AWARE
  for (const q of questions) if (['comparison_question', 'price_question', 'guarantee_question', 'financing_question'].includes(q.question_type)) bump('PRODUCT_AWARE', q.evidence_refs);
  const present = Object.keys(hits);
  let stage, basis = 'ANALYTICAL';
  if (present.length === 0) { stage = 'UNKNOWN'; basis = 'UNKNOWN'; }
  else if (present.length >= 2) stage = 'MIXED';
  else stage = present[0];
  const evidence_refs = [...new Set(Object.values(evByStage).flat())].sort();
  return deepFreeze(mk({ stage, basis, evidence_refs, stage_hits: hits, note: stage === 'MIXED' ? 'multiple awareness stages present in the sample — not collapsed' : 'analytical classification from controlled concept signals' }));
}

function mk(x) {
  const body = {
    schema_version: 'ucdm-customer-model-1.0.0', kind: 'AwarenessAssessment',
    stage: x.stage, basis: x.basis, evidence_refs: x.evidence_refs, stage_hits: x.stage_hits,
    note: x.note, generated_by: 'deterministic:ucdm/customer_model/awareness',
  };
  body.awareness_id = 'cmaw_' + sha256Hex(canonicalize({ ...body, awareness_id: undefined }));
  return body;
}

function validateAwareness(a) {
  const errors = [];
  if (!AWARENESS_STAGES.includes(a.stage)) errors.push(`bad awareness stage "${a.stage}"`);
  if (['PROBLEM_AWARE', 'SOLUTION_AWARE', 'PRODUCT_AWARE', 'MOST_AWARE', 'MIXED'].includes(a.stage) && a.evidence_refs.length === 0) errors.push('a non-UNKNOWN awareness stage needs evidence_refs');
  if (a.basis === 'OBSERVED' && a.stage === 'UNKNOWN') errors.push('OBSERVED basis cannot yield UNKNOWN');
  return { valid: errors.length === 0, errors };
}

module.exports = { AWARENESS_STAGES, STAGE_SIGNALS, classifyAwareness, validateAwareness };
