'use strict';
// [ASTRA-11M] Commercial Decision Orchestrator — deterministic pipeline.
//   Validated ASTRA-11J evidence + ASTRA-11K experiments + ASTRA-11L memory + constraints
//   -> DecisionContext -> OpportunityNormalization -> Applicability -> MemoryReconciliation
//   -> Constraints -> Risk/Urgency/Impact/TimeToSignal/Reversibility -> DependencyGraph
//   -> DecisionCandidates -> Priority -> Conflicts -> Policy -> Selection -> Rationale
//   -> DecisionBoundary -> CommercialDecisionReport.
// Fully deterministic. NO LLM, NO web, NO I/O (beyond integrity self-scan), NO clock, NO
// execution. Every output carries triggers_action=false.
const CTX = require('./context');
const OPP = require('./opportunities');
const APP = require('./applicability');
const MR = require('./memory_reconcile');
const CON = require('./constraints');
const URG = require('./urgency');
const IMP = require('./impact');
const TTS = require('./time_to_signal');
const REV = require('./reversibility');
const RSK = require('./risk');
const DEP = require('./dependencies');
const CAND = require('./candidates');
const PRI = require('./priority');
const CFL = require('./conflicts');
const POL = require('./policy');
const SEL = require('./selection');
const RAT = require('./rationale');
const BND = require('./boundary');
const IG = require('./integrity');
const REP = require('./report');

