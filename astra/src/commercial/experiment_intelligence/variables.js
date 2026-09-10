'use strict';
// [ASTRA-11K §3] Variable classification. Detects MULTI_VARIABLE_CONTAMINATION when >=2
// relevant variables change without sufficient isolation -> CAUSAL_ATTRIBUTION_NOT_IDENTIFIABLE.
// No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const CONTAMINATION_STATUS = Object.freeze(['ISOLATED', 'MULTI_VARIABLE_CONTAMINATION', 'UNKNOWN']);

// buildVariableMap({ independent_variables[], dependent_variable, controlled_variables[],
//                     confounders[], external_factors[], isolation_note })
function buildVariableMap(x) {
  const independent = [...new Set((x.independent_variables || (x.independent_variable ? [x.independent_variable] : [])).map(String))].sort();
  const controlled = [...new Set((x.controlled_variables || []).map(String))].sort();
  const confounders = [...new Set((x.confounders || []).map(String))].sort();
  const external = [...new Set((x.external_factors || []).map(String))].sort();
  const dependent = x.dependent_variable ? String(x.dependent_variable) : null;

  // a "relevant changed variable" is an independent variable OR a confounder the caller
  // marked as *also changing* during the window.
  const alsoChanging = [...new Set((x.also_changing || []).map(String))].sort();
  const relevantChanged = [...new Set([...independent, ...alsoChanging])];

  let contamination_status;
  if (relevantChanged.length >= 2 && !x.isolation_confirmed) contamination_status = 'MULTI_VARIABLE_CONTAMINATION';
  else if (relevantChanged.length === 0) contamination_status = 'UNKNOWN';
  else contamination_status = 'ISOLATED';

  const causal_attribution = contamination_status === 'MULTI_VARIABLE_CONTAMINATION'
    ? 'CAUSAL_ATTRIBUTION_NOT_IDENTIFIABLE'
    : contamination_status === 'ISOLATED' ? 'IDENTIFIABLE_SUBJECT_TO_DESIGN' : 'UNKNOWN';

  const body = {
    schema_version: 'ucdm-experiment-1.0.0', kind: 'VariableMap',
    independent_variables: independent,
    dependent_variable: dependent,
    controlled_variables: controlled,
    confounders,
    external_factors: external,
    also_changing: alsoChanging,
    relevant_changed_variables: relevantChanged.sort(),
    isolation_confirmed: !!x.isolation_confirmed,
    isolation_note: x.isolation_note ? String(x.isolation_note) : null,
    contamination_status,
    causal_attribution,
    note: contamination_status === 'MULTI_VARIABLE_CONTAMINATION'
      ? 'two or more relevant variables changed without confirmed isolation — causal attribution is NOT identifiable'
      : 'single isolated independent variable',
    generated_by: 'deterministic:ucdm/experiment',
  };
  body.variable_map_id = 'exvm_' + sha256Hex(canonicalize({ ...body, variable_map_id: undefined }));
  return deepFreeze(body);
}

function validateVariableMap(m) {
  const errors = [];
  if (!CONTAMINATION_STATUS.includes(m.contamination_status)) errors.push(`bad contamination_status "${m.contamination_status}"`);
  if (m.relevant_changed_variables.length >= 2 && !m.isolation_confirmed && m.contamination_status !== 'MULTI_VARIABLE_CONTAMINATION') errors.push('multiple changed variables without isolation must be MULTI_VARIABLE_CONTAMINATION');
  if (m.contamination_status === 'MULTI_VARIABLE_CONTAMINATION' && m.causal_attribution !== 'CAUSAL_ATTRIBUTION_NOT_IDENTIFIABLE') errors.push('contamination must yield CAUSAL_ATTRIBUTION_NOT_IDENTIFIABLE');
  return { valid: errors.length === 0, errors };
}

module.exports = { CONTAMINATION_STATUS, buildVariableMap, validateVariableMap };
