'use strict';
// [ASTRA-11M §9] Reversibility classification. An irreversible or costly-to-reverse decision
// gets explicit risk treatment downstream. Deterministic. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const C = require('./contracts');

// analytical actions are inherently reversible; the driver is the underlying opportunity
const BY_ACTION = Object.freeze({
  INVESTIGATE: 'EASILY_REVERSIBLE', MEASURE: 'EASILY_REVERSIBLE', HOLD: 'EASILY_REVERSIBLE',
  REPRIORITIZE: 'EASILY_REVERSIBLE', DO_NOT_SCALE: 'EASILY_REVERSIBLE', VALIDATE: 'EASILY_REVERSIBLE',
  TEST: 'REVERSIBLE', ITERATE: 'REVERSIBLE', FIX_PROCESS: 'PARTIALLY_REVERSIBLE', STOP: 'PARTIALLY_REVERSIBLE',
});

function classifyReversibility({ opportunity, action_type }) {
  const reasons = [];
  let cls = 'UNKNOWN';

  if (opportunity && C.REVERSIBILITY.includes(opportunity.reversibility) && opportunity.reversibility !== 'UNKNOWN') {
    cls = opportunity.reversibility; reasons.push('from normalized opportunity');
  } else if (action_type && BY_ACTION[action_type]) {
    cls = BY_ACTION[action_type]; reasons.push(`ordinal default for ${action_type}`);
  }

  // an opportunity flagged structurally irreversible dominates
  if (opportunity && opportunity.impact_basis && typeof opportunity.impact_basis === 'object' && opportunity.impact_basis.structural_change === true) {
    cls = 'HARD_TO_REVERSE'; reasons.push('opportunity entails a structural change');
  }

  const needsRiskTreatment = cls === 'HARD_TO_REVERSE' || cls === 'PARTIALLY_REVERSIBLE';
  const body = {
    schema_version: C.DECISION_SCHEMA_VERSION, kind: 'ReversibilityAssessment',
    opportunity_id: opportunity ? opportunity.opportunity_id : null,
    reversibility: cls, requires_explicit_risk_treatment: needsRiskTreatment, reasons: reasons.sort(),
    generated_by: 'deterministic:ucdm/decision_orchestrator/reversibility',
  };
  body.assessment_id = 'drv_' + sha256Hex(canonicalize({ ...body, assessment_id: undefined })).slice(0, 40);
  return deepFreeze(body);
}

function validateReversibility(r) {
  const errors = [];
  if (!C.REVERSIBILITY.includes(r.reversibility)) errors.push(`bad reversibility "${r.reversibility}"`);
  return { valid: errors.length === 0, errors };
}

module.exports = { BY_ACTION, classifyReversibility, validateReversibility };
