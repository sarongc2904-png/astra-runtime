'use strict';
// [ASTRA-11K §7] Experiment design. Each design type declares EXPLICITLY what kind of
// conclusion it permits. A causal claim is possible ONLY for a controlled design AND only if
// scope / allocation / contamination / measurement are all valid. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const DESIGN_TYPES = Object.freeze([
  'CONTROL_VS_TREATMENT', 'BEFORE_AFTER_DESCRIPTIVE', 'SEQUENTIAL_TEST', 'HOLDOUT',
  'COHORT_COMPARISON', 'OPERATIONAL_PROCESS_TEST',
]);

const PERMITS = Object.freeze({
  CONTROL_VS_TREATMENT: { descriptive: true, causal_possible: true, note: 'causal evaluation possible ONLY if scope, allocation, contamination and measurement are all valid' },
  HOLDOUT: { descriptive: true, causal_possible: true, note: 'a holdout is a controlled comparison — causal evaluation possible under the same conditions as CONTROL_VS_TREATMENT' },
  BEFORE_AFTER_DESCRIPTIVE: { descriptive: true, causal_possible: false, note: 'descriptive comparison permitted; a causal claim is NOT permitted by default' },
  SEQUENTIAL_TEST: { descriptive: true, causal_possible: false, note: 'sequential/time-based; confounded by time — descriptive only unless an isolated control exists' },
  COHORT_COMPARISON: { descriptive: true, causal_possible: false, note: 'different cohorts differ in more than the treatment — descriptive comparison only' },
  OPERATIONAL_PROCESS_TEST: { descriptive: true, causal_possible: false, note: 'process/operational change — descriptive; causal claim needs an isolated control' },
});

// buildDesign({ design_type, allocation, treatment, control, unit_of_assignment, contamination_status, measurement_valid })
function buildDesign(x) {
  const type = DESIGN_TYPES.includes(String(x.design_type).toUpperCase()) ? String(x.design_type).toUpperCase() : null;
  const permits = type ? PERMITS[type] : { descriptive: false, causal_possible: false, note: 'unrecognised design type' };

  const allocation = x.allocation ? String(x.allocation).toUpperCase() : 'UNKNOWN'; // RANDOM / DETERMINISTIC_SPLIT / TIME_BASED / SELF_SELECTED / UNKNOWN
  const unit = x.unit_of_assignment ? String(x.unit_of_assignment) : null;
  const controlled = ['CONTROL_VS_TREATMENT', 'HOLDOUT'].includes(type);
  const allocationOk = allocation === 'RANDOM' || allocation === 'DETERMINISTIC_SPLIT';
  const contaminationOk = !x.contamination_status || x.contamination_status === 'ISOLATED';
  const measurementOk = x.measurement_valid !== false;
  const populationOk = x.treatment_population_comparable !== false;

  const causalReasons = [];
  if (!controlled) causalReasons.push('DESIGN_NOT_CONTROLLED');
  if (controlled && !allocationOk) causalReasons.push('ALLOCATION_NOT_RANDOM_OR_DETERMINISTIC');
  if (!contaminationOk) causalReasons.push('MULTI_VARIABLE_CONTAMINATION');
  if (!measurementOk) causalReasons.push('MEASUREMENT_INVALID');
  if (!populationOk) causalReasons.push('POPULATIONS_NOT_COMPARABLE');
  if (x.control_contaminated === true) causalReasons.push('CONTROL_CONTAMINATED');
  if (x.treatment_leakage === true) causalReasons.push('TREATMENT_LEAKAGE');

  const conclusion_permitted = {
    descriptive_comparison: permits.descriptive,
    causal_evaluation: controlled && causalReasons.length === 0,
  };

  const body = {
    schema_version: 'ucdm-experiment-1.0.0', kind: 'ExperimentDesign',
    design_type: type || 'UNKNOWN',
    is_controlled: controlled,
    allocation, unit_of_assignment: unit,
    treatment_summary: x.treatment ? String(x.treatment) : null,
    control_summary: x.control ? String(x.control) : null,
    permits_by_type: permits,
    conclusion_permitted,
    causal_blockers: [...new Set(causalReasons)].sort(),
    note: permits.note,
    generated_by: 'deterministic:ucdm/experiment',
  };
  body.design_id = 'exds_' + sha256Hex(canonicalize({ ...body, design_id: undefined }));
  return deepFreeze(body);
}

function validateDesign(d) {
  const errors = [];
  if (!DESIGN_TYPES.includes(d.design_type)) errors.push(`bad design_type "${d.design_type}"`);
  if (!d.is_controlled && d.conclusion_permitted.causal_evaluation) errors.push('a non-controlled design must not permit causal evaluation');
  if (d.conclusion_permitted.causal_evaluation && d.causal_blockers.length > 0) errors.push('causal evaluation cannot be permitted with causal blockers present');
  return { valid: errors.length === 0, errors };
}

module.exports = { DESIGN_TYPES, PERMITS, buildDesign, validateDesign };
