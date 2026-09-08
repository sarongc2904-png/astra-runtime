'use strict';
// TASK_BRIEF schema + validator (domain-general). Node built-ins only.

const REQUIRED = ['task_id', 'raw_user_request', 'objective', 'business_type', 'target_customer',
  'desired_deliverable', 'funnel_stage', 'constraints', 'urgency', 'research_need', 'knowledge_need',
  'uncertainty', 'language', 'status'];

const ENUMS = {
  urgency: ['LOW', 'MEDIUM', 'HIGH'],
  research_need: ['LOW', 'MEDIUM', 'HIGH'],
  knowledge_need: ['LOW', 'MEDIUM', 'HIGH'],
  uncertainty: ['LOW', 'MEDIUM', 'HIGH'],
  language: ['es', 'en'],
  status: ['DRAFT', 'READY', 'INCOMPLETE'],
};
const FUNNEL_STAGES = ['awareness', 'acquisition', 'activation', 'conversion', 'retention'];

function makeBrief(partial = {}) {
  return Object.assign({
    task_id: null, raw_user_request: '', objective: null, business_type: null, target_customer: null,
    desired_deliverable: null, funnel_stage: [], constraints: { budget: null, time: null, channels: [], skill: null, compliance: [] },
    urgency: 'MEDIUM', research_need: 'MEDIUM', knowledge_need: 'MEDIUM', uncertainty: 'MEDIUM',
    language: 'es', status: 'DRAFT', source_facts: [],
  }, partial);
}

// Returns { valid, errors[] }. Domain-general; does not special-case any vertical.
function validate(brief) {
  const errors = [];
  if (!brief || typeof brief !== 'object') return { valid: false, errors: ['brief is not an object'] };
  for (const f of REQUIRED) {
    if (!(f in brief) || brief[f] === undefined) errors.push(`missing required field: ${f}`);
  }
  for (const [f, allowed] of Object.entries(ENUMS)) {
    if (brief[f] != null && !allowed.includes(brief[f])) errors.push(`invalid ${f}: ${brief[f]} (allowed: ${allowed.join('|')})`);
  }
  if (brief.funnel_stage != null) {
    if (!Array.isArray(brief.funnel_stage)) errors.push('funnel_stage must be an array');
    else for (const s of brief.funnel_stage) if (!FUNNEL_STAGES.includes(s)) errors.push(`invalid funnel_stage: ${s}`);
  }
  if (brief.constraints != null && typeof brief.constraints !== 'object') errors.push('constraints must be an object');
  if (brief.task_id != null && typeof brief.task_id !== 'string') errors.push('task_id must be a string');
  if (brief.raw_user_request != null && typeof brief.raw_user_request !== 'string') errors.push('raw_user_request must be a string');
  return { valid: errors.length === 0, errors };
}

module.exports = { REQUIRED, ENUMS, FUNNEL_STAGES, makeBrief, validate };
