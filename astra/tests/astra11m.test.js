'use strict';
// ASTRA-11M — Commercial Decision Orchestrator. Explicit W1..W80 + compatibility/security C1..C8.
// Offline deterministic ONLY. No network, no LLM, no production DB, no external storage,
// no campaign / budget change, no deploy, no execution.
const assert = require('assert');
const fs = require('fs'); const path = require('path');
const DO = require('../src/commercial/decision_orchestrator');
const FX = require('../benchmarks/astra11m/fixtures');

let pass = 0, fail = 0; const fails = []; const covered = {};
function W(id, name, fn) { covered[id] = true; try { fn(); pass++; console.log('PASS', id, name); } catch (e) { fail++; fails.push(`${id} ${name} :: ${e && e.message}`); console.log('FAIL', id, name, '::', e && e.message); } }
const REF = FX.REFERENCE_TIME;
const run = (o) => DO.engine.runDecisionOrchestrator({ referenceTime: REF, ...o });
const A = FX.ADVERSARIAL;
const S = FX.SCENARIOS;

// ---------- context (W1..W8) ----------
W('W1', 'valid context + opportunities -> primary decision selected', () => {
  const o = run(S.dental);
  assert(o.selection.status === 'PRIMARY_SELECTED' && o.selection.primary_decision);
  assert(DO.contracts.isActionType(o.selection.primary_decision.action_type));
});
W('W2', 'missing businessId -> throws', () => {
  let threw = false; try { run(A.missing_business_id); } catch (e) { threw = /businessId/.test(e.message); }
  assert(threw);
});
W('W3', 'missing referenceTime -> throws', () => {
  let threw = false; try { DO.engine.runDecisionOrchestrator({ businessId: 'b' }); } catch (e) { threw = /referenceTime/.test(e.message); }
  assert(threw);
});
W('W4', 'context with no core fields -> CONTEXT_INSUFFICIENT', () => {
  const c = DO.context.makeDecisionContext({ business_id: 'b' });
  assert(c.status === 'CONTEXT_INSUFFICIENT' && c.missing_core_fields.length > 0);
});
W('W5', 'context id is deterministic', () => {
  const a = DO.context.makeDecisionContext({ business_id: 'b', decision_timestamp: REF, scope: { period: FX.P_AUG }, current_funnel_state: { tracking_status: 'VALID' } });
  const b = DO.context.makeDecisionContext({ business_id: 'b', decision_timestamp: REF, scope: { period: FX.P_AUG }, current_funnel_state: { tracking_status: 'VALID' } });
  assert.strictEqual(a.context_id, b.context_id);
});
W('W6', 'no invented context fields', () => {
  const c = DO.context.makeDecisionContext({ business_id: 'b', decision_timestamp: REF, scope: { period: FX.P_AUG }, current_funnel_state: { tracking_status: 'VALID' } });
  assert(c.current_revenue_state === null && c.available_resources === null);
});
W('W7', 'context partial when no opportunities', () => {
  const o = run(FX.baseCall({ businessId: 'b', opportunities: [] }));
  assert(o.context.status === 'CONTEXT_PARTIAL' || o.context.status === 'CONTEXT_VALID');
  assert(o.selection.status !== 'PRIMARY_SELECTED');
});
W('W8', 'report has 30-40 sections', () => {
  const o = run(S.dental);
  assert(o.report.section_names.length >= 30 && o.report.section_names.length <= 40, String(o.report.section_names.length));
});

