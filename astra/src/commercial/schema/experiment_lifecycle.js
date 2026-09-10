'use strict';
// [ASTRA-11B] Experiment lifecycle + BusinessLearning traceability (ASTRA-11B section I).
// Deterministic state machine. No I/O, no LLM, no network.

const STATES = Object.freeze(['PROPOSED', 'APPROVED', 'RUNNING', 'COMPLETED']);
// Terminal decisions recorded on a COMPLETED experiment.
const DECISIONS = Object.freeze(['KEEP', 'ITERATE', 'REJECT', 'INCONCLUSIVE']);

const TRANSITIONS = Object.freeze({
  PROPOSED: ['APPROVED', 'REJECT'],       // may be rejected before running
  APPROVED: ['RUNNING', 'REJECT'],
  RUNNING: ['COMPLETED'],
  COMPLETED: [],                           // terminal; decision is set, not a state
});

class ExperimentLifecycleError extends Error {
  constructor(msg) { super(msg); this.name = 'ExperimentLifecycleError'; }
}

function canTransition(from, to) {
  if (to === 'REJECT') return from === 'PROPOSED' || from === 'APPROVED';
  return (TRANSITIONS[from] || []).includes(to);
}

// Apply a transition, returning a NEW experiment object (append-only friendly; never mutates).
function transition(exp, to, patch = {}) {
  const from = exp.state;
  if (!STATES.includes(from) && from !== 'REJECT') throw new ExperimentLifecycleError(`unknown current state "${from}"`);
  if (to === 'REJECT') {
    if (!canTransition(from, 'REJECT')) throw new ExperimentLifecycleError(`cannot REJECT from "${from}"`);
    return Object.freeze({ ...exp, state: 'COMPLETED', decision: 'REJECT', ...patch });
  }
  if (!canTransition(from, to)) throw new ExperimentLifecycleError(`illegal transition ${from} -> ${to}`);
  const next = { ...exp, state: to, ...patch };
  if (to === 'COMPLETED' && !DECISIONS.includes(next.decision)) {
    throw new ExperimentLifecycleError(`COMPLETED experiment must carry a decision (${DECISIONS.join('/')})`);
  }
  return Object.freeze(next);
}

// Validate a full experiment record's shape + that its result/decision are consistent with
// its state. Returns { valid, errors[] }.
function validateExperiment(exp) {
  const errors = [];
  const required = ['experiment_id', 'problem', 'hypothesis', 'variable', 'primary_metric', 'state'];
  for (const k of required) if (exp[k] == null) errors.push('missing:' + k);
  if (exp.state != null && !STATES.includes(exp.state)) errors.push('bad state:' + exp.state);
  if (exp.state === 'COMPLETED') {
    if (!DECISIONS.includes(exp.decision)) errors.push('COMPLETED without valid decision');
    if (exp.decision !== 'REJECT' && exp.result == null) errors.push('COMPLETED (non-REJECT) without result');
  }
  if (['RUNNING', 'COMPLETED'].includes(exp.state) && exp.start_at == null) errors.push('RUNNING/COMPLETED without start_at');
  if (exp.state === 'COMPLETED' && exp.end_at == null) errors.push('COMPLETED without end_at');
  // A KEEP/ITERATE/REJECT decision must reference a learning for business memory.
  if (exp.state === 'COMPLETED' && exp.decision !== 'INCONCLUSIVE' && exp.learning_ref == null) {
    errors.push('COMPLETED decision must produce a BusinessLearning (learning_ref)');
  }
  return { valid: errors.length === 0, errors };
}

// BusinessLearning traceability: a learning must name what was tried, where, when, and
// point back to its experiment + evidence. This is what later stops ASTRA re-recommending
// a previously failed experiment.
function validateBusinessLearning(bl) {
  const errors = [];
  const required = ['learning_id', 'what_was_tried', 'why', 'context', 'result', 'learning', 'experiment_ref', 'evidence_refs', 'confidence'];
  for (const k of required) if (bl[k] == null) errors.push('missing:' + k);
  if (bl.evidence_refs != null && (!Array.isArray(bl.evidence_refs) || bl.evidence_refs.length === 0)) errors.push('evidence_refs must be a non-empty array');
  const ctx = bl.context || {};
  for (const k of ['segment', 'offer', 'creative_or_message', 'when']) if (ctx[k] == null) errors.push('context missing:' + k);
  return { valid: errors.length === 0, errors };
}

module.exports = { STATES, DECISIONS, TRANSITIONS, canTransition, transition, validateExperiment, validateBusinessLearning, ExperimentLifecycleError };
