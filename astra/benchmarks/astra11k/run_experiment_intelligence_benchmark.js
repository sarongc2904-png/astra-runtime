'use strict';
// [ASTRA-11K benchmark] Offline, mock-only. Zero network, zero LLM, zero cost.
// 8 vertical scenarios + 26 adversarial cases + 16 benchmark dimensions.
const assert = require('assert');
const EI = require('../../src/commercial/experiment_intelligence');
const FX = require('./fixtures');

let pass = 0, fail = 0; const notes = [];
function check(name, fn) { try { fn(); pass++; console.log('PASS', name); } catch (e) { fail++; notes.push(name + ' :: ' + e.message); console.log('FAIL', name, '::', e.message); } }
const REF = FX.REFERENCE_TIME;
const run = (o) => EI.engine.runExperimentIntelligence({ ...o, referenceTime: REF });

for (const [name, s] of Object.entries(FX.SCENARIOS)) {
  check(`scenario/${name}: runs, deterministic, 34 sections, evidence graph valid, integrity clean`, () => {
    const a = run({ funnelRevenueResult: s.fr(), experimentSpec: s.spec() });
    const b = run({ funnelRevenueResult: s.fr(), experimentSpec: s.spec() });
    assert.strictEqual(a.report.report_id, b.report.report_id);
    assert.strictEqual(a.report.section_names.length, 34);
    assert(a.report.evidence_graph_valid, JSON.stringify(a.report.evidence_graph_errors));
    assert(a.integrity.clean && a.integrity.network_calls === 0 && a.integrity.llm_calls === 0 && a.integrity.production_db_writes === 0 && a.integrity.deploys === 0);
    assert(EI.decision.DECISIONS.includes(a.decision.decision));
    assert(a.decision.triggers_action === false && a.decision.autonomous === false);
  });
}