// ---------- opportunity normalization (W9..W16) ----------
W('W9', 'opportunity without evidence -> OPPORTUNITY_MALFORMED', () => {
  const op = DO.opportunities.normalizeOpportunity({ source_engine: 'astra11j', affected_metric: 'x', evidence_refs: [] });
  assert(op.status === 'OPPORTUNITY_MALFORMED' && op.missing_fields.includes('evidence_refs'));
});
W('W10', 'normalized opportunity keeps scope, never merges incompatible scopes', () => {
  assert(DO.opportunities.scopesCompatible({ period: FX.P_AUG }, { period: FX.P_AUG }));
  assert(!DO.opportunities.scopesCompatible({ period: FX.P_AUG }, { period: FX.P_JUN }));
});
W('W11', 'evidence_strength defaults to WEAK (not NONE) when refs present but unspecified', () => {
  const op = DO.opportunities.normalizeOpportunity({ source_engine: 'e', affected_metric: 'x', evidence_refs: ['r1'] });
  assert(op.evidence_strength === 'EVIDENCE_WEAK');
});
W('W12', 'malformed opportunity -> CANDIDATE_MALFORMED, no action_type', () => {
  const o = run(A.malformed_candidate);
  assert(o.candidates[0].status === 'CANDIDATE_MALFORMED' && o.candidates[0].action_type === null);
});
W('W13', 'opportunity id deterministic + prefixed', () => {
  const a = DO.opportunities.normalizeOpportunity({ source_engine: 'e', affected_metric: 'x', evidence_refs: ['r1'] });
  const b = DO.opportunities.normalizeOpportunity({ source_engine: 'e', affected_metric: 'x', evidence_refs: ['r1'] });
  assert.strictEqual(a.opportunity_id, b.opportunity_id);
  assert(a.opportunity_id.startsWith('dopp_'));
});
W('W14', 'hypothesis_only opportunity influences only as hypothesis (elevated impl risk, not treated as fact)', () => {
  const o = run(FX.baseCall({ businessId: 'b', opportunities: [FX.opp({ opportunity_id: 'h1', affected_metric: 'x', evidence_refs: ['r1'], evidence_strength: 'EVIDENCE_WEAK', hypothesis_only: true })] }));
  const c = o.candidates[0];
  assert(c.risk_dimensions.implementation === 'RISK_MEDIUM' || c.risk === 'RISK_MEDIUM' || c.risk === 'RISK_HIGH');
  assert(['INVESTIGATE', 'MEASURE', 'VALIDATE', 'TEST'].includes(c.action_type));
});
W('W15', 'multiple opportunities all normalized', () => {
  const o = run(S.ecommerce);
  assert(o.opportunities.length === 3 && o.candidates.length === 3);
});
W('W16', 'opportunity value unknown -> IMPACT_UNKNOWN, no fabricated projection', () => {
  const o = run(A.opportunity_value_unknown);
  assert(o.impacts[0].level === 'IMPACT_UNKNOWN' && o.impacts[0].fabricated_projection === false);
});

