'use strict';
// [ASTRA-11H §I] ProofRequirement. OBSERVED_REQUIRED when the customer explicitly asks for
// proof; ANALYTICAL when reconstructed from a concern; UNKNOWN otherwise. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const PROOF_TYPES = Object.freeze([
  'TESTIMONIALS', 'CASE_RESULTS', 'PRICE_TRANSPARENCY', 'GUARANTEE', 'TECHNICAL_EXPLANATION',
  'CREDENTIAL', 'DEMONSTRATION', 'COMPARISON', 'SAMPLE', 'TRIAL', 'UNKNOWN',
]);
const PROOF_STATUS = Object.freeze(['OBSERVED_REQUIRED', 'ANALYTICAL', 'UNKNOWN']);

// Explicit question_type -> proof required.
const QTYPE_PROOF = Object.freeze({
  guarantee_question: 'GUARANTEE', result_question: 'CASE_RESULTS', comparison_question: 'COMPARISON',
  trust_question: 'TESTIMONIALS', price_question: 'PRICE_TRANSPARENCY', process_question: 'TECHNICAL_EXPLANATION',
  risk_question: 'TECHNICAL_EXPLANATION',
});
// Concept -> analytical proof need.
const CONCEPT_PROOF = Object.freeze({
  GUARANTEE_DEMAND: 'GUARANTEE', RESULTS_UNCERTAINTY: 'CASE_RESULTS', TRUST_CONCERN: 'TESTIMONIALS',
  RESULTS_DESIRED: 'CASE_RESULTS', PRICE_CONCERN: 'PRICE_TRANSPARENCY', PROCESS_UNCLEAR: 'TECHNICAL_EXPLANATION',
});

function buildProofRequirements({ vocResult }) {
  const rows = new Map();
  const add = (type, status, stage, evidence_refs, source_ref) => {
    const key = type;
    const cur = rows.get(key) || { type, status: 'ANALYTICAL', stage, evidence_refs: new Set(), source_refs: new Set() };
    if (status === 'OBSERVED_REQUIRED') cur.status = 'OBSERVED_REQUIRED';
    for (const er of evidence_refs) cur.evidence_refs.add(er);
    if (source_ref) cur.source_refs.add(source_ref);
    rows.set(key, cur);
  };
  for (const q of (vocResult.questions || [])) {
    const t = QTYPE_PROOF[q.question_type];
    if (t) add(t, 'OBSERVED_REQUIRED', 'VENDOR_EVALUATION', q.evidence_refs || [], q.source_ref);
  }
  for (const vo of (vocResult.observations || [])) {
    if (vo.status !== 'OBSERVED') continue;
    const t = CONCEPT_PROOF[vo.normalized_concept];
    if (t) add(t, 'ANALYTICAL', 'VENDOR_EVALUATION', vo.evidence_refs, vo.source_ref);
  }
  return [...rows.values()].map(r => {
    const body = {
      schema_version: 'ucdm-journey-1.0.0', kind: 'ProofRequirement',
      proof_type: r.type, status: r.status, stage: r.stage,
      evidence_refs: [...r.evidence_refs].sort(), source_refs: [...r.source_refs].sort(),
      generated_by: 'deterministic:ucdm/journey',
    };
    body.proof_id = 'jpr_' + sha256Hex(canonicalize({ ...body, proof_id: undefined }));
    return deepFreeze(body);
  }).sort((a, b) => (a.proof_type < b.proof_type ? -1 : 1));
}

function validateProofRequirement(p) {
  const errors = [];
  if (!PROOF_TYPES.includes(p.proof_type)) errors.push(`bad proof_type "${p.proof_type}"`);
  if (!PROOF_STATUS.includes(p.status)) errors.push(`bad proof status "${p.status}"`);
  if (p.status !== 'UNKNOWN' && p.evidence_refs.length === 0) errors.push('a proof requirement needs supporting evidence');
  return { valid: errors.length === 0, errors };
}

module.exports = { PROOF_TYPES, PROOF_STATUS, buildProofRequirements, validateProofRequirement };
