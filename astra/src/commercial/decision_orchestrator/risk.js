'use strict';
// [ASTRA-11M §10] Risk evaluation across 8 dimensions. Qualitative unless explicit quantitative
// inputs are supplied. Deterministic. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const C = require('./contracts');

function assessRisk({ opportunity, applicability, constraints, reversibility, ctx }) {
  const dims = {};
  for (const d of C.RISK_DIMENSIONS) dims[d] = 'RISK_UNKNOWN';
  const notes = [];

  const set = (d, lvl, why) => {
    if (C.ordinalIndex(C.RISK_LEVELS, lvl) < C.ordinalIndex(C.RISK_LEVELS, dims[d]) || dims[d] === 'RISK_UNKNOWN') { dims[d] = lvl; notes.push(`${d}: ${why}`); }
  };

  // explicit per-dimension inputs first
  const given = (opportunity && opportunity.risk && typeof opportunity.risk === 'object') ? opportunity.risk : {};
  for (const d of C.RISK_DIMENSIONS) if (C.RISK_LEVELS.includes(given[d])) { dims[d] = given[d]; notes.push(`${d}: explicit input`); }
  if (typeof opportunity.risk === 'string' && C.RISK_LEVELS.includes(opportunity.risk)) set('implementation', opportunity.risk, 'opportunity risk (overall)');

  // derived
  const rev = ctx && ctx.current_revenue_state || {};
  if (constraints && constraints.critical_types.includes('cash')) set('financial', 'RISK_HIGH', 'critical cash constraint');
  if (constraints && constraints.critical_types.includes('budget')) set('financial', 'RISK_HIGH', 'budget shortfall');
  if (constraints && constraints.critical_types.includes('team_capacity')) set('operational', 'RISK_HIGH', 'capacity saturated');
  if (constraints && constraints.critical_types.includes('measurement_readiness')) set('measurement', 'RISK_HIGH', 'tracking not valid');
  if (applicability && applicability.conditions.some(c => /DEPENDENCY/.test(c))) set('dependency', 'RISK_MEDIUM', 'dependency unverified');
  if (applicability && applicability.blockers.some(c => /DEPENDENCY/.test(c))) set('dependency', 'RISK_HIGH', 'dependency unmet');
  if (reversibility && (reversibility.reversibility === 'HARD_TO_REVERSE')) set('reversibility', 'RISK_HIGH', 'hard to reverse');
  else if (reversibility && reversibility.reversibility === 'PARTIALLY_REVERSIBLE') set('reversibility', 'RISK_MEDIUM', 'partially reversible');
  if (opportunity.evidence_strength === 'EVIDENCE_WEAK') set('implementation', 'RISK_MEDIUM', 'weak evidence');
  if (opportunity.hypothesis_only) set('implementation', 'RISK_MEDIUM', 'hypothesis-only opportunity');

  // irreversible + weak evidence => elevate reversibility risk explicitly
  if ((reversibility && reversibility.reversibility === 'HARD_TO_REVERSE') && (opportunity.evidence_strength === 'EVIDENCE_WEAK' || opportunity.evidence_strength === 'EVIDENCE_NONE')) {
    set('reversibility', 'RISK_HIGH', 'hard-to-reverse action on weak evidence');
    set('financial', 'RISK_HIGH', 'hard-to-reverse action on weak evidence');
  }

  const levels = Object.values(dims);
  const overall = levels.includes('RISK_HIGH') ? 'RISK_HIGH'
    : levels.includes('RISK_MEDIUM') ? 'RISK_MEDIUM'
    : levels.every(l => l === 'RISK_UNKNOWN') ? 'RISK_UNKNOWN' : 'RISK_LOW';

  const body = {
    schema_version: C.DECISION_SCHEMA_VERSION, kind: 'RiskAssessment',
    opportunity_id: opportunity.opportunity_id,
    dimensions: dims, overall, quantitative: false, notes: notes.sort(),
    generated_by: 'deterministic:ucdm/decision_orchestrator/risk',
  };
  body.assessment_id = 'drk_' + sha256Hex(canonicalize({ ...body, assessment_id: undefined })).slice(0, 40);
  return deepFreeze(body);
}

function validateRisk(r) {
  const errors = [];
  if (!C.RISK_LEVELS.includes(r.overall)) errors.push(`bad overall risk "${r.overall}"`);
  for (const d of C.RISK_DIMENSIONS) if (!C.RISK_LEVELS.includes(r.dimensions[d])) errors.push(`bad risk for ${d}`);
  if (r.quantitative !== false) errors.push('risk stays qualitative unless explicit quantitative inputs');
  return { valid: errors.length === 0, errors };
}

module.exports = { assessRisk, validateRisk };