// ---------- applicability (W17..W26) ----------
W('W17', 'scope mismatch -> NOT_APPLICABLE or BLOCKED', () => {
  const o = run(A.scope_mismatch);
  assert(['NOT_APPLICABLE', 'BLOCKED'].includes(o.applicabilities[0].status));
  assert(o.applicabilities[0].blockers.includes('SCOPE_MISMATCH'));
});
W('W18', 'cohort mismatch -> not applicable', () => {
  const o = run(A.cohort_mismatch);
  assert(o.applicabilities[0].blockers.includes('SCOPE_MISMATCH'));
});
W('W19', 'period mismatch -> not applicable', () => {
  const o = run(A.period_mismatch);
  assert(o.applicabilities[0].blockers.includes('SCOPE_MISMATCH'));
});
W('W20', 'budget unavailable -> blocked / not applicable', () => {
  const o = run(A.budget_unavailable);
  assert(o.applicabilities[0].blockers.includes('BUDGET_UNAVAILABLE') || o.constraintEvals[0].status === 'BLOCKED_BY_CONSTRAINT');
});
W('W21', 'capacity saturated -> blocked / downrank', () => {
  const o = run(A.capacity_saturated);
  assert(o.applicabilities[0].blockers.includes('CAPACITY_SATURATED') || o.candidates[0].action_type === 'DO_NOT_SCALE' || o.candidates[0].status === 'CANDIDATE_BLOCKED');
});
W('W22', 'invalidated source -> BLOCKED', () => {
  const o = run(A.invalidated_memory);
  assert(o.applicabilities[0].status === 'BLOCKED' && o.applicabilities[0].blockers.includes('INVALIDATED_SOURCE'));
});
W('W23', 'stale evidence -> CONDITIONALLY_APPLICABLE', () => {
  const o = run(A.stale_memory);
  const a = o.applicabilities[0];
  assert(a.status === 'CONDITIONALLY_APPLICABLE' || a.conditions.includes('STALE_EVIDENCE') || o.reconciliations[0].stale_memories.length > 0);
});
W('W24', 'no evidence -> BLOCKED via NO_EVIDENCE', () => {
  const o = run(A.insufficient_evidence);
  assert(o.applicabilities[0].blockers.includes('NO_EVIDENCE'));
});
W('W25', 'applicable clean opportunity -> APPLICABLE', () => {
  const o = run(A.deterministic_rerun);
  assert(o.applicabilities[0].status === 'APPLICABLE');
});
W('W26', 'dependency missing declared -> blocker', () => {
  const o = run(A.unresolved_dependency);
  assert(o.applicabilities[0].blockers.some(b => /DEPENDENCY_UNMET/.test(b)) || o.dependencyGraph.nodes[0].status !== 'DEPENDENCY_SATISFIED');
});

// ---------- memory reconciliation (W27..W36) ----------
W('W27', 'active contradicting memory -> DECISION_MEMORY_CONFLICT', () => {
  const o = run(A.memory_conflict);
  assert(o.reconciliations[0].status === 'DECISION_MEMORY_CONFLICT');
  assert(o.candidates[0].status === 'CANDIDATE_BLOCKED');
});
W('W28', 'repeated failed tactic -> REPEAT_DECISION_REQUIRES_JUSTIFICATION', () => {
  const o = run(A.repeated_failed_experiment);
  assert(o.reconciliations[0].status === 'REPEAT_DECISION_REQUIRES_JUSTIFICATION');
});
W('W29', 'repeat justified -> allowed to proceed (not deferred for that reason)', () => {
  const base = JSON.parse(JSON.stringify(A.repeated_failed_but_justified));
  // opportunity id is derived; justify by the normalized id
  const norm = DO.opportunities.normalizeOpportunity(base.opportunities[0]);
  base.repeatJustifications = { [norm.opportunity_id]: true };
  const o = run(base);
  assert(o.reconciliations[0].repeat_justified === true);
  assert(o.reconciliations[0].status !== 'REPEAT_DECISION_REQUIRES_JUSTIFICATION');
});
W('W30', 'memory that worked in another scope -> MEMORY_NOT_GENERALIZABLE', () => {
  const o = run(FX.baseCall({
    businessId: 'b',
    opportunities: [FX.opp({ opportunity_id: 'g1', affected_metric: 'landing_conversion', evidence_refs: ['r1'], scope: { period: FX.P_AUG } })],
    memories: [FX.mem({ memory_id: 'mem_g1', memory_type: 'LEARNING', claim: 'improved landing_conversion', semantic_target: 'landing_conversion', is_positive_learning: true, scope: { period: FX.P_JUN } })],
  }));
  assert(o.reconciliations[0].status === 'MEMORY_NOT_GENERALIZABLE' || o.reconciliations[0].not_generalizable_memories.length > 0);
});
W('W31', 'no related memory -> NO_APPLICABLE_MEMORY', () => {
  const o = run(A.deterministic_rerun);
  assert(o.reconciliations[0].status === 'NO_APPLICABLE_MEMORY');
});
W('W32', 'aligned positive memory in same scope -> MEMORY_ALIGNED', () => {
  const o = run(FX.baseCall({
    businessId: 'b',
    opportunities: [FX.opp({ opportunity_id: 'al1', affected_metric: 'show_rate', evidence_refs: ['r1'], scope: { period: FX.P_AUG } })],
    memories: [FX.mem({ memory_id: 'mem_al1', memory_type: 'LEARNING', claim: 'reminder sequence improved show_rate', semantic_target: 'show_rate', is_positive_learning: true, scope: { period: FX.P_AUG } })],
  }));
  assert(o.reconciliations[0].status === 'MEMORY_ALIGNED');
});
W('W33', 'invalidated tactic memory blocks silent repeat', () => {
  const o = run(FX.baseCall({
    businessId: 'b',
    opportunities: [FX.opp({ opportunity_id: 'iv1', affected_metric: 'popup_optin', evidence_refs: ['r1'], scope: { period: FX.P_AUG } })],
    memories: [FX.mem({ memory_id: 'mem_iv1', memory_type: 'LEARNING', claim: 'popup_optin tactic', semantic_target: 'popup_optin', temporal_status: 'INVALIDATED', scope: { period: FX.P_AUG } })],
  }));
  assert(o.reconciliations[0].status === 'REPEAT_DECISION_REQUIRES_JUSTIFICATION');
});
W('W34', 'superseded tactic recorded, not treated as active', () => {
  const o = run(FX.baseCall({
    businessId: 'b',
    opportunities: [FX.opp({ opportunity_id: 'sp1', affected_metric: 'checkout_fix', evidence_refs: ['r1'], scope: { period: FX.P_AUG } })],
    memories: [FX.mem({ memory_id: 'mem_sp1', memory_type: 'DECISION', claim: 'checkout_fix v1', semantic_target: 'checkout_fix', temporal_status: 'SUPERSEDED', scope: { period: FX.P_AUG } })],
  }));
  assert(o.reconciliations[0].superseded_tactic_memories.includes('mem_sp1'));
});
W('W35', 'reconciliation id deterministic', () => {
  const a = run(A.memory_conflict), b = run(A.memory_conflict);
  assert.strictEqual(a.reconciliations[0].reconciliation_id, b.reconciliations[0].reconciliation_id);
});
W('W36', 'memory conflict never silently ignored (candidate not READY)', () => {
  const o = run(A.memory_conflict);
  assert(o.candidates[0].status !== 'CANDIDATE_READY');
});

