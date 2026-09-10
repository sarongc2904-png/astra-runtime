'use strict';
// [ASTRA-11K §5/§15] MeasurementContract — how the primary metric will be read: definition,
// denominator, scope, window, unit of analysis, and what would invalidate the read. No LLM,
// no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const MEASUREMENT_STATUS = Object.freeze(['MEASUREMENT_CONTRACT_VALID', 'MEASUREMENT_CONTRACT_INCOMPLETE', 'MEASUREMENT_DENOMINATOR_INVALID']);

// buildMeasurementContract({ metricContract, design, opportunityScope, denominator_definition,
//                            observation_window, unit_of_analysis, invalidation_conditions[] })
function buildMeasurementContract(x) {
  const mc = x.metricContract || {};
  const denomDef = x.denominator_definition ? String(x.denominator_definition) : null;
  const window = x.observation_window || null;
  const unit = x.unit_of_analysis ? String(x.unit_of_analysis) : null;

  const missing = [];
  if (!mc.primary_metric) missing.push('primary_metric');
  if (!denomDef && /rate|ratio|per_/.test(String(mc.primary_metric || ''))) missing.push('denominator_definition');
  if (!window) missing.push('observation_window');
  if (!unit) missing.push('unit_of_analysis');

  const denomInvalid = x.denominator_state && x.denominator_state !== 'VALID';
  let status;
  if (denomInvalid) status = 'MEASUREMENT_DENOMINATOR_INVALID';
  else if (missing.length) status = 'MEASUREMENT_CONTRACT_INCOMPLETE';
  else status = 'MEASUREMENT_CONTRACT_VALID';

  const body = {
    schema_version: 'ucdm-experiment-1.0.0', kind: 'MeasurementContract',
    primary_metric: mc.primary_metric || null,
    primary_metric_definition: mc.primary_metric_definition || null,
    denominator_definition: denomDef,
    denominator_state: x.denominator_state || 'UNKNOWN',
    observation_window: window,
    unit_of_analysis: unit,
    scope: x.opportunityScope || null,
    guardrail_metrics: mc.guardrail_metrics || [],
    invalidation_conditions: [...new Set((x.invalidation_conditions || [
      'TREATMENT_LEAKAGE', 'CONTROL_CONTAMINATION', 'SCOPE_CHANGE_MID_EXPERIMENT',
      'DENOMINATOR_DEFINITION_CHANGE', 'EARLY_STOPPING_WITHOUT_RULE',
    ]).map(String))].sort(),
    missing_fields: missing.sort(),
    status,
    note: status === 'MEASUREMENT_CONTRACT_VALID' ? 'the primary metric read is fully specified' : status === 'MEASUREMENT_DENOMINATOR_INVALID' ? 'the primary-metric denominator is invalid — no valid read possible' : 'the measurement contract is incomplete',
    generated_by: 'deterministic:ucdm/experiment',
  };
  body.measurement_contract_id = 'exms_' + sha256Hex(canonicalize({ ...body, measurement_contract_id: undefined }));
  return deepFreeze(body);
}

function validateMeasurementContract(m) {
  const errors = [];
  if (!MEASUREMENT_STATUS.includes(m.status)) errors.push(`bad measurement status "${m.status}"`);
  if (m.status === 'MEASUREMENT_CONTRACT_VALID' && m.missing_fields.length > 0) errors.push('a VALID measurement contract has no missing fields');
  if (m.status === 'MEASUREMENT_CONTRACT_VALID' && m.denominator_state && !['VALID', 'UNKNOWN', 'NOT_APPLICABLE'].includes(m.denominator_state)) errors.push('a VALID measurement contract cannot have an invalid denominator');
  return { valid: errors.length === 0, errors };
}

module.exports = { MEASUREMENT_STATUS, buildMeasurementContract, validateMeasurementContract };
