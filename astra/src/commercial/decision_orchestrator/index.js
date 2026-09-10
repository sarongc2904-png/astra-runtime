'use strict';
// [ASTRA-11M] Commercial Decision Orchestrator — public surface.
// DESIGN + DETERMINISTIC OFFLINE IMPLEMENTATION + ISOLATED OFFLINE BENCHMARKING. No LLM.
// ASTRA-11M recommends a ranked decision set; it executes nothing: no campaign / budget /
// deploy / integration / production write. Every output carries triggers_action=false.
// No ASTRA-11M output may feed production routing or autonomous action.
module.exports = {
  contracts: require('./contracts'),
  context: require('./context'),
  opportunities: require('./opportunities'),
  applicability: require('./applicability'),
  memoryReconcile: require('./memory_reconcile'),
  constraints: require('./constraints'),
  urgency: require('./urgency'),
  impact: require('./impact'),
  timeToSignal: require('./time_to_signal'),
  reversibility: require('./reversibility'),
  risk: require('./risk'),
  dependencies: require('./dependencies'),
  candidates: require('./candidates'),
  priority: require('./priority'),
  conflicts: require('./conflicts'),
  policy: require('./policy'),
  selection: require('./selection'),
  rationale: require('./rationale'),
  boundary: require('./boundary'),
  integrity: require('./integrity'),
  report: require('./report'),
  engine: require('./engine'),
  DECISION_SCHEMA_VERSION: require('./contracts').DECISION_SCHEMA_VERSION,
  UCDM_SCHEMA_VERSION: require('../schema/entities').SCHEMA_VERSION,
  FUNNEL_REVENUE_SCHEMA_VERSION: require('../funnel_revenue/funnel_model').FUNNEL_REVENUE_SCHEMA_VERSION,
  EXPERIMENT_SCHEMA_VERSION: require('../experiment_intelligence/opportunity').EXPERIMENT_SCHEMA_VERSION,
  BUSINESS_MEMORY_SCHEMA_VERSION: require('../business_memory/types').BUSINESS_MEMORY_SCHEMA_VERSION,
};