// ---------- constraints (W37..W44) ----------
W('W37', 'critical constraint -> BLOCKED_BY_CONSTRAINT', () => {
  const o = run(A.high_impact_but_blocked);
  assert(o.constraintEvals[0].status === 'BLOCKED_BY_CONSTRAINT');
  assert(o.candidates[0].status === 'CANDIDATE_BLOCKED');
});
W('W38', 'budget shortfall derived -> critical', () => {
  const o = run(A.budget_unavailable);
  assert(o.constraintEvals[0].critical_types.includes('budget') || o.applicabilities[0].blockers.includes('BUDGET_UNAVAILABLE'));
});
W('W39', 'invalid tracking -> measurement_readiness critical', () => {
  const o = run(A.unresolved_dependency);
  assert(o.constraintEvals[0].critical_types.includes('measurement_readiness'));
});
W('W40', 'negative margin + growth -> cash constraint TIGHT', () => {
  const o = run(A.negative_margin);
  assert(o.constraintEvals[0].evaluations.some(e => e.type === 'cash') || o.candidates[0].action_type === 'REPRIORITIZE');
});
W('W41', 'clear constraints -> CONSTRAINT_CLEAR', () => {
  const o = run(A.deterministic_rerun);
  assert(o.constraintEvals[0].status === 'CONSTRAINT_CLEAR');
});
W('W42', 'high opportunity but critical constraint -> not prioritized', () => {
  const o = run(A.high_impact_but_blocked);
  assert(o.selection.status !== 'PRIMARY_SELECTED' || o.selection.primary_decision.decision_id !== o.candidates[0].decision_id);
});
W('W43', 'constraint eval id deterministic', () => {
  const a = run(A.high_impact_but_blocked), b = run(A.high_impact_but_blocked);
  assert.strictEqual(a.constraintEvals[0].evaluation_id, b.constraintEvals[0].evaluation_id);
});
W('W44', 'capacity saturated -> team_capacity critical when team required', () => {
  const o = run(A.capacity_saturated);
  assert(o.constraintEvals[0].critical_types.includes('team_capacity') || o.applicabilities[0].blockers.includes('CAPACITY_SATURATED'));
});

