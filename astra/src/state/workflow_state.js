'use strict';
// WORKFLOW_STATE — object + validated transitions + lightweight local persistence (JSON).
// Additive history for decisions/assumptions/open_questions. No Supabase.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const STATUSES = ['PLANNED', 'RUNNING', 'WAITING_FOR_INPUT', 'BLOCKED', 'COMPLETE', 'FAILED'];
const TRANSITIONS = {
  PLANNED: ['RUNNING', 'WAITING_FOR_INPUT', 'BLOCKED', 'FAILED'],
  RUNNING: ['WAITING_FOR_INPUT', 'BLOCKED', 'COMPLETE', 'FAILED'],
  WAITING_FOR_INPUT: ['RUNNING', 'BLOCKED', 'FAILED'],
  BLOCKED: ['RUNNING', 'FAILED'],
  COMPLETE: [],
  FAILED: [],
};

function create({ user_goal, task_brief, workflow }) {
  const workflow_id = (workflow && workflow.workflow_id) || 'WF_' + crypto.randomBytes(6).toString('hex');
  return {
    project_id: 'PRJ_' + crypto.createHash('sha256').update(String(user_goal || '')).digest('hex').slice(0, 10),
    workflow_id,
    workflow_type: (workflow && workflow.intent) || 'GENERIC',
    user_goal: user_goal || '',
    task_brief: task_brief || null,
    workflow_steps: (workflow && workflow.steps) ? workflow.steps.map(s => ({ step_id: s.step_id, name: s.name, specialist_type: s.specialist_type, depends_on: s.dependencies, status: s.status || 'PLANNED' })) : [],
    current_step: null,
    selected_methods: {},
    evidence_bundles: {},
    specialist_outputs: {},
    decisions: [],
    assumptions: [],
    open_questions: [],
    research: [],
    cost_usage: { by_step: {}, total_tokens: 0, by_tier: {} },
    provenance_index: {},
    status: 'PLANNED',
    version: 'ws-0.1',
    updated_at: new Date().toISOString(),
  };
}

function canTransition(from, to) { return STATUSES.includes(to) && (TRANSITIONS[from] || []).includes(to); }

function transition(state, to) {
  if (!canTransition(state.status, to)) throw new Error(`invalid transition: ${state.status} -> ${to}`);
  state.status = to; state.updated_at = new Date().toISOString();
  return state;
}

// additive helpers (never rewrite history)
function addDecision(state, d) { state.decisions.push(Object.assign({ at: new Date().toISOString() }, d)); state.updated_at = new Date().toISOString(); }
function addAssumption(state, a) { state.assumptions.push({ assumption: a, source_class: 'INFERENCE', at: new Date().toISOString() }); }
function addOpenQuestion(state, q) { state.open_questions.push(q); }
function setSelectedMethod(state, stepId, adjudication) { state.selected_methods[stepId] = adjudication; }
function addEvidenceBundle(state, bundleId, bundle) { state.evidence_bundles[bundleId] = bundle; }

function save(state, dir) {
  const d = dir || path.join(__dirname, '..', '..', 'state', 'store');
  fs.mkdirSync(d, { recursive: true });
  const p = path.join(d, state.workflow_id + '.json');
  fs.writeFileSync(p, JSON.stringify(state, null, 2) + '\n');
  return p;
}
function load(workflowId, dir) {
  const d = dir || path.join(__dirname, '..', '..', 'state', 'store');
  return JSON.parse(fs.readFileSync(path.join(d, workflowId + '.json'), 'utf8'));
}

module.exports = { STATUSES, TRANSITIONS, create, canTransition, transition, addDecision, addAssumption, addOpenQuestion, setSelectedMethod, addEvidenceBundle, save, load };
