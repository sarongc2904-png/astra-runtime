'use strict';
// [ASTRA-11I §D] Canonical ValueProposition. Built ONLY from canonical supported fields of
// ASTRA-11F/G/H artifacts. Missing support -> the slot is UNKNOWN/PARTIAL; the whole VP is
// never fabricated. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const { assess } = require('../validation/confidence');

const UNKNOWN = { status: 'UNKNOWN' };
const VP_STATUS = Object.freeze(['SUPPORTED', 'PARTIAL', 'HYPOTHESIS', 'INSUFFICIENT']);

// buildValueProposition({ segment, persona, jtbd, differentiation, proofStrategy, frame, businessInput })
function buildValueProposition(x) {
  const { segment = null, persona = null, jtbd = null, differentiation = [], proofStrategy = null, frame = null, businessInput = {} } = x;

  const target = segment ? { segment_ref: segment.segment_id, label: segment.label, evidence_refs: segment.supporting_evidence_refs } : UNKNOWN;
  const problem = persona && persona.primary_problem && persona.primary_problem.status !== 'UNKNOWN'
    ? { concept: persona.primary_problem.concept, evidence_refs: persona.primary_problem.evidence_refs } : UNKNOWN;
  const desired_outcome = persona && persona.desired_situation && persona.desired_situation.status !== 'UNKNOWN'
    ? { concept: persona.desired_situation.concept, evidence_refs: persona.desired_situation.evidence_refs }
    : (Array.isArray(persona && persona.desired_outcomes) && persona.desired_outcomes.length
      ? { concepts: persona.desired_outcomes.map(d => d.concept), evidence_refs: [...new Set(persona.desired_outcomes.flatMap(d => d.evidence_refs))].sort() } : UNKNOWN);
  const caps = (businessInput.capabilities || []);
  const mechanism = caps.length
    ? { statements: caps.map(c => String(c.capability)), source_class: 'USER_PROVIDED', evidence_refs: [...new Set(caps.flatMap(c => c.evidence_refs || []))].sort() } : UNKNOWN;
  const strongDiff = differentiation.filter(d => d.customer_relevance === 'EVIDENCED' && d.uniqueness_status !== 'PARITY_IN_SAMPLE');
  const diffField = strongDiff.length
    ? { types: [...new Set(strongDiff.map(d => d.differentiation_type))].sort(), evidence_refs: [...new Set(strongDiff.flatMap(d => d.observed_capability.evidence_refs.concat(d.analytical_hypothesis.evidence_refs)))].sort(), basis: 'ANALYTICAL' } : UNKNOWN;
  const reason_to_believe = proofStrategy && proofStrategy.available.length
    ? { proof_types: proofStrategy.available.map(p => p.proof_type), evidence_refs: [...new Set(proofStrategy.available.flatMap(p => p.evidence_refs))].sort() } : UNKNOWN;
  const proof = reason_to_believe;
  const constraints = (businessInput.constraints || []).length
    ? { items: businessInput.constraints.map(c => c.type), source_class: 'USER_PROVIDED' } : UNKNOWN;

  const slots = { target, problem, desired_outcome, mechanism, differentiation: diffField, reason_to_believe, proof, constraints };
  const known = Object.entries(slots).filter(([, v]) => v && v.status !== 'UNKNOWN').map(([k]) => k);
  let status;
  const core = ['target', 'problem', 'desired_outcome'];
  if (core.every(k => slots[k].status !== 'UNKNOWN') && known.length >= 5) status = 'SUPPORTED';
  else if (core.filter(k => slots[k].status !== 'UNKNOWN').length >= 2) status = 'PARTIAL';
  else if (known.length >= 1) status = 'HYPOTHESIS';
  else status = 'INSUFFICIENT';

  const evidence_refs = [...new Set(Object.values(slots).flatMap(v => (v && v.evidence_refs) || []))].sort();
  const body = {
    schema_version: 'ucdm-positioning-offer-1.0.0', kind: 'ValueProposition',
    segment_ref: segment ? segment.segment_id : null,
    frame_ref: frame ? frame.frame_id : null,
    jtbd_ref: jtbd ? jtbd.job_id : null,
    slots,
    status, known_slots: known.sort(),
    unknown_slots: Object.keys(slots).filter(k => slots[k].status === 'UNKNOWN').sort(),
    evidence_refs,
    rendered: renderVP(slots, status),
    confidence: assess({ evidence_count: evidence_refs.length, distinct_sources: known.length, coverage: known.length / 8 }),
    generated_by: 'deterministic:ucdm/positioning_offer',
  };
  body.value_proposition_id = 'vp_' + sha256Hex(canonicalize({ ...body, value_proposition_id: undefined, confidence: body.confidence.content_hash }));
  return deepFreeze(body);
}

// deterministic render; unknown slots stay literally [unknown]
function renderVP(s, status) {
  const t = s.target.status !== 'UNKNOWN' ? s.target.label : '[unknown target]';
  const p = s.problem.status !== 'UNKNOWN' ? phrase(s.problem.concept) : '[unknown problem]';
  const o = s.desired_outcome.status !== 'UNKNOWN' ? (s.desired_outcome.concept ? phrase(s.desired_outcome.concept) : (s.desired_outcome.concepts || []).map(phrase).join(' and ')) : '[unknown outcome]';
  const m = s.mechanism.status !== 'UNKNOWN' ? s.mechanism.statements.join(', ') : '[unknown mechanism]';
  return {
    text: `For ${t} facing ${p}, we help achieve ${o} via ${m}.`,
    status, is_analytical: true, adds_no_new_facts: true,
  };
}
function phrase(c) { return String(c || '').toLowerCase().replace(/_/g, ' '); }

function validateValueProposition(vp) {
  const errors = [];
  if (!VP_STATUS.includes(vp.status)) errors.push(`bad VP status "${vp.status}"`);
  if (vp.status === 'SUPPORTED' && (vp.slots.target.status === 'UNKNOWN' || vp.slots.problem.status === 'UNKNOWN' || vp.slots.desired_outcome.status === 'UNKNOWN')) errors.push('a SUPPORTED value proposition needs target + problem + desired_outcome');
  for (const [k, v] of Object.entries(vp.slots)) if (v && v.status !== 'UNKNOWN' && k !== 'constraints' && k !== 'mechanism' && (!v.evidence_refs || v.evidence_refs.length === 0) && v.source_class !== 'USER_PROVIDED') errors.push(`VP slot ${k} present without evidence`);
  if (vp.rendered.adds_no_new_facts !== true) errors.push('VP render must add no new facts');
  if (/\b(guaranteed results|the only|#1|world[- ]class|revolucionari|transformar[aá] tu vida)\b/i.test(vp.rendered.text)) errors.push('VP render contains unsupported hype');
  return { valid: errors.length === 0, errors };
}

module.exports = { VP_STATUS, buildValueProposition, validateValueProposition };