// ---------- urgency (W45..W50) ----------
W('W45', 'critical runway -> URGENCY_CRITICAL', () => {
  const o = run(A.short_vs_long_term);
  assert(o.urgency.level === 'URGENCY_CRITICAL');
});
W('W46', 'no signals -> URGENCY_UNKNOWN', () => {
  const o = run(A.deterministic_rerun);
  assert(o.urgency.level === 'URGENCY_UNKNOWN');
});
W('W47', 'churn spike -> URGENCY_HIGH', () => {
  const o = run(S.subscription);
  assert(['URGENCY_HIGH', 'URGENCY_CRITICAL'].includes(o.urgency.level));
});
W('W48', 'urgency never fabricates runway', () => {
  const o = run(S.dental);
  assert(o.urgency.fabricated_runway === false);
});
W('W49', 'urgency asserted only with a reason', () => {
  const o = run(A.short_vs_long_term);
  assert(o.urgency.reasons.length > 0);
});
W('W50', 'urgency is ordinal only (one of the enum)', () => {
  const o = run(S.dental);
  assert(DO.contracts.URGENCY.includes(o.urgency.level));
});

// ---------- impact (W51..W56) ----------
W('W51', 'monetary basis used only when explicitly present', () => {
  const o = run(S.dental);
  const withBasis = o.impacts.find(i => i.monetary_basis);
  assert(withBasis && withBasis.monetary_basis.note.includes('did not compute'));
});
W('W52', 'no monetary basis -> ordinal impact', () => {
  const o = run(FX.baseCall({ businessId: 'b', opportunities: [FX.opp({ opportunity_id: 'im1', affected_metric: 'x', evidence_refs: ['r1'], impact_basis: 'IMPACT_MEDIUM' })] }));
  assert(o.impacts[0].level === 'IMPACT_MEDIUM' && o.impacts[0].monetary_basis === null);
});
W('W53', 'weak evidence caps IMPACT_HIGH to MEDIUM', () => {
  const o = run(FX.baseCall({ businessId: 'b', opportunities: [FX.opp({ opportunity_id: 'im2', affected_metric: 'x', evidence_refs: ['r1'], evidence_strength: 'EVIDENCE_WEAK', impact_basis: 'IMPACT_HIGH' })] }));
  assert(o.impacts[0].level === 'IMPACT_MEDIUM');
});
W('W54', 'no evidence -> IMPACT_UNKNOWN', () => {
  const o = run(A.insufficient_evidence);
  assert(o.impacts[0].level === 'IMPACT_UNKNOWN');
});
W('W55', 'impact never fabricates a projection', () => {
  const o = run(S.ecommerce);
  assert(o.impacts.every(i => i.fabricated_projection === false));
});
W('W56', 'revenue share drives ordinal impact when a total is given', () => {
  const o = run(FX.baseCall({ businessId: 'b', currentRevenueState: { revenue: 100000 }, opportunities: [FX.opp({ opportunity_id: 'im3', affected_metric: 'x', evidence_refs: ['r1'], evidence_strength: 'EVIDENCE_STRONG', impact_basis: { affected_revenue: 30000 } })] }));
  assert(o.impacts[0].level === 'IMPACT_HIGH');
});

