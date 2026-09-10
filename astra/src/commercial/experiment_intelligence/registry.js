'use strict';
// [ASTRA-11K §12] Experiment registry contract. Structured record of an experiment and its
// lifecycle status. Detects duplicate experiment ids. NO execution — this is a record only.
// No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const REGISTRY_STATUS = Object.freeze([
  'DRAFT', 'READY', 'RUNNING', 'INSUFFICIENT_DATA', 'COMPLETED', 'STOPPED', 'INVALIDATED', 'INCONCLUSIVE',
]);

// makeRegistryEntry({ business_id, opportunity, hypothesis, metricContract, design, baseline,
//   guardrailEval, evaluation, decision, statistics, causal, variableMap, timestamps })
function makeRegistryEntry(x) {
  const t = x.timestamps || {};
  const supplied_id = x.experiment_id ? String(x.experiment_id) : null;

  // lifecycle status is derived deterministically from what exists
  let status;
  if (!x.metricContract || x.metricContract.status !== 'METRIC_CONTRACT_VALID' || !x.hypothesis || x.hypothesis.status !== 'WELL_FORMED') status = 'DRAFT';
  else if (!x.design || !x.baseline) status = 'DRAFT';
  else if (!x.evaluation || x.evaluation.status === 'OUTCOME_INCOMPLETE') status = t.started_at ? 'RUNNING' : 'READY';
  else if (x.evaluation.status === 'EVIDENCE_INSUFFICIENT') status = 'INSUFFICIENT_DATA';
  else if (x.decision && x.decision.decision === 'INCONCLUSIVE') status = 'INCONCLUSIVE';
  else if (x.variableMap && x.variableMap.contamination_status === 'MULTI_VARIABLE_CONTAMINATION' && x.decision && x.decision.decision !== 'ADOPT') status = 'INVALIDATED';
  else if (x.decision) status = 'COMPLETED';
  else status = 'READY';
  if (x.force_status && REGISTRY_STATUS.includes(String(x.force_status).toUpperCase())) status = String(x.force_status).toUpperCase();

  const body = {
    schema_version: 'ucdm-experiment-1.0.0', kind: 'ExperimentRegistryEntry',
    business_id: x.business_id == null ? null : String(x.business_id),
    opportunity_id: x.opportunity ? x.opportunity.opportunity_id : null,
    hypothesis_id: x.hypothesis ? x.hypothesis.hypothesis_id : null,
    variable_map_id: x.variableMap ? x.variableMap.variable_map_id : null,
    created_at: t.created_at || null,
    started_at: t.started_at || null,
    completed_at: t.completed_at || null,
    status,
    baseline: x.baseline ? { status: x.baseline.status, value: x.baseline.baseline_value } : null,
    treatment: x.design ? x.design.treatment_summary : null,
    primary_metric: x.metricContract ? x.metricContract.primary_metric : null,
    secondary_metrics: x.metricContract ? x.metricContract.secondary_metrics : [],
    guardrails: x.metricContract ? x.metricContract.guardrail_metrics : [],
    result: x.evaluation ? { status: x.evaluation.status, primary_movement: x.evaluation.primary_movement, guardrail_breach: x.evaluation.guardrail_breach } : null,
    decision: x.decision ? x.decision.decision : null,
    evidence_status: x.evaluation ? x.evaluation.status : 'NONE',
    causal_status: x.causal ? x.causal.policy : 'UNKNOWN',
    statistical_status: x.statistics ? x.statistics.status : 'STATISTICAL_TEST_NOT_AVAILABLE',
    supplied_experiment_id: supplied_id,
    generated_by: 'deterministic:ucdm/experiment',
  };
  // the canonical experiment_id is content-addressed; a supplied id is kept only as a label
  body.experiment_id = 'exp_' + sha256Hex(canonicalize({ ...body, experiment_id: undefined, supplied_experiment_id: undefined }));
  return deepFreeze(body);
}

// detectDuplicateIds(entries, suppliedIds[]) -> { duplicates: [...] }
function detectDuplicateIds(entries = [], suppliedIds = []) {
  const seenCanonical = {}; const dupCanonical = [];
  for (const e of entries) { seenCanonical[e.experiment_id] = (seenCanonical[e.experiment_id] || 0) + 1; if (seenCanonical[e.experiment_id] === 2) dupCanonical.push(e.experiment_id); }
  const seenSupplied = {}; const dupSupplied = [];
  for (const id of suppliedIds.filter(Boolean)) { const s = String(id); seenSupplied[s] = (seenSupplied[s] || 0) + 1; if (seenSupplied[s] === 2) dupSupplied.push(s); }
  return deepFreeze({ canonical_duplicates: dupCanonical.sort(), supplied_id_duplicates: dupSupplied.sort(), has_duplicates: dupCanonical.length > 0 || dupSupplied.length > 0 });
}

function validateRegistryEntry(e) {
  const errors = [];
  if (!REGISTRY_STATUS.includes(e.status)) errors.push(`bad registry status "${e.status}"`);
  if (e.decision === 'ADOPT' && e.status !== 'COMPLETED') errors.push('an ADOPT decision requires a COMPLETED experiment');
  return { valid: errors.length === 0, errors };
}

module.exports = { REGISTRY_STATUS, makeRegistryEntry, detectDuplicateIds, validateRegistryEntry };
