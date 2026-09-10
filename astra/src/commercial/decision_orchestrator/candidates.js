'use strict';
// [ASTRA-11M §12] DecisionCandidate assembly. Combines every evaluation for one opportunity
// into a single analytical candidate with an analytical action_type. NOTHING is executed:
// triggers_action is always false. Deterministic. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze, nfcLF } = require('../validation/canonical');
const C = require('./contracts');

// deterministic analytical action_type from the assembled evaluations
function deriveActionType(ev) {
  const { opp, applicability, reconcile, constraints, urgency, impact, timeToSignal, reversibility, risk, ctx } = ev;
  const fs = ctx.current_funnel_state || {};
  const rev = ctx.current_revenue_state || {};
  const weakEvidence = opp.evidence_strength === 'EVIDENCE_WEAK' || opp.evidence_strength === 'EVIDENCE_NONE' || opp.hypothesis_only;
  const acquisitionish = /scal|acqui|traffic|ads|leads|volume|spend/.test(String(opp.affected_metric || '') + String(opp.affected_funnel_transition || '')) || opp.action_hint === 'SCALE';

  // 1. hard blocks
  if (constraints.status === 'BLOCKED_BY_CONSTRAINT') return 'HOLD';
  if (applicability.status === 'BLOCKED') return 'HOLD';

  // 2. measurement first
  if (constraints.critical_types.includes('measurement_readiness') ||
      (fs.tracking_status && String(fs.tracking_status).toUpperCase() !== 'VALID')) return 'MEASURE';

  // 3. evidence insufficient
  if (opp.evidence_strength === 'EVIDENCE_NONE') return 'INVESTIGATE';

  // 4. memory says this failed / was invalidated
  if (reconcile.status === 'REPEAT_DECISION_REQUIRES_JUSTIFICATION') return 'VALIDATE';
  if (reconcile.status === 'DECISION_MEMORY_CONFLICT') return 'INVESTIGATE';
  if (reconcile.status === 'MEMORY_NOT_GENERALIZABLE') return 'VALIDATE';

  // 5. downstream bottleneck blocks acquisition scaling
  if (acquisitionish && fs.downstream_bottleneck) return 'DO_NOT_SCALE';
  // 6. negative margin — growth cannot outrank economics fix
  if (acquisitionish && (rev.margin_state === 'NEGATIVE' || (rev.margin != null && Number(rev.margin) < 0))) return 'REPRIORITIZE';
  // 7. saturated capacity blocks acquisition expansion
  if (acquisitionish && ((ctx.operational_capacity || {}).state === 'SATURATED' || (ctx.operational_capacity || {}).sales_state === 'SATURATED')) return 'DO_NOT_SCALE';

  // 8. hard-to-reverse + weak evidence => validate first
  if ((reversibility.reversibility === 'HARD_TO_REVERSE' || reversibility.reversibility === 'PARTIALLY_REVERSIBLE') && weakEvidence) return 'VALIDATE';

  // 9. process problem
  if (opp.affected_funnel_transition && /response|process|follow.?up|show.?rate|attendance|booking|onboarding|activation/i.test(opp.affected_funnel_transition + ' ' + (opp.affected_metric || ''))) {
    return weakEvidence ? 'INVESTIGATE' : 'FIX_PROCESS';
  }

  // 10. explicit proposed action honoured if analytical
  if (C.isActionType(opp.proposed_action)) return opp.proposed_action;

  // 11. otherwise: test when reasonably supported, iterate when moderate
  if (!weakEvidence && (applicability.status === 'APPLICABLE' || applicability.status === 'CONDITIONALLY_APPLICABLE')) return 'TEST';
  return 'INVESTIGATE';
}