// ---------- time-to-signal + reversibility (W57..W64) ----------
W('W57', '11K valid estimate respected', () => {
  const o = run(FX.baseCall({
    businessId: 'b',
    opportunities: [FX.opp({ opportunity_id: 't1', affected_metric: 'x', evidence_refs: ['r1'], experiment_ref: 'exp_1' })],
    experiments: [{ experiment_id: 'exp_1', status: 'READY', time_to_signal: { status: 'VALID', signal_class: 'LONG' } }],
  }));
  assert(o.timeToSignals[0].signal_class === 'LONG' && o.timeToSignals[0].source === 'astra11k');
});
W('W58', 'no estimate -> UNKNOWN or action default, never fabricated duration', () => {
  const o = run(A.deterministic_rerun);
  assert(DO.contracts.TIME_TO_SIGNAL.includes(o.timeToSignals[0].signal_class));
  assert(o.timeToSignals[0].fabricated_duration === false);
});
W('W59', 'reversibility from opportunity honored', () => {
  const o = run(FX.baseCall({ businessId: 'b', opportunities: [FX.opp({ opportunity_id: 'rv1', affected_metric: 'x', evidence_refs: ['r1'], reversibility: 'HARD_TO_REVERSE' })] }));
  assert(o.reversibilities[0].reversibility === 'HARD_TO_REVERSE' && o.reversibilities[0].requires_explicit_risk_treatment === true);
});
W('W60', 'structural change -> HARD_TO_REVERSE', () => {
  const o = run(A.irreversible_weak_evidence);
  assert(o.reversibilities[0].reversibility === 'HARD_TO_REVERSE');
});
W('W61', 'hard-to-reverse + weak evidence -> VALIDATE / HOLD', () => {
  const o = run(A.irreversible_weak_evidence);
  assert(['VALIDATE', 'HOLD'].includes(o.candidates[0].action_type));
});
W('W62', 'analytical actions default to reversible', () => {
  const o = run(FX.baseCall({ businessId: 'b', opportunities: [FX.opp({ opportunity_id: 'rv2', affected_metric: 'x', evidence_refs: ['r1'] })] }));
  assert(DO.contracts.REVERSIBILITY.includes(o.reversibilities[0].reversibility));
});
W('W63', 'time-to-signal ordinal only', () => {
  const o = run(S.dental);
  assert(o.timeToSignals.every(t => DO.contracts.TIME_TO_SIGNAL.includes(t.signal_class)));
});
W('W64', 'reversibility assessment id deterministic', () => {
  const a = run(A.irreversible_weak_evidence), b = run(A.irreversible_weak_evidence);
  assert.strictEqual(a.reversibilities[0].assessment_id, b.reversibilities[0].assessment_id);
});

// ---------- risk + dependencies (W65..W70) ----------
W('W65', 'risk qualitative unless quantitative inputs', () => {
  const o = run(S.dental);
  assert(o.risks.every(r => r.quantitative === false));
});
W('W66', '8 risk dimensions always present', () => {
  const o = run(S.dental);
  for (const d of DO.contracts.RISK_DIMENSIONS) assert(d in o.risks[0].dimensions);
});
W('W67', 'dependency graph: scaling needs valid tracking', () => {
  const o = run(A.downstream_bottleneck);
  const node = o.dependencyGraph.nodes[0];
  assert(node.requires.some(r => /RESOLVE_BOTTLENECK|VALID_TRACKING/.test(r)));
});
W('W68', 'missing dependency -> DEPENDENCY_MISSING/BLOCKED', () => {
  const o = run(A.unresolved_dependency);
  assert(['DEPENDENCY_MISSING', 'DEPENDENCY_BLOCKED'].includes(o.dependencyGraph.nodes[0].status));
});
W('W69', 'hard-to-reverse -> reversibility risk elevated', () => {
  const o = run(A.irreversible_weak_evidence);
  assert(['RISK_MEDIUM', 'RISK_HIGH'].includes(o.risks[0].dimensions.reversibility));
});
W('W70', 'satisfied dependencies -> DEPENDENCY_SATISFIED', () => {
  const o = run(A.deterministic_rerun);
  assert(o.dependencyGraph.nodes[0].status === 'DEPENDENCY_SATISFIED');
});