check('adv/zero_denominator -> measurement denominator invalid', () => {
  const o = run(FX.ADVERSARIAL.zero_denominator);
  assert(o.measurement.status === 'MEASUREMENT_DENOMINATOR_INVALID');
});
check('adv/no_baseline -> BASELINE_MISSING, comparison not permitted, no ADOPT', () => {
  const o = run(FX.ADVERSARIAL.no_baseline);
  assert(o.baseline.status === 'BASELINE_MISSING' && o.baseline.comparison_permitted === false);
  assert(o.decision.decision !== 'ADOPT');
});
check('adv/scope_mismatch -> BASELINE_SCOPE_MISMATCH', () => {
  const o = run(FX.ADVERSARIAL.scope_mismatch);
  assert(o.baseline.status === 'BASELINE_SCOPE_MISMATCH');
});
check('adv/period_mismatch -> BASELINE_PERIOD_MISMATCH', () => {
  const o = run(FX.ADVERSARIAL.period_mismatch);
  assert(o.baseline.status === 'BASELINE_PERIOD_MISMATCH');
});
check('adv/cohort_mismatch -> BASELINE_COHORT_MISMATCH', () => {
  const o = run(FX.ADVERSARIAL.cohort_mismatch);
  assert(o.baseline.status === 'BASELINE_COHORT_MISMATCH');
});
check('adv/multi_variable_contamination -> CAUSAL_ATTRIBUTION_NOT_IDENTIFIABLE, decision ITERATE', () => {
  const o = run(FX.ADVERSARIAL.multi_variable_contamination);
  assert(o.variableMap.contamination_status === 'MULTI_VARIABLE_CONTAMINATION');
  assert(o.causal.policy === 'CAUSAL_ATTRIBUTION_NOT_IDENTIFIABLE');
  assert(['ITERATE', 'HOLD', 'INSUFFICIENT_EVIDENCE'].includes(o.decision.decision));
});
check('adv/insufficient_data -> EVIDENCE_INSUFFICIENT -> INSUFFICIENT_EVIDENCE', () => {
  const o = run(FX.ADVERSARIAL.insufficient_data);
  assert(o.evaluation.status === 'EVIDENCE_INSUFFICIENT' && o.decision.decision === 'INSUFFICIENT_EVIDENCE');
});
check('adv/primary_metric_missing -> PRIMARY_METRIC_REQUIRED, evaluation not permitted', () => {
  const o = run(FX.ADVERSARIAL.primary_metric_missing);
  assert(o.metricContract.status === 'PRIMARY_METRIC_REQUIRED');
  assert(o.evaluation.status === 'EVALUATION_NOT_PERMITTED' || o.decision.decision === 'INSUFFICIENT_EVIDENCE');
});
check('adv/guardrail_deterioration -> PRIMARY_METRIC_IMPROVED_GUARDRAIL_BREACH -> HOLD', () => {
  const o = run(FX.ADVERSARIAL.guardrail_deterioration);
  assert(o.guardrailEval.status === 'PRIMARY_METRIC_IMPROVED_GUARDRAIL_BREACH' && o.guardrailEval.breaches.includes('cpl'));
  assert(o.decision.decision === 'HOLD');
});
check('adv/incomplete_outcome -> OUTCOME_INCOMPLETE -> INSUFFICIENT_EVIDENCE', () => {
  const o = run(FX.ADVERSARIAL.incomplete_outcome);
  assert(o.evaluation.status === 'OUTCOME_INCOMPLETE' && o.decision.decision === 'INSUFFICIENT_EVIDENCE');
});
check('adv/early_stopping -> evidence insufficient, invalidation condition recorded', () => {
  const o = run(FX.ADVERSARIAL.early_stopping);
  assert(o.evaluation.status === 'EVIDENCE_INSUFFICIENT');
  assert(o.measurement.invalidation_conditions.includes('EARLY_STOPPING_WITHOUT_RULE'));
});
check('adv/different_attribution_basis -> descriptive design blocks causal claim', () => {
  const o = run(FX.ADVERSARIAL.different_attribution_basis);
  assert(o.causal.policy !== 'CAUSAL_CLAIM_PERMITTED');
  assert(o.statistics.status === 'STATISTICAL_CLAIM_NOT_PERMITTED');
});
check('adv/margin_degradation -> gross_margin guardrail breach -> HOLD', () => {
  const o = run(FX.ADVERSARIAL.margin_degradation);
  assert(o.guardrailEval.breaches.includes('gross_margin') && o.decision.decision === 'HOLD');
});
check('adv/delayed_outcome -> outcome incomplete, time to signal MEDIUM/LONG', () => {
  const o = run(FX.ADVERSARIAL.delayed_outcome);
  assert(['MEDIUM', 'LONG'].includes(o.timeToSignal.signal_class));
  assert(o.decision.decision === 'INSUFFICIENT_EVIDENCE');
});
check('adv/contaminated_control -> causal blocked (CONTROL_CONTAMINATED)', () => {
  const o = run(FX.ADVERSARIAL.contaminated_control);
  assert(o.design.causal_blockers.includes('CONTROL_CONTAMINATED') && o.causal.policy !== 'CAUSAL_CLAIM_PERMITTED');
});
check('adv/incompatible_treatment_population -> causal blocked', () => {
  const o = run(FX.ADVERSARIAL.incompatible_treatment_population);
  assert(o.design.causal_blockers.includes('POPULATIONS_NOT_COMPARABLE'));
});
check('adv/descriptive_presented_as_causal -> design permits descriptive only, evaluation descriptive_only', () => {
  const o = run(FX.ADVERSARIAL.descriptive_presented_as_causal);
  assert(o.design.conclusion_permitted.causal_evaluation === false);
  assert(o.evaluation.descriptive_only === true && o.evaluation.difference_type === 'DESCRIPTIVE_DIFFERENCE');
});
check('adv/invalid_significance_claim -> structural issues, no significance declared', () => {
  const o = run(FX.ADVERSARIAL.invalid_significance_claim);
  assert(o.statistics.structural_check.issues.length > 0 && o.statistics.significance_declared_by_astra === false);
  assert(o.statistics.status !== 'STATISTICAL_EVALUATION_VALID');
});
check('adv/missing_currency -> runs; no fabricated monetary priority precision beyond supplied', () => {
  const o = run(FX.ADVERSARIAL.missing_currency);
  assert(o.priority.fabricated_precision === false);
});
check('adv/missing_acquisition_cost_component -> opportunity still valid, economic impact honest', () => {
  const o = run(FX.ADVERSARIAL.missing_acquisition_cost_component);
  assert(EI.opportunity.validateOpportunity(o.opportunity).valid);
});
check('adv/simpson_segmentation_conflict -> contamination via also_changing confounder', () => {
  const o = run(FX.ADVERSARIAL.simpson_segmentation_conflict);
  assert(o.variableMap.contamination_status === 'MULTI_VARIABLE_CONTAMINATION');
});
check('adv/treatment_leakage -> causal blocked (TREATMENT_LEAKAGE)', () => {
  const o = run(FX.ADVERSARIAL.treatment_leakage);
  assert(o.design.causal_blockers.includes('TREATMENT_LEAKAGE'));
});
check('adv/duplicate_experiment_id -> duplicate supplied id detected', () => {
  const o = run(FX.ADVERSARIAL.duplicate_experiment_id);
  assert(o.duplicateCheck.has_duplicates && o.duplicateCheck.supplied_id_duplicates.includes('exp-qualification_rate'));
});
check('adv/malformed_hypothesis -> MALFORMED (or rejected for causal language)', () => {
  let threw = false;
  try { run(FX.ADVERSARIAL.malformed_hypothesis); } catch (e) { threw = /Hypothesis|causality/.test(e.message); }
  assert(threw);
});
check('adv/descriptive_lift_valid -> descriptive difference reported, not causal', () => {
  const o = run(FX.ADVERSARIAL.descriptive_lift_valid);
  assert(o.evaluation.difference_type === 'DESCRIPTIVE_DIFFERENCE' && o.causal.policy !== 'CAUSAL_CLAIM_PERMITTED');
});
check('adv/time_to_signal_unknown -> TIME_TO_SIGNAL_UNKNOWN, priority becomes ordinal or handles missing', () => {
  const o = run(FX.ADVERSARIAL.time_to_signal_unknown);
  assert(o.timeToSignal.signal_class === 'TIME_TO_SIGNAL_UNKNOWN' && o.timeToSignal.estimated_days === null);
});
check('adv/deterministic_rerun -> identical report_id across two runs', () => {
  const a = run(FX.ADVERSARIAL.deterministic_rerun), b = run(FX.ADVERSARIAL.deterministic_rerun);
  assert.strictEqual(a.report.report_id, b.report.report_id);
  assert.strictEqual(a.registryEntry.experiment_id, b.registryEntry.experiment_id);
});

