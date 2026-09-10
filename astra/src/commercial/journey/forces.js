'use strict';
// [ASTRA-11H §P] Jobs-to-be-Done four forces of progress. Each force requires evidence or
// remains UNKNOWN. ASTRA does NOT manufacture a balanced four-force diagram when the evidence
// only supports one or two forces. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const { assess } = require('../validation/confidence');

const FORCES = Object.freeze(['PUSH_OF_CURRENT_SITUATION', 'PULL_OF_NEW_SOLUTION', 'ANXIETY_OF_NEW_SOLUTION', 'HABIT_OF_PRESENT']);

const FORCE_CONCEPTS = Object.freeze({
  PUSH_OF_CURRENT_SITUATION: ['PAIN_EXPERIENCED', 'SLOW_SERVICE', 'RESPONSIVENESS_COMPLAINT', 'PROCESS_UNCLEAR'],
  PULL_OF_NEW_SOLUTION: ['RESULTS_DESIRED', 'SPEED_NEED', 'CONVENIENCE_VALUE', 'QUALITY_PRAISE', 'PRICE_ACCEPTANCE'],
  ANXIETY_OF_NEW_SOLUTION: ['PAIN_FEAR', 'RESULTS_UNCERTAINTY', 'TRUST_CONCERN'],
  // HABIT is evidenced by alternatives, handled separately
});
const HABIT_ALT_TYPES = ['DO_NOTHING', 'DELAY', 'INTERNAL_SOLUTION'];

// buildForces({ observations, journeyAlternatives, triggers }) -> { forces{...}, present[], absent[] }
function buildForces({ observations = [], journeyAlternatives = [], triggers = [] }) {
  const obs = observations.filter(o => o.status === 'OBSERVED');
  const forces = {};
  for (const force of ['PUSH_OF_CURRENT_SITUATION', 'PULL_OF_NEW_SOLUTION', 'ANXIETY_OF_NEW_SOLUTION']) {
    const rows = obs.filter(o => (FORCE_CONCEPTS[force] || []).includes(o.normalized_concept) && !o.negated);
    forces[force] = rows.length
      ? { status: 'PRESENT', signal_count: rows.length, concepts: [...new Set(rows.map(o => o.normalized_concept))].sort(), evidence_refs: [...new Set(rows.flatMap(o => o.evidence_refs))].sort(), strength_basis: 'OBSERVED_SIGNAL_COUNT' }
      : { status: 'UNKNOWN' };
  }
  // PUSH is also supported by a PAIN_ESCALATION / FAILURE trigger
  const pushTrig = triggers.filter(t => ['PAIN_ESCALATION', 'FAILURE_OF_CURRENT_SOLUTION'].includes(t.category));
  if (pushTrig.length && forces.PUSH_OF_CURRENT_SITUATION.status === 'UNKNOWN') {
    forces.PUSH_OF_CURRENT_SITUATION = { status: 'PRESENT', signal_count: pushTrig.length, concepts: [], evidence_refs: [...new Set(pushTrig.flatMap(t => t.evidence_refs))].sort(), strength_basis: 'TRIGGER' };
  }
  const habitAlts = journeyAlternatives.filter(a => HABIT_ALT_TYPES.includes(a.alternative_type));
  forces.HABIT_OF_PRESENT = habitAlts.length
    ? { status: 'PRESENT', signal_count: habitAlts.length, concepts: habitAlts.map(a => a.alternative_type), evidence_refs: [...new Set(habitAlts.flatMap(a => a.evidence_refs))].sort(), strength_basis: 'ALTERNATIVE' }
    : { status: 'UNKNOWN' };

  const present = FORCES.filter(f => forces[f].status === 'PRESENT');
  const body = {
    schema_version: 'ucdm-journey-1.0.0', kind: 'ForcesOfProgress',
    forces,
    present_forces: present,
    unknown_forces: FORCES.filter(f => forces[f].status === 'UNKNOWN'),
    complete_four_force_model: present.length === 4,
    note: present.length < 4 ? `only ${present.length} of 4 forces are evidenced — the model is NOT padded to four` : 'all four forces are independently evidenced',
    confidence: assess({ evidence_count: present.reduce((s, f) => s + forces[f].evidence_refs.length, 0), distinct_sources: present.length, coverage: present.length / 4 }),
    generated_by: 'deterministic:ucdm/journey/forces',
  };
  body.forces_id = 'jfp_' + sha256Hex(canonicalize({ ...body, forces_id: undefined, confidence: body.confidence.content_hash }));
  return deepFreeze(body);
}

function validateForces(f) {
  const errors = [];
  for (const name of FORCES) {
    const force = f.forces[name];
    if (!force) { errors.push(`missing force ${name}`); continue; }
    if (force.status === 'PRESENT' && (!force.evidence_refs || force.evidence_refs.length === 0)) errors.push(`force ${name} PRESENT without evidence`);
    if (!['PRESENT', 'UNKNOWN'].includes(force.status)) errors.push(`force ${name} bad status "${force.status}"`);
  }
  if (f.complete_four_force_model && f.present_forces.length !== 4) errors.push('complete_four_force_model must reflect real evidenced forces');
  return { valid: errors.length === 0, errors };
}

module.exports = { FORCES, FORCE_CONCEPTS, buildForces, validateForces };