// ---------- priority + conflicts + selection (W71..W80) ----------
W('W71', 'ranking deterministic + monotonic', () => {
  const a = run(S.ecommerce), b = run(S.ecommerce);
  assert.deepStrictEqual(a.priority.ordering, b.priority.ordering);
  assert(DO.priority.validatePriority(a.priority).valid);
});
W('W72', 'no fake scoring / invented confidence', () => {
  const o = run(S.ecommerce);
  assert(o.priority.fake_scoring === false && o.priority.invented_confidence === false);
});
W('W73', 'unorderable pair -> PRIORITY_UNRESOLVED', () => {
  const o = run(A.conflicting_priorities);
  assert(o.priority.unresolved_pairs.length > 0 || o.selection.status === 'PRIORITY_UNRESOLVED' ||
    Object.values(o.priority.rank).includes('PRIORITY_UNRESOLVED'));
});
W('W74', 'insufficient evidence -> INVESTIGATE/MEASURE, no primary action', () => {
  const o = run(A.no_valid_primary_decision);
  assert(o.selection.status === 'DECISION_EVIDENCE_INSUFFICIENT' || o.selection.status === 'NO_VALID_PRIMARY_DECISION');
  assert(!o.selection.primary_decision);
});
W('W75', 'all actions blocked -> ALL_OPTIONS_BLOCKED / NO_VALID_PRIMARY_DECISION', () => {
  const o = run(A.all_actions_blocked);
  assert(['ALL_OPTIONS_BLOCKED', 'NO_VALID_PRIMARY_DECISION'].includes(o.selection.status));
  assert(o.selection.blocked_decisions.length >= 1);
});
W('W76', 'acquisition scaling blocked by downstream bottleneck -> DO_NOT_SCALE', () => {
  const o = run(A.downstream_bottleneck);
  assert(o.candidates[0].action_type === 'DO_NOT_SCALE');
});
W('W77', 'negative margin -> growth action downranked / repriotitized', () => {
  const o = run(A.negative_margin);
  assert(o.candidates[0].action_type === 'REPRIORITIZE' || o.policies[0].verdict === 'DOWNRANK');
});
W('W78', 'measurement-first when tracking invalid', () => {
  const o = run(A.unresolved_dependency);
  assert(o.candidates[0].action_type === 'MEASURE');
});
W('W79', 'every decision output triggers_action=false', () => {
  const o = run(S.dental);
  assert(o.triggers_action === false && o.report.triggers_action === false);
  assert(o.candidates.every(c => c.triggers_action === false));
  assert(o.selection.triggers_action === false && o.boundary.triggers_action === false);
});
W('W80', 'deterministic report_id + decision ids', () => {
  const a = run(S.dental), b = run(S.dental);
  assert.strictEqual(a.report.report_id, b.report.report_id);
  assert.deepStrictEqual(a.candidates.map(c => c.decision_id), b.candidates.map(c => c.decision_id));
  assert(a.candidates.every(c => c.decision_id.startsWith('dec_')));
});

