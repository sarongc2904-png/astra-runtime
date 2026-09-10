'use strict';
// [ASTRA-11K §11] Risk model. Qualitative risk is NEVER converted into a false probability.
// 7 dimensions, each rated LOW / MEDIUM / HIGH / UNKNOWN from explicit inputs. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const RISK_DIMENSIONS = Object.freeze([
  'financial_risk', 'operational_risk', 'customer_experience_risk', 'measurement_risk',
  'reversibility', 'contamination_risk', 'dependency_risk',
]);
const RISK_LEVELS = Object.freeze(['LOW', 'MEDIUM', 'HIGH', 'UNKNOWN']);

// assessRisk({ inputs: { <dimension>: 'LOW'|'MEDIUM'|'HIGH' }, variableMap, design, opportunity })
function assessRisk({ inputs = {}, variableMap = null, design = null, opportunity = null }) {
  const ratings = {};
  for (const d of RISK_DIMENSIONS) {
    const supplied = inputs[d] ? String(inputs[d]).toUpperCase() : null;
    ratings[d] = RISK_LEVELS.includes(supplied) ? supplied : 'UNKNOWN';
  }
  // deterministic derivations where an input is missing but a signal exists
  if (ratings.contamination_risk === 'UNKNOWN' && variableMap) {
    ratings.contamination_risk = variableMap.contamination_status === 'MULTI_VARIABLE_CONTAMINATION' ? 'HIGH' : variableMap.contamination_status === 'ISOLATED' ? 'LOW' : 'UNKNOWN';
  }
  if (ratings.reversibility === 'UNKNOWN' && design) {
    ratings.reversibility = design.design_type === 'OPERATIONAL_PROCESS_TEST' ? 'MEDIUM' : ['CONTROL_VS_TREATMENT', 'HOLDOUT'].includes(design.design_type) ? 'LOW' : 'UNKNOWN';
  }
  if (ratings.measurement_risk === 'UNKNOWN' && design && design.conclusion_permitted && !design.conclusion_permitted.descriptive_comparison) ratings.measurement_risk = 'HIGH';

  const highs = RISK_DIMENSIONS.filter(d => ratings[d] === 'HIGH');
  const unknowns = RISK_DIMENSIONS.filter(d => ratings[d] === 'UNKNOWN');
  const overall = highs.length >= 2 ? 'HIGH' : highs.length === 1 ? 'MEDIUM_HIGH' : RISK_DIMENSIONS.some(d => ratings[d] === 'MEDIUM') ? 'MEDIUM' : unknowns.length > 3 ? 'UNKNOWN' : 'LOW';

  const body = {
    schema_version: 'ucdm-experiment-1.0.0', kind: 'RiskAssessment',
    dimension_ratings: ratings,
    high_risk_dimensions: highs.sort(),
    unknown_dimensions: unknowns.sort(),
    overall_qualitative_risk: overall,
    probability_estimated: false,
    numeric_risk_score: null,
    note: 'qualitative risk only — no probability or numeric risk score is produced',
    generated_by: 'deterministic:ucdm/experiment',
  };
  body.risk_id = 'exrk_' + sha256Hex(canonicalize({ ...body, risk_id: undefined }));
  return deepFreeze(body);
}

function validateRisk(r) {
  const errors = [];
  for (const d of RISK_DIMENSIONS) if (!RISK_LEVELS.includes(r.dimension_ratings[d])) errors.push(`bad rating for ${d}`);
  if (r.probability_estimated !== false || r.numeric_risk_score !== null) errors.push('risk must remain qualitative — no probability, no numeric score');
  return { valid: errors.length === 0, errors };
}

module.exports = { RISK_DIMENSIONS, RISK_LEVELS, assessRisk, validateRisk };
