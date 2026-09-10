'use strict';
// [ASTRA-11I §W] Message FOUNDATION only — NOT ad copy. Canonical fields drawn from
// ASTRA-11F/G/H/I artifacts. Buying-language refs reuse the ASTRA-11F library. Copy
// generation belongs to a later controlled layer. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const UNKNOWN = { status: 'UNKNOWN' };

// buildMessageFoundation({ territory, valueProposition, persona, objectionMap, proofStrategy, vocResult, journeyResult })
function buildMessageFoundation(x) {
  const { territory = null, valueProposition = null, persona = null, objectionMap = [], proofStrategy = null, vocResult = {}, journeyResult = null } = x;

  const primary_problem = persona && persona.primary_problem && persona.primary_problem.status !== 'UNKNOWN'
    ? { concept: persona.primary_problem.concept, evidence_refs: persona.primary_problem.evidence_refs } : UNKNOWN;
  const desired_progress = persona && persona.desired_situation && persona.desired_situation.status !== 'UNKNOWN'
    ? { concept: persona.desired_situation.concept, evidence_refs: persona.desired_situation.evidence_refs } : UNKNOWN;
  const differentiator = territory && territory.differentiation_basis.length
    ? { types: territory.differentiation_basis, evidence_refs: territory.evidence_refs } : UNKNOWN;
  const reason_to_believe = proofStrategy && proofStrategy.available.length
    ? { proof_types: proofStrategy.available.map(p => p.proof_type), evidence_refs: [...new Set(proofStrategy.available.flatMap(p => p.evidence_refs))].sort() } : UNKNOWN;
  const topObjection = objectionMap.slice().sort((a, b) => b.evidence_refs.length - a.evidence_refs.length)[0];
  const objection = topObjection ? { concept: topObjection.objection_concept, handling_status: topObjection.handling_status, evidence_refs: topObjection.evidence_refs } : UNKNOWN;
  const proof = reason_to_believe;
  // CTA intent — the customer's evidenced next step (a question / inquiry), NOT a fabricated CTA
  const q = (journeyResult && journeyResult.questions) || [];
  const cta_intent = q.length
    ? { intent: q[0].question_type ? `answer: ${q[0].question_type}` : 'provide requested information', evidence_refs: q.flatMap(x2 => x2.evidence_refs).slice(0, 5) }
    : UNKNOWN;

  // buying-language refs (ASTRA-11F library only)
  const bl = vocResult.buyingLanguage || null;
  const buying_language_refs = bl && persona && persona.buying_language_refs && persona.buying_language_refs.status !== 'UNKNOWN'
    ? { library_id: bl.library_id, contains_generated_copy: false, by_aspect: persona.buying_language_refs.by_aspect } : UNKNOWN;

  const body = {
    schema_version: 'ucdm-positioning-offer-1.0.0', kind: 'MessageFoundation',
    segment_ref: territory ? territory.target_segment_refs[0] : null,
    value_proposition_ref: valueProposition ? valueProposition.value_proposition_id : null,
    primary_problem, desired_progress, differentiator, reason_to_believe, objection, proof, cta_intent,
    buying_language_refs,
    is_ad_copy: false,
    note: 'canonical message foundation only — ad-copy generation belongs to a later controlled runtime layer',
    generated_by: 'deterministic:ucdm/positioning_offer',
  };
  body.unknowns = ['primary_problem', 'desired_progress', 'differentiator', 'reason_to_believe', 'objection', 'proof', 'cta_intent', 'buying_language_refs'].filter(k => body[k] && body[k].status === 'UNKNOWN');
  body.foundation_id = 'mf_' + sha256Hex(canonicalize({ ...body, foundation_id: undefined }));
  return deepFreeze(body);
}

function validateMessageFoundation(m) {
  const errors = [];
  if (m.is_ad_copy !== false) errors.push('message foundation must not be ad copy');
  if (m.buying_language_refs && m.buying_language_refs.status !== 'UNKNOWN' && m.buying_language_refs.contains_generated_copy !== false) errors.push('buying language refs must not contain generated copy');
  for (const k of ['primary_problem', 'desired_progress', 'differentiator', 'reason_to_believe', 'objection', 'proof']) {
    const f = m[k];
    if (f && f.status !== 'UNKNOWN' && (!f.evidence_refs || f.evidence_refs.length === 0)) errors.push(`message foundation ${k} present without evidence`);
  }
  return { valid: errors.length === 0, errors };
}

module.exports = { buildMessageFoundation, validateMessageFoundation };