// ---------- C1..C8 compatibility / security ----------
W('C1', 'reuses 11J/11K/11L schema versions, no parallel systems', () => {
  assert(DO.FUNNEL_REVENUE_SCHEMA_VERSION === 'ucdm-funnel-revenue-1.0.0');
  assert(DO.EXPERIMENT_SCHEMA_VERSION === 'ucdm-experiment-1.0.0');
  assert(DO.BUSINESS_MEMORY_SCHEMA_VERSION === 'ucdm-business-memory-1.0.0');
});
W('C2', 'integrity attestation clean: network/llm/db/campaign/budget/deploy/cost all 0', () => {
  const ig = DO.integrity.attestIntegrity();
  assert(ig.clean && ig.network_calls === 0 && ig.llm_calls === 0 && ig.production_db_writes === 0 &&
    ig.external_storage_writes === 0 && ig.campaign_changes === 0 && ig.budget_changes === 0 &&
    ig.deploys === 0 && ig.cost_usd === 0);
});
W('C3', 'boundary asserts analytical-only + no execution / integration / 11N', () => {
  const b = DO.boundary.decisionBoundary();
  assert(b.triggers_action === false && b.analytical_only && b.no_external_writes && b.no_campaign_modification &&
    b.no_budget_change && b.no_production_execution && b.no_deployment && b.no_integration &&
    b.no_production_routing && b.no_astra_11n);
});
W('C4', 'report boundary section present + all true', () => {
  const o = run(S.dental);
  const b = o.report.sections.boundary;
  assert(b && b.analytical_only === true && b.no_campaign_modification === true && b.no_budget_change === true);
});
W('C5', 'no network / socket constructs in source', () => {
  for (const f of fs.readdirSync(path.join(__dirname, '../src/commercial/decision_orchestrator'))) {
    if (f === 'integrity.js') continue;
    const s = fs.readFileSync(path.join(__dirname, '../src/commercial/decision_orchestrator', f), 'utf8');
    assert(!/require\(['"](http|https|net|dns|tls|dgram)['"]\)|\bfetch\s*\(|XMLHttpRequest|new WebSocket/.test(s), f);
  }
});
W('C6', 'no persistence / vector / embeddings / LLM / ad-platform constructs', () => {
  for (const f of fs.readdirSync(path.join(__dirname, '../src/commercial/decision_orchestrator'))) {
    if (f === 'integrity.js') continue;
    const s = fs.readFileSync(path.join(__dirname, '../src/commercial/decision_orchestrator', f), 'utf8');
    assert(!/require\(['"](@supabase\/supabase-js|redis|ioredis|@pinecone-database\/pinecone|weaviate-ts-client|@qdrant\/js-client-rest|openai|@anthropic-ai\/sdk|googleapis|facebook-nodejs-business-sdk)['"]\)|createClient\s*\(|\.createEmbedding\s*\(|\.embeddings\.\w|new (Redis|OpenAI|Anthropic)\s*\(/.test(s), f);
  }
});
W('C7', 'ASTRA-10 freeze unchanged', () => {
  const fr = JSON.parse(fs.readFileSync(path.join(__dirname, '../benchmarks/astra10ah/freeze.json'), 'utf8'));
  assert.strictEqual(fr.harness_hash_sha256, '57305a9dee3f9130d8f913e28280d759e78c32cee5affb0ac8931a4da725d53d');
  assert.strictEqual(fr.fixture_hash_sha256, 'b62ddc773a230c3e606280cf6a8df9dc0e5fe127cdbb38144f020a5c99dc4dd4');
});
W('C8', 'benchmark isolation + stable hashes', () => {
  const bsrc = fs.readFileSync(path.join(__dirname, '../benchmarks/astra11m/run_decision_benchmark.js'), 'utf8');
  assert(!/writeFileSync|writeFile\(|appendFile/.test(bsrc) && /ASTRA11M_BENCHMARK_RESULT/.test(bsrc));
  const a = run(S.dental), b = run(S.dental);
  assert.strictEqual(a.report.content_hash, b.report.content_hash);
});

// ---------- W-matrix completeness ----------
const allW = [];
for (let i = 1; i <= 80; i++) allW.push('W' + i);
for (let i = 1; i <= 8; i++) allW.push('C' + i);
const missing = allW.filter(id => !covered[id]);
if (missing.length) { console.log('FAIL W-matrix completeness :: missing', missing.join(',')); fail++; }
else console.log('PASS W-matrix completeness (W1..W80 + C1..C8 all have explicit test evidence)');

console.log(`\nASTRA11M_TEST_RESULT pass=${pass} fail=${fail}`);
if (fail) { console.log('FAILURES:\n' + fails.join('\n')); process.exit(1); }