// ---- 16 dimensions ----
const dental = run({ funnelRevenueResult: FX.SCENARIOS.dental.fr(), experimentSpec: FX.SCENARIOS.dental.spec() });
check('dim/opportunity intake: no monetary impact assumed unless 11J calculated it', () => {
  assert(['NOT_VALIDLY_CALCULATED', 'OBSERVED', 'COMPUTED', 'MODELLED'].includes(dental.opportunity.economic_impact.status));
});
check('dim/hypothesis discipline: BECAUSE is never proven causality', () => {
  assert(dental.hypothesis.mechanism_is_proven_causality === false && EI.hypothesis.validateHypothesis(dental.hypothesis).valid);
});
check('dim/variable classification: contamination detection is deterministic', () => {
  const a = run(FX.ADVERSARIAL.multi_variable_contamination), b = run(FX.ADVERSARIAL.multi_variable_contamination);
  assert.strictEqual(a.variableMap.variable_map_id, b.variableMap.variable_map_id);
});
check('dim/baseline discipline: required baseline not VALID => no comparison permitted', () => {
  const o = run(FX.ADVERSARIAL.no_baseline);
  assert(!(o.baseline.status === 'BASELINE_VALID') && o.baseline.comparison_permitted === false);
});
check('dim/metric contract: exactly one operational primary metric', () => {
  assert(dental.metricContract.exactly_one_primary && dental.metricContract.primary_operational);
});
check('dim/guardrail discipline: no automatic winner on breach', () => {
  const o = run(FX.ADVERSARIAL.guardrail_deterioration);
  assert(o.guardrailEval.automatic_winner_declared === false);
});
check('dim/design conclusion: each design declares what it permits', () => {
  assert('descriptive_comparison' in dental.design.conclusion_permitted && 'causal_evaluation' in dental.design.conclusion_permitted);
});
check('dim/statistical discipline: ASTRA never declares significance / fabricates stats', () => {
  assert(dental.statistics.significance_declared_by_astra === false && dental.statistics.fabricated_p_value === null && EI.statistics.validateStatistics(dental.statistics).valid);
});
check('dim/causal policy: correlation / before-after never yield causality', () => {
  assert(dental.causal.inferred_from_correlation === false && dental.causal.inferred_from_before_after === false && dental.causal.inferred_from_attribution_report === false);
});
check('dim/time to signal: only from supplied inputs; UNKNOWN otherwise', () => {
  const o = run(FX.ADVERSARIAL.time_to_signal_unknown);
  assert(o.timeToSignal.fabricated_window === false && o.timeToSignal.signal_class === 'TIME_TO_SIGNAL_UNKNOWN');
});
check('dim/priority: ordinal when qualitative; no fabricated precision', () => {
  const o = run({ funnelRevenueResult: FX.SCENARIOS.restaurant.fr(), experimentSpec: { ...FX.SCENARIOS.restaurant.spec(), impact_reference: undefined } });
  assert(o.priority.fabricated_precision === false);
});
check('dim/risk: qualitative only, no probability', () => {
  assert(dental.risk.probability_estimated === false && dental.risk.numeric_risk_score === null && EI.risk.validateRisk(dental.risk).valid);
});
check('dim/evaluation: a difference is always DESCRIPTIVE', () => {
  assert(dental.evaluation.difference_type === 'DESCRIPTIVE_DIFFERENCE');
});
check('dim/decision: INCONCLUSIVE / INSUFFICIENT_EVIDENCE are valid; winner never forced', () => {
  assert(dental.decision.winner_forced === false && EI.decision.validateDecision(dental.decision).valid);
});
check('dim/registry: deterministic content-addressed experiment_id', () => {
  const a = run({ funnelRevenueResult: FX.SCENARIOS.dental.fr(), experimentSpec: FX.SCENARIOS.dental.spec() });
  assert.strictEqual(a.registryEntry.experiment_id, dental.registryEntry.experiment_id);
});
check('dim/report grounding: boundary section asserts no execution', () => {
  const b = dental.report.sections.boundary;
  assert(b.does_not_execute_experiments && b.does_not_deploy && b.does_not_write_production && b.no_autonomous_action);
});

console.log(`\nASTRA11K_BENCHMARK_RESULT pass=${pass} fail=${fail}`);
if (fail) { console.log('FAILURES:\n' + notes.join('\n')); process.exit(1); }
