'use strict';
// [ASTRA-11H §O] Deterministic job statement:
//   "When [situation], I want to [motivation/action], so I can [desired progress]."
// Every component derives from canonical JobToBeDone fields. An unknown component is rendered
// literally as "[unknown]" — never filled with fabricated prose. Pure function so the render
// can be recomputed and verified (adds no facts). No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const CONCEPT_PHRASE = Object.freeze({
  PAIN_EXPERIENCED: 'an unresolved problem', PAIN_FEAR: 'a procedure I am anxious about',
  SLOW_SERVICE: 'slow service', RESPONSIVENESS_COMPLAINT: 'poor responsiveness',
  RESULTS_DESIRED: 'get real results', SPEED_NEED: 'get it done quickly',
  CONVENIENCE_VALUE: 'a convenient option', PRICE_CONCERN: 'the price feels high',
  PRICE_ACCEPTANCE: 'the value justifies the price', PROCESS_UNCLEAR: 'an unclear process',
  RESULTS_UNCERTAINTY: 'uncertainty the solution works', TRUST_CONCERN: 'doubts about who to trust',
  FINANCING_DEMAND: 'pay over time', GUARANTEE_DEMAND: 'a guarantee', QUALITY_PRAISE: 'high quality',
});
function phrase(concept) { return CONCEPT_PHRASE[concept] || String(concept || '').toLowerCase().replace(/_/g, ' '); }

function renderJobStatement(job) {
  const situation = job.situation && job.situation.status !== 'UNKNOWN' ? phrase(job.situation.concept) : '[unknown]';
  const reconstructed = job.functional_job && /reconstructed from the primary problem/.test(job.functional_job.note || '');
  const motivation = job.functional_job && job.functional_job.status !== 'UNKNOWN'
    ? (reconstructed ? 'resolve ' : '') + job.functional_job.concepts.map(phrase).join(' and ') : '[unknown]';
  const progress = job.desired_progress && job.desired_progress.status !== 'UNKNOWN'
    ? (job.desired_progress.concept ? phrase(job.desired_progress.concept) : (job.desired_progress.concepts || []).map(phrase).join(' and ')) : '[unknown]';
  const text = `When ${situation}, I want to ${motivation}, so I can ${progress}.`;
  const body = {
    schema_version: 'ucdm-journey-1.0.0', kind: 'JobStatement', job_ref: job.job_id,
    text, components: { situation, motivation, progress },
    has_unknown_component: [situation, motivation, progress].includes('[unknown]'),
    is_analytical: true, adds_no_new_facts: true,
    generated_by: 'deterministic:ucdm/journey/job_statement',
  };
  body.statement_id = 'jst_' + sha256Hex(canonicalize({ ...body, statement_id: undefined }));
  return deepFreeze(body);
}

function validateJobStatement(s, job) {
  const errors = [];
  const expected = renderJobStatement(job).text;
  if (s.text !== expected) errors.push('job statement text diverges from the deterministic rendering of canonical fields');
  if (s.adds_no_new_facts !== true) errors.push('job statement must assert adds_no_new_facts');
  if (/\b\d{2}\s*(años|year)|casad|married|Instagram|feel successful|siente exitos/i.test(s.text)) errors.push('job statement contains fabricated prose / psychographic filler');
  return { valid: errors.length === 0, errors };
}

module.exports = { renderJobStatement, validateJobStatement };