// runDecisionOrchestrator({ businessId, decisionTimestamp, scope, currentFunnelState,
//   currentRevenueState, constraints, priorities, opportunities, experiments, memories,
//   activeConflicts, staleMemories, invalidatedMemories, availableResources, cashUrgency,
//   decisionHorizon, riskTolerance, operationalCapacity, repeatJustifications, referenceTime })
function runDecisionOrchestrator(opts) {
  opts = opts || {};
  const referenceTime = opts.referenceTime || opts.decisionTimestamp;
  if (!referenceTime) throw new Error('[ASTRA-11M] referenceTime (or decisionTimestamp) is required (no implicit clock)');
  if (!opts.businessId) throw new Error('[ASTRA-11M] businessId is required');

  // ---- DECISION CONTEXT (§1) ----
  const context = CTX.makeDecisionContext({
    business_id: opts.businessId,
    decision_timestamp: opts.decisionTimestamp || referenceTime,
    scope: opts.scope,
    current_funnel_state: opts.currentFunnelState,
    current_revenue_state: opts.currentRevenueState,
    current_constraints: opts.constraints,
    current_priorities: opts.priorities,
    candidate_opportunities: opts.opportunities,
    candidate_experiments: opts.experiments,
    applicable_memories: opts.memories,
    active_conflicts: opts.activeConflicts,
    stale_memories: opts.staleMemories,
    invalidated_memories: opts.invalidatedMemories,
    available_resources: opts.availableResources,
    cash_urgency: opts.cashUrgency,
    decision_horizon: opts.decisionHorizon,
    risk_tolerance: opts.riskTolerance,
    operational_capacity: opts.operationalCapacity,
  });
  { const v = CTX.validateDecisionContext(context); if (!v.valid) throw new Error(`[ASTRA-11M] invalid DecisionContext: ${v.errors.join(' | ')}`); }

  // ---- URGENCY (§6) — context-level ----
  const urgency = URG.assessUrgency(context);
  { const v = URG.validateUrgency(urgency); if (!v.valid) throw new Error(`[ASTRA-11M] invalid UrgencyAssessment: ${v.errors.join(' | ')}`); }

  // ---- OPPORTUNITY NORMALIZATION (§2) ----
  const opportunities = (opts.opportunities || []).map(OPP.normalizeOpportunity);
  for (const o of opportunities) { const v = OPP.validateOpportunity(o); if (!v.valid && o.status === 'OPPORTUNITY_NORMALIZED') throw new Error(`[ASTRA-11M] invalid OpportunityNormalized: ${v.errors.join(' | ')}`); }
  const oppById = Object.fromEntries(opportunities.map(o => [o.opportunity_id, o]));

  const memories = opts.memories || [];
  const applicabilities = [], reconciliations = [], constraintEvals = [], impacts = [],
    timeToSignals = [], reversibilities = [], risks = [], candidates = [];

  for (const opp of opportunities) {
    // ---- APPLICABILITY (§3) ----
    const applicability = APP.assessApplicability(opp, context);
    { const v = APP.validateApplicability(applicability); if (!v.valid) throw new Error(`[ASTRA-11M] invalid ApplicabilityAssessment: ${v.errors.join(' | ')}`); }
    applicabilities.push(applicability);

    // ---- MEMORY RECONCILIATION (§4) ----
    const reconcile = MR.reconcile(opp, memories, { repeatJustifications: opts.repeatJustifications || {} });
    { const v = MR.validateReconciliation(reconcile); if (!v.valid) throw new Error(`[ASTRA-11M] invalid MemoryReconciliation: ${v.errors.join(' | ')}`); }
    reconciliations.push(reconcile);

    // ---- CONSTRAINTS (§5) ----
    const constraints = CON.evaluateConstraints(opp, context);
    { const v = CON.validateConstraintEvaluation(constraints); if (!v.valid) throw new Error(`[ASTRA-11M] invalid ConstraintEvaluation: ${v.errors.join(' | ')}`); }
    constraintEvals.push(constraints);

    // ---- IMPACT (§7) ----
    const impact = IMP.assessImpact(opp, context);
    { const v = IMP.validateImpact(impact); if (!v.valid) throw new Error(`[ASTRA-11M] invalid ImpactAssessment: ${v.errors.join(' | ')}`); }
    impacts.push(impact);

    // experiment lookup for time-to-signal
    const exp = (opts.experiments || []).find(e => (e && (e.experiment_id || e.id)) === opp.experiment_ref) || null;

    // ---- REVERSIBILITY (§9) ---- (needs an action guess; use opportunity hint / default)
    const provisionalAction = CAND.deriveActionType({ opp, applicability, reconcile, constraints, urgency, impact: impact, timeToSignal: { signal_class: 'UNKNOWN' }, reversibility: { reversibility: 'UNKNOWN' }, risk: { overall: 'RISK_UNKNOWN' }, ctx: context });
    const reversibility = REV.classifyReversibility({ opportunity: opp, action_type: provisionalAction });
    { const v = REV.validateReversibility(reversibility); if (!v.valid) throw new Error(`[ASTRA-11M] invalid ReversibilityAssessment: ${v.errors.join(' | ')}`); }
    reversibilities.push(reversibility);

    // ---- TIME TO SIGNAL (§8) ----
    const timeToSignal = TTS.classifyTimeToSignal({ opportunity: opp, experiment: exp, action_type: provisionalAction });
    { const v = TTS.validateTimeToSignal(timeToSignal); if (!v.valid) throw new Error(`[ASTRA-11M] invalid TimeToSignalAssessment: ${v.errors.join(' | ')}`); }
    timeToSignals.push(timeToSignal);

    // ---- RISK (§10) ----
    const risk = RSK.assessRisk({ opportunity: opp, applicability, constraints, reversibility, ctx: context });
    { const v = RSK.validateRisk(risk); if (!v.valid) throw new Error(`[ASTRA-11M] invalid RiskAssessment: ${v.errors.join(' | ')}`); }
    risks.push(risk);

    // ---- DECISION CANDIDATE (§12) ----
    const candidate = CAND.buildDecisionCandidate({ opp, applicability, reconcile, constraints, urgency, impact, timeToSignal, reversibility, risk, ctx: context });
    { const v = CAND.validateDecisionCandidate(candidate); if (!v.valid) throw new Error(`[ASTRA-11M] invalid DecisionCandidate: ${v.errors.join(' | ')}`); }
    candidates.push(candidate);
  }

  // ---- DEPENDENCY GRAPH (§11) ----
  const dependencyGraph = DEP.buildDependencyGraph(candidates, context, oppById);
  { const v = DEP.validateDependencyGraph(dependencyGraph); if (!v.valid) throw new Error(`[ASTRA-11M] invalid DependencyGraph: ${v.errors.join(' | ')}`); }

  // ---- PRIORITY (§13) ----
  const priority = PRI.prioritize(candidates, dependencyGraph);
  { const v = PRI.validatePriority(priority); if (!v.valid) throw new Error(`[ASTRA-11M] invalid PriorityRanking: ${v.errors.join(' | ')}`); }

  // ---- DECISION CONFLICTS (§14) ----
  const conflicts = CFL.detectDecisionConflicts(candidates, context);
  for (const c of conflicts) { const v = CFL.validateConflict(c); if (!v.valid) throw new Error(`[ASTRA-11M] invalid DecisionConflict: ${v.errors.join(' | ')}`); }

  // ---- POLICY (§15) ----
  const policies = candidates.map(c => POL.applyDecisionPolicy(c, context));
  for (const p of policies) { const v = POL.validatePolicy(p); if (!v.valid) throw new Error(`[ASTRA-11M] invalid PolicyEvaluation: ${v.errors.join(' | ')}`); }
  const policyById = Object.fromEntries(policies.map(p => [p.decision_id, p]));

  // ---- SELECTION + ALTERNATIVES (§16) ----
  const selection = SEL.selectDecision({ candidates, priority, policyById, conflicts });
  { const v = SEL.validateSelection(selection); if (!v.valid) throw new Error(`[ASTRA-11M] invalid DecisionSelection: ${v.errors.join(' | ')}`); }

  // ---- RATIONALE (§17) ----
  const candidatesById = Object.fromEntries(candidates.map(c => [c.decision_id, c]));
  const reconcileById = {};
  candidates.forEach((c, i) => { reconcileById[c.decision_id] = reconciliations[i]; });
  const rationale = RAT.buildRationale({ selection, candidatesById, priority, policyById, reconcileById, conflicts, ctx: context });
  { const v = RAT.validateRationale(rationale); if (!v.valid) throw new Error(`[ASTRA-11M] invalid DecisionRationale: ${v.errors.join(' | ')}`); }

  // ---- BOUNDARY (§18) + INTEGRITY ----
  const boundary = BND.decisionBoundary();
  { const v = BND.validateBoundary(boundary); if (!v.valid) throw new Error(`[ASTRA-11M] invalid DecisionBoundary: ${v.errors.join(' | ')}`); }
  const integrity = IG.attestIntegrity();

  // ---- REPORT (§19) ----
  const report = REP.buildReport({
    referenceTime, context, opportunities, applicabilities, reconciliations, constraintEvals,
    urgency, impacts, timeToSignals, reversibilities, risks, dependencyGraph, candidates,
    priority, conflicts, policies, selection, rationale, integrity, boundary,
  });

  return {
    report, context, urgency, opportunities, applicabilities, reconciliations, constraintEvals,
    impacts, timeToSignals, reversibilities, risks, dependencyGraph, candidates, priority,
    conflicts, policies, selection, rationale, boundary, integrity,
    primaryDecision: selection.primary_decision,
    triggers_action: false,
    provenance_note: 'ASTRA-11M deterministic offline decision orchestrator. No decision without evidence. Active memory is never silently overridden. Hypotheses influence only as hypotheses. Priority is ordinal; unorderable pairs are PRIORITY_UNRESOLVED, never forced. No fabricated percentages / confidence / expected revenue / runway. Every output carries triggers_action=false. ASTRA-11M executes nothing, modifies no campaign, spends no budget, deploys nothing, connects no external integration. No production routing. No ASTRA-11N.',
  };
}

module.exports = { runDecisionOrchestrator };
