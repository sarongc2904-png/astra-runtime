'use strict';
// MODEL_ROUTER skeleton — maps task types -> task classes -> routing plan.
// No hardcoded/unavailable model ids; roles are configurable and resolved at run time elsewhere.
const { MAX_EVIDENCE_PER_STEP, SYNTHESIS_WORKING_CHARS, METHOD_METADATA_CHARS } = require('../../config/context_budgets');

const TASK_CLASSES = ['HIGH_REASONING', 'MEDIUM_REASONING', 'LOW_COST_EXECUTION', 'DETERMINISTIC_TRANSFORM'];

// task_type -> class mapping (skeleton; extend per specialist in later gates)
const TASK_TYPE_CLASS = {
  METHOD_ADJUDICATION: 'HIGH_REASONING',
  STRATEGIC_SYNTHESIS: 'HIGH_REASONING',
  CONFLICT_RESOLUTION: 'HIGH_REASONING',
  OFFER_ARCHITECTURE: 'HIGH_REASONING',
  FUNNEL_ARCHITECTURE: 'HIGH_REASONING',
  SPECIALIST_EXECUTION: 'MEDIUM_REASONING',
  INTENT_ANALYSIS: 'DETERMINISTIC_TRANSFORM',   // ASTRA-02 does this locally
  TASK_DECOMPOSITION: 'DETERMINISTIC_TRANSFORM',
  QUERY_PLANNING: 'DETERMINISTIC_TRANSFORM',
  FORMATTING: 'LOW_COST_EXECUTION',
  EXTRACTION: 'LOW_COST_EXECUTION',
  TAGGING: 'LOW_COST_EXECUTION',
  SUMMARIZATION: 'LOW_COST_EXECUTION',
  VARIANT_GENERATION: 'LOW_COST_EXECUTION',
  CLASSIFICATION: 'LOW_COST_EXECUTION',
  STRUCTURAL_TRANSFORM: 'DETERMINISTIC_TRANSFORM',
};

const CLASS_DEFAULTS = {
  HIGH_REASONING: { model_role: 'orchestrator_reasoner', minimum_required_capability: 'strong multi-constraint reasoning + structured JSON', reasoning_level: 'high', context_budget: SYNTHESIS_WORKING_CHARS, fallback_role: 'medium_reasoner', cost_priority: 'QUALITY_FIRST' },
  MEDIUM_REASONING: { model_role: 'medium_reasoner', minimum_required_capability: 'solid reasoning + structured output', reasoning_level: 'medium', context_budget: MAX_EVIDENCE_PER_STEP, fallback_role: 'low_cost_executor', cost_priority: 'BALANCED' },
  LOW_COST_EXECUTION: { model_role: 'low_cost_executor', minimum_required_capability: 'reliable instruction-following', reasoning_level: 'low', context_budget: METHOD_METADATA_CHARS, fallback_role: 'low_cost_executor', cost_priority: 'COST_FIRST' },
  DETERMINISTIC_TRANSFORM: { model_role: 'none_code_only', minimum_required_capability: 'n/a (no LLM)', reasoning_level: 'none', context_budget: 0, fallback_role: 'none_code_only', cost_priority: 'COST_FIRST' },
};

function route(taskType, opts = {}) {
  const task_class = opts.task_class || TASK_TYPE_CLASS[taskType] || 'MEDIUM_REASONING';
  const base = CLASS_DEFAULTS[task_class];
  return Object.assign({ task_type: taskType, task_class, uses_llm: task_class !== 'DETERMINISTIC_TRANSFORM' }, base, opts.overrides || {});
}

// plan a route per workflow step (specialist execution tier by default)
function planWorkflow(workflow) {
  return workflow.steps.map(s => ({ step_id: s.step_id, name: s.name, ...route('SPECIALIST_EXECUTION') }));
}

module.exports = { route, planWorkflow, TASK_CLASSES, TASK_TYPE_CLASS, CLASS_DEFAULTS };