function buildDecisionCandidate(ev) {
  const { opp, applicability, reconcile, constraints, urgency, impact, timeToSignal, reversibility, risk, ctx } = ev;
  const malformed = opp.status === 'OPPORTUNITY_MALFORMED';

  const action_type = malformed ? null : deriveActionType(ev);

  const evidenceInsufficient = opp.evidence_strength === 'EVIDENCE_NONE' || opp.evidence_refs.length === 0;
  let status;
  if (malformed) status = 'CANDIDATE_MALFORMED';
  else if (evidenceInsufficient) status = 'CANDIDATE_REJECTED';
  else if (constraints.status === 'BLOCKED_BY_CONSTRAINT' || applicability.status === 'BLOCKED' || applicability.status === 'NOT_APPLICABLE') status = 'CANDIDATE_BLOCKED';
  else if (reconcile.status === 'DECISION_MEMORY_CONFLICT') status = 'CANDIDATE_BLOCKED';
  else if (reconcile.status === 'REPEAT_DECISION_REQUIRES_JUSTIFICATION' && !reconcile.repeat_justified) status = 'CANDIDATE_DEFERRED';
  else if (applicability.status === 'CONDITIONALLY_APPLICABLE') status = 'CANDIDATE_DEFERRED';
  else status = 'CANDIDATE_READY';

  const reject_code = malformed ? 'CANDIDATE_MALFORMED'
    : evidenceInsufficient ? 'DECISION_EVIDENCE_INSUFFICIENT'
    : reconcile.status === 'DECISION_MEMORY_CONFLICT' ? 'DECISION_MEMORY_CONFLICT'
    : constraints.status === 'BLOCKED_BY_CONSTRAINT' ? 'BLOCKED_BY_CONSTRAINT'
    : null;

  const body = {
    schema_version: C.DECISION_SCHEMA_VERSION, kind: 'DecisionCandidate',
    business_id: ctx.business_id,
    action_type,
    triggers_action: false,
    target: {
      metric: opp.affected_metric, funnel_transition: opp.affected_funnel_transition,
      scope: opp.scope,
    },
    scope: opp.scope,
    evidence_refs: opp.evidence_refs.slice(),
    evidence_strength: opp.evidence_strength,
    memory_refs: [...new Set([...reconcile.aligned_memories, ...reconcile.conflicting_memories, ...reconcile.failed_approach_memories])].sort(),
    opportunity_refs: [opp.opportunity_id, opp.source_opportunity_id].filter(Boolean),
    experiment_refs: opp.experiment_ref ? [opp.experiment_ref] : [],
    expected_impact: impact.level,
    impact_monetary_basis: impact.monetary_basis,
    urgency: urgency.level,
    risk: risk.overall,
    risk_dimensions: risk.dimensions,
    time_to_signal: timeToSignal.signal_class,
    reversibility: reversibility.reversibility,
    resource_requirement: opp.resource_requirements,
    dependencies: opp.dependencies.slice(),
    constraints: constraints.critical_types.slice(),
    applicability_status: applicability.status,
    memory_status: reconcile.status,
    status, reject_code,
    rationale_seed: {
      why_this: `${action_type || 'n/a'} on ${opp.affected_metric || opp.affected_funnel_transition || 'unspecified target'}`,
      evidence_strength: opp.evidence_strength,
      memory: reconcile.status, applicability: applicability.status, constraint: constraints.status,
    },
    generated_by: 'deterministic:ucdm/decision_orchestrator/candidates',
  };
  body.decision_id = 'dec_' + sha256Hex(canonicalize({
    business_id: body.business_id, action_type: body.action_type, target: body.target,
    scope: body.scope, evidence_refs: body.evidence_refs.slice().sort(), opportunity_refs: body.opportunity_refs.slice().sort(),
  })).slice(0, 48);
  return deepFreeze(body);
}

function validateDecisionCandidate(d) {
  const errors = [];
  if (!C.CANDIDATE_STATUS.includes(d.status)) errors.push(`bad candidate status "${d.status}"`);
  if (d.triggers_action !== false) errors.push('triggers_action must be false');
  if (d.status !== 'CANDIDATE_MALFORMED' && !C.isActionType(d.action_type)) errors.push(`non-analytical action_type "${d.action_type}"`);
  if (!d.decision_id.startsWith('dec_')) errors.push('bad decision_id prefix');
  return { valid: errors.length === 0, errors };
}

module.exports = { deriveActionType, buildDecisionCandidate, validateDecisionCandidate };
