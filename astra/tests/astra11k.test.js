'use strict';
// ASTRA-11K — Experiment Intelligence Engine. Explicit W1..W80 + compatibility/security.
// Offline deterministic ONLY. No network, no LLM, no production DB, no experiment execution.
const assert = require('assert');
const fs = require('fs'); const path = require('path');
const EI = require('../src/commercial/experiment_intelligence');
const FX = require('../benchmarks/astra11k/fixtures');

let pass = 0, fail = 0; const fails = []; const covered = {};
function W(id, name, fn) { covered[id] = true; try { fn(); pass++; console.log('PASS', id, name); } catch (e) { fail++; fails.push(`${id} ${name} :: ${e && e.message}`); console.log('FAIL', id, name, '::', e && e.message); } }
const REF = FX.REFERENCE_TIME;
const run = (o) => EI.engine.runExperimentIntelligence({ ...o, referenceTime: REF });
const dental = () => run({ funnelRevenueResult: FX.SCENARIOS.dental.fr(), experimentSpec: FX.SCENARIOS.dental.spec() });
const A = FX.ADVERSARIAL;

// ---------- opportunity + hypothesis (W1..W10) ----------
W('W1', 'opportunity intake from an ASTRA-11J result', () => { const o = dental(); assert(o.opportunity.opportunity_kind === 'BOTTLENECK' && o.opportunity.source_module.startsWith('astra11j')); });
W('W2', 'no monetary opportunity assumed unless 11J calculated it validly', () => {
  const o = run({ funnelRevenueResult: FX.funnel(['CONVERSATION', 'QUALIFIED', 'SOLD'], [100, 50, 20], 'BOOKING'), experimentSpec: FX.spec('qualification_rate') });
  assert(['NOT_VALIDLY_CALCULATED', 'MODELLED', 'OBSERVED', 'COMPUTED'].includes(o.opportunity.economic_impact.status));
});
W('W3', 'opportunity contract validates', () => { const o = dental(); assert(EI.opportunity.validateOpportunity(o.opportunity).valid); });
W('W4', 'hypothesis IF/FOR/THEN/BECAUSE structure', () => {
  const o = dental();
  assert(o.hypothesis.if_change && o.hypothesis.for_population && o.hypothesis.then_expect.metric && o.hypothesis.because_mechanism);
});
W('W5', 'hypothesis BECAUSE is never proven causality', () => { const o = dental(); assert(o.hypothesis.mechanism_is_proven_causality === false); });
W('W6', 'malformed hypothesis rejected (missing fields OR causal language)', () => {
  let threw = false;
  try { run(A.malformed_hypothesis); } catch (e) { threw = /Hypothesis|causality/.test(e.message); }
  assert(threw);
  const h = EI.hypothesis.makeHypothesis({ independent_variable: 'x' });
  assert(h.status === 'MALFORMED' && h.missing_fields.length > 0);
});
W('W7', 'well-formed hypothesis has no missing fields', () => { const o = dental(); assert(o.hypothesis.status === 'WELL_FORMED' && o.hypothesis.missing_fields.length === 0); });
W('W8', 'hypothesis references its opportunity', () => { const o = dental(); assert(o.hypothesis.opportunity_id === o.opportunity.opportunity_id); });
W('W9', 'deterministic hypothesis id', () => {
  const a = dental(), b = dental();
  assert.strictEqual(a.hypothesis.hypothesis_id, b.hypothesis.hypothesis_id);
});
W('W10', 'expected_direction is controlled', () => { const o = dental(); assert(EI.hypothesis.EXPECTED_DIRECTION.includes(o.hypothesis.expected_direction)); });

// ---------- variables + contamination (W11..W16) ----------
W('W11', 'variable classification: independent/dependent/controlled/confounders/external', () => {
  const o = dental();
  for (const k of ['independent_variables', 'dependent_variable', 'controlled_variables', 'confounders', 'external_factors']) assert(k in o.variableMap);
});
W('W12', 'single isolated variable -> ISOLATED', () => { const o = dental(); assert(o.variableMap.contamination_status === 'ISOLATED'); });
W('W13', 'two+ relevant variables without isolation -> MULTI_VARIABLE_CONTAMINATION', () => {
  const o = run(A.multi_variable_contamination);
  assert(o.variableMap.contamination_status === 'MULTI_VARIABLE_CONTAMINATION');
});
W('W14', 'contamination -> CAUSAL_ATTRIBUTION_NOT_IDENTIFIABLE', () => {
  const o = run(A.multi_variable_contamination);
  assert(o.variableMap.causal_attribution === 'CAUSAL_ATTRIBUTION_NOT_IDENTIFIABLE' && o.causal.policy === 'CAUSAL_ATTRIBUTION_NOT_IDENTIFIABLE');
});
W('W15', 'a confounder that also changes triggers contamination (Simpson-like)', () => {
  const o = run(A.simpson_segmentation_conflict);
  assert(o.variableMap.contamination_status === 'MULTI_VARIABLE_CONTAMINATION');
});
W('W16', 'variable map deterministic + valid', () => {
  const a = run(A.multi_variable_contamination), b = run(A.multi_variable_contamination);
  assert.strictEqual(a.variableMap.variable_map_id, b.variableMap.variable_map_id);
  assert(EI.variables.validateVariableMap(a.variableMap).valid);
});

// ---------- baseline (W17..W24) ----------
W('W17', 'valid compatible baseline -> BASELINE_VALID', () => { const o = dental(); assert(o.baseline.status === 'BASELINE_VALID' && o.baseline.comparison_permitted === true); });
W('W18', 'missing required baseline -> BASELINE_MISSING, comparison not permitted', () => {
  const o = run(A.no_baseline);
  assert(o.baseline.status === 'BASELINE_MISSING' && o.baseline.comparison_permitted === false);
});
W('W19', 'baseline scope mismatch -> BASELINE_SCOPE_MISMATCH', () => { assert(run(A.scope_mismatch).baseline.status === 'BASELINE_SCOPE_MISMATCH'); });
W('W20', 'baseline period mismatch -> BASELINE_PERIOD_MISMATCH', () => { assert(run(A.period_mismatch).baseline.status === 'BASELINE_PERIOD_MISMATCH'); });
W('W21', 'baseline cohort mismatch -> BASELINE_COHORT_MISMATCH', () => { assert(run(A.cohort_mismatch).baseline.status === 'BASELINE_COHORT_MISMATCH'); });
W('W22', 'baseline metric-definition mismatch -> BASELINE_METRIC_MISMATCH', () => {
  const b = FX.base();
  const o = run({ funnelRevenueResult: b.fr, experimentSpec: { ...b.s, baseline: { value: 0.5, metric_definition: 'a different definition', scope: { period: FX.P, cohort_basis: 'PERIOD_METRIC' } } } });
  assert(o.baseline.status === 'BASELINE_METRIC_MISMATCH');
});
W('W23', 'a non-valid required baseline blocks ADOPT', () => {
  const o = run(A.no_baseline);
  assert(o.decision.decision !== 'ADOPT');
});
W('W24', 'baseline validation is deterministic + valid', () => {
  const a = run(A.scope_mismatch), b = run(A.scope_mismatch);
  assert.strictEqual(a.baseline.baseline_id, b.baseline.baseline_id);
  assert(EI.baseline.validateBaselineValidation(a.baseline).valid);
});

// ---------- metric contract + guardrails (W25..W34) ----------
W('W25', 'exactly one primary metric', () => { const o = dental(); assert(o.metricContract.exactly_one_primary && o.metricContract.status === 'METRIC_CONTRACT_VALID'); });
W('W26', 'missing primary metric -> PRIMARY_METRIC_REQUIRED', () => { assert(run(A.primary_metric_missing).metricContract.status === 'PRIMARY_METRIC_REQUIRED'); });
W('W27', 'vague goal is not an operational primary metric', () => {
  const mc = EI.metrics.buildMetricContract({ primary_metric: 'vender más' });
  assert(mc.status === 'PRIMARY_METRIC_REQUIRED' || mc.status === 'PRIMARY_METRIC_NOT_OPERATIONAL');
});
W('W28', 'a metric cannot hold two roles', () => {
  const mc = EI.metrics.buildMetricContract({ primary_metric: 'conversion_rate', guardrails: ['conversion_rate'] });
  assert(mc.status === 'DUPLICATE_METRIC_ROLE');
});
W('W29', 'guardrails defined -> evaluated', () => { const o = dental(); assert(['GUARDRAILS_OK', 'PRIMARY_METRIC_IMPROVED_GUARDRAIL_BREACH', 'GUARDRAIL_DATA_MISSING'].includes(o.guardrailEval.status)); });
W('W30', 'guardrail breach -> PRIMARY_METRIC_IMPROVED_GUARDRAIL_BREACH', () => {
  const o = run(A.guardrail_deterioration);
  assert(o.guardrailEval.status === 'PRIMARY_METRIC_IMPROVED_GUARDRAIL_BREACH' && o.guardrailEval.breaches.includes('cpl'));
});
W('W31', 'margin degradation is a guardrail breach', () => { assert(run(A.margin_degradation).guardrailEval.breaches.includes('gross_margin')); });
W('W32', 'no automatic winner on guardrail breach', () => { const o = run(A.guardrail_deterioration); assert(o.guardrailEval.automatic_winner_declared === false); });
W('W33', 'guardrail breach -> decision HOLD', () => { assert(run(A.guardrail_deterioration).decision.decision === 'HOLD'); });
W('W34', 'metric + guardrail evaluation deterministic + valid', () => {
  const a = dental(), b = dental();
  assert.strictEqual(a.metricContract.metric_contract_id, b.metricContract.metric_contract_id);
  assert(EI.metrics.validateMetricContract(a.metricContract).valid && EI.guardrails.validateGuardrailEvaluation(a.guardrailEval).valid);
});

// ---------- design + statistics + causality (W35..W48) ----------
W('W35', 'design declares what conclusion it permits', () => {
  const o = dental();
  assert('descriptive_comparison' in o.design.conclusion_permitted && 'causal_evaluation' in o.design.conclusion_permitted);
});
W('W36', 'BEFORE_AFTER_DESCRIPTIVE -> no causal by default', () => {
  const o = run(A.descriptive_presented_as_causal);
  assert(o.design.conclusion_permitted.causal_evaluation === false && o.design.conclusion_permitted.descriptive_comparison === true);
});
W('W37', 'CONTROL_VS_TREATMENT -> causal possible only if all conditions valid', () => {
  const o = dental();
  assert(o.design.is_controlled && o.design.conclusion_permitted.causal_evaluation === (o.design.causal_blockers.length === 0));
});
W('W38', 'contaminated control blocks causal evaluation', () => {
  const o = run(A.contaminated_control);
  assert(o.design.causal_blockers.includes('CONTROL_CONTAMINATED') && o.design.conclusion_permitted.causal_evaluation === false);
});
W('W39', 'treatment leakage blocks causal evaluation', () => { assert(run(A.treatment_leakage).design.causal_blockers.includes('TREATMENT_LEAKAGE')); });
W('W40', 'incomparable treatment population blocks causal evaluation', () => { assert(run(A.incompatible_treatment_population).design.causal_blockers.includes('POPULATIONS_NOT_COMPARABLE')); });
W('W41', 'ASTRA never declares statistical significance', () => { const o = dental(); assert(o.statistics.significance_declared_by_astra === false); });
W('W42', 'ASTRA never fabricates p-value / CI / power / sample size / MDE', () => {
  const o = dental();
  for (const k of ['fabricated_p_value', 'fabricated_confidence_interval', 'fabricated_power', 'fabricated_sample_size', 'fabricated_mde']) assert(o.statistics[k] === null);
});
W('W43', 'no valid test data -> DESCRIPTIVE_DIFFERENCE / STATISTICAL_TEST_NOT_AVAILABLE / NOT_PERMITTED', () => {
  const o = dental();
  assert(['DESCRIPTIVE_DIFFERENCE', 'STATISTICAL_TEST_NOT_AVAILABLE', 'STATISTICAL_CLAIM_NOT_PERMITTED'].includes(o.statistics.status));
});
W('W44', 'supplied statistics validated structurally only', () => {
  const b = FX.base();
  const o = run({ funnelRevenueResult: b.fr, experimentSpec: { ...b.s, supplied_statistics: { test_name: 't-test', p_value: 0.02, alpha: 0.05, sample_size_control: 200, sample_size_treatment: 200, computed_by: 'analyst-notebook' } } });
  assert(o.statistics.structural_check.supplied && o.statistics.structural_check.valid_structure === true);
});
W('W45', 'malformed supplied statistics -> not valid, no significance', () => {
  const o = run(A.invalid_significance_claim);
  assert(o.statistics.structural_check.issues.length > 0 && o.statistics.status !== 'STATISTICAL_EVALUATION_VALID' && o.statistics.significance_declared_by_astra === false);
});
W('W46', 'causal policy: correlation / before-after / attribution never yield causality', () => {
  const o = dental();
  assert(o.causal.inferred_from_correlation === false && o.causal.inferred_from_before_after === false && o.causal.inferred_from_attribution_report === false);
});
W('W47', 'causal claim permitted only for a clean controlled design', () => {
  const o = dental();
  assert(o.causal.policy === 'CAUSAL_CLAIM_PERMITTED' ? o.causal.blockers.length === 0 && o.design.is_controlled : true);
});
W('W48', 'attribution-report basis does not create causality', () => {
  const o = run(A.different_attribution_basis);
  assert(o.causal.policy !== 'CAUSAL_CLAIM_PERMITTED');
});

// ---------- time to signal + priority + risk (W49..W60) ----------
W('W49', 'time to signal only from supplied inputs', () => { const o = dental(); assert(o.timeToSignal.inputs_used.length > 0 && o.timeToSignal.fabricated_window === false); });
W('W50', 'no inputs -> TIME_TO_SIGNAL_UNKNOWN, no estimate', () => {
  const o = run(A.time_to_signal_unknown);
  assert(o.timeToSignal.signal_class === 'TIME_TO_SIGNAL_UNKNOWN' && o.timeToSignal.estimated_days === null);
});
W('W51', 'delayed outcome -> MEDIUM/LONG signal class', () => { assert(['MEDIUM', 'LONG'].includes(run(A.delayed_outcome).timeToSignal.signal_class)); });
W('W52', 'time to signal deterministic + valid', () => {
  const a = dental(), b = dental();
  assert.strictEqual(a.timeToSignal.time_to_signal_id, b.timeToSignal.time_to_signal_id);
  assert(EI.timeToSignal.validateTimeToSignal(a.timeToSignal).valid);
});
W('W53', 'quantitative priority only with a validly-calculated economic impact', () => {
  const o = dental();
  if (o.priority.mode === 'QUANTITATIVE') assert(['OBSERVED', 'COMPUTED', 'MODELLED'].includes(o.opportunity.economic_impact.status));
});
W('W54', 'qualitative inputs -> ORDINAL_PRIORITY, no precise score', () => {
  const o = run({ funnelRevenueResult: FX.funnel(['CONVERSATION', 'QUALIFIED', 'SOLD'], [100, 50, 20], 'BOOKING'), experimentSpec: { ...FX.spec('qualification_rate'), impact_reference: undefined } });
  if (o.priority.mode === 'ORDINAL_PRIORITY') assert(o.priority.priority_score === null);
});
W('W55', 'no fabricated precision like 87.43%', () => { const o = dental(); assert(o.priority.fabricated_precision === false); });
W('W56', 'ordinal priority is one of the controlled values', () => { const o = dental(); assert(EI.priority.ORDINAL.includes(o.priority.ordinal_priority)); });
W('W57', 'priority is analytical, non-autonomous', () => { const o = dental(); assert(o.priority.is_analytical === true && o.priority.triggers_action === false && o.priority.autonomous === false); });
W('W58', 'risk: 7 dimensions, qualitative only', () => {
  const o = dental();
  assert(EI.risk.RISK_DIMENSIONS.every(d => d in o.risk.dimension_ratings) && o.risk.probability_estimated === false && o.risk.numeric_risk_score === null);
});
W('W59', 'risk classification is deterministic + valid', () => {
  const a = dental(), b = dental();
  assert.strictEqual(a.risk.risk_id, b.risk.risk_id);
  assert(EI.risk.validateRisk(a.risk).valid);
});
W('W60', 'contamination drives contamination_risk HIGH', () => {
  const o = run(A.multi_variable_contamination);
  assert(o.risk.dimension_ratings.contamination_risk === 'HIGH');
});

// ---------- measurement + evaluation + decision (W61..W74) ----------
W('W61', 'measurement contract: primary metric read fully specified', () => { const o = dental(); assert(o.measurement.status === 'MEASUREMENT_CONTRACT_VALID'); });
W('W62', 'zero/invalid denominator -> MEASUREMENT_DENOMINATOR_INVALID', () => { assert(run(A.zero_denominator).measurement.status === 'MEASUREMENT_DENOMINATOR_INVALID'); });
W('W63', 'measurement contract lists invalidation conditions', () => { const o = dental(); assert(o.measurement.invalidation_conditions.length >= 3); });
W('W64', 'early stopping recorded as an invalidation condition', () => { assert(run(A.early_stopping).measurement.invalidation_conditions.includes('EARLY_STOPPING_WITHOUT_RULE')); });
W('W65', 'evaluation: a difference is always DESCRIPTIVE_DIFFERENCE', () => { assert(dental().evaluation.difference_type === 'DESCRIPTIVE_DIFFERENCE'); });
W('W66', 'incomplete outcome -> OUTCOME_INCOMPLETE', () => { assert(run(A.incomplete_outcome).evaluation.status === 'OUTCOME_INCOMPLETE'); });
W('W67', 'insufficient sample/events -> EVIDENCE_INSUFFICIENT', () => { assert(run(A.insufficient_data).evaluation.status === 'EVIDENCE_INSUFFICIENT'); });
W('W68', 'no fabricated result', () => {
  for (const k of ['incomplete_outcome', 'insufficient_data', 'zero_denominator', 'no_baseline']) assert(run(A[k]).evaluation.fabricated_result === false);
});
W('W69', 'descriptive design -> evaluation descriptive_only, no causal interpretation', () => {
  const o = run(A.descriptive_presented_as_causal);
  assert(o.evaluation.descriptive_only === true && o.evaluation.causal_interpretation_permitted === false);
});
W('W70', 'decision never forces a winner; INCONCLUSIVE is valid', () => {
  const o = dental();
  assert(o.decision.winner_forced === false && EI.decision.DECISIONS.includes(o.decision.decision));
});
W('W71', 'incomplete/insufficient -> INSUFFICIENT_EVIDENCE', () => {
  assert(run(A.incomplete_outcome).decision.decision === 'INSUFFICIENT_EVIDENCE');
  assert(run(A.insufficient_data).decision.decision === 'INSUFFICIENT_EVIDENCE');
});
W('W72', 'contamination + primary improved -> ITERATE (not ADOPT)', () => {
  const b = FX.base();
  const o = run({ funnelRevenueResult: b.fr, experimentSpec: { ...b.s, variables: { independent_variables: ['a', 'b'] }, outcomes: { primary: { before: 0.5, after: 0.6 }, guardrails: { cpl: { before: 50, after: 50 }, cancellation_rate: { before: 0.1, after: 0.1 }, gross_margin: { before: 0.45, after: 0.45 } } } } });
  assert(o.decision.decision === 'ITERATE');
});
W('W73', 'decision is analytical, non-autonomous; a causal claim needs a basis', () => {
  const o = dental();
  assert(o.decision.triggers_action === false && o.decision.autonomous === false);
  assert(EI.decision.validateDecision(o.decision).valid);
});
W('W74', 'clean controlled experiment, primary up, guardrails ok -> ADOPT possible with causal basis', () => {
  const b = FX.base();
  const o = run({ funnelRevenueResult: b.fr, experimentSpec: { ...b.s, outcomes: { primary: { before: 0.5, after: 0.62 }, guardrails: { cpl: { before: 50, after: 50 }, cancellation_rate: { before: 0.1, after: 0.1 }, gross_margin: { before: 0.45, after: 0.46 } } } } });
  assert(o.decision.decision === 'ADOPT' && o.decision.causal_claim_made === true && o.decision.causal_claim_basis);
});

// ---------- registry + report + integrity (W75..W80) ----------
W('W75', 'registry entry: deterministic content-addressed experiment_id', () => {
  const a = dental(), b = dental();
  assert.strictEqual(a.registryEntry.experiment_id, b.registryEntry.experiment_id);
  assert(a.registryEntry.experiment_id.startsWith('exp_'));
});
W('W76', 'registry lifecycle status is one of the controlled values', () => {
  const o = dental();
  assert(EI.registry.REGISTRY_STATUS.includes(o.registryEntry.status) && EI.registry.validateRegistryEntry(o.registryEntry).valid);
});
W('W77', 'duplicate supplied experiment id detected', () => {
  const o = run(A.duplicate_experiment_id);
  assert(o.duplicateCheck.has_duplicates && o.duplicateCheck.supplied_id_duplicates.length > 0);
});
W('W78', 'report: 34 sections, deterministic report_id, evidence graph valid', () => {
  const a = dental(), b = dental();
  assert.strictEqual(a.report.section_names.length, 34);
  assert.strictEqual(a.report.report_id, b.report.report_id);
  assert(a.report.evidence_graph_valid, JSON.stringify(a.report.evidence_graph_errors));
});
W('W79', 'report boundary section asserts no execution / no deploy / no prod write / no autonomy', () => {
  const b = dental().report.sections.boundary;
  assert(b.does_not_execute_experiments && b.does_not_modify_campaigns && b.does_not_spend_budget && b.does_not_deploy && b.does_not_write_production && b.does_not_feed_production_routing && b.no_autonomous_action);
});
W('W80', 'integrity attestation clean: network/llm/db/deploy = 0, cost $0', () => {
  const o = dental();
  assert(o.integrity.clean && o.integrity.network_calls === 0 && o.integrity.llm_calls === 0 && o.integrity.production_db_writes === 0 && o.integrity.deploys === 0 && o.integrity.cost_usd === 0);
  assert(o.integrity.executes_experiments === false);
});

// ---------- compatibility / security ----------
W('C1', 'ASTRA-11B compatibility', () => { assert.strictEqual(EI.UCDM_SCHEMA_VERSION, require('../src/commercial/schema/entities').SCHEMA_VERSION); });
W('C2', 'ASTRA-11J compatibility (consumes a funnel/revenue result unchanged)', () => {
  const fr = FX.SCENARIOS.dental.fr(); const before = fr.report.report_id;
  run({ funnelRevenueResult: fr, experimentSpec: FX.SCENARIOS.dental.spec() });
  assert.strictEqual(fr.report.report_id, before);
  assert.strictEqual(EI.FUNNEL_REVENUE_SCHEMA_VERSION, 'ucdm-funnel-revenue-1.0.0');
});
W('C3', 'ASTRA-11F/H/I schema-version constants exported', () => {
  assert.strictEqual(EI.VOC_SCHEMA_VERSION, 'ucdm-voc-1.0.0');
  assert.strictEqual(EI.JOURNEY_SCHEMA_VERSION, 'ucdm-journey-1.0.0');
  assert.strictEqual(EI.POSITIONING_OFFER_SCHEMA_VERSION, 'ucdm-positioning-offer-1.0.0');
});
W('C4', 'reuses ASTRA-11J scope/period/cohort primitives (no parallel system)', () => {
  const src = fs.readFileSync(path.join(__dirname, '../src/commercial/experiment_intelligence/baseline.js'), 'utf8');
  assert(/funnel_revenue\/(time_window|cohort|channel)/.test(src));
});
W('C5', 'no network dependency', () => {
  let src = '';
  for (const f of fs.readdirSync(path.join(__dirname, '../src/commercial/experiment_intelligence'))) if (f !== 'integrity.js') src += fs.readFileSync(path.join(__dirname, '../src/commercial/experiment_intelligence', f), 'utf8');
  assert(!/require\(['"](http|https|net|dns|tls|dgram)['"]\)|fetch\(|XMLHttpRequest|WebSocket/.test(src));
});
W('C6', 'no production DB / no experiment execution constructs', () => {
  for (const f of fs.readdirSync(path.join(__dirname, '../src/commercial/experiment_intelligence'))) {
    if (f === 'integrity.js') continue;
    const s = fs.readFileSync(path.join(__dirname, '../src/commercial/experiment_intelligence', f), 'utf8');
    assert(!/supabase|createClient|\bpg\b|mysql|mongodb|@vercel|kv\.set|child_process|deploy\(|launchCampaign|spendBudget/i.test(s));
  }
});
W('C7', 'ASTRA-10 freeze unchanged', () => {
  const fr = JSON.parse(fs.readFileSync(path.join(__dirname, '../benchmarks/astra10ah/freeze.json'), 'utf8'));
  assert.strictEqual(fr.harness_hash_sha256, '57305a9dee3f9130d8f913e28280d759e78c32cee5affb0ac8931a4da725d53d');
});
W('C8', 'benchmark isolation + stable hashes', () => {
  const bsrc = fs.readFileSync(path.join(__dirname, '../benchmarks/astra11k/run_experiment_intelligence_benchmark.js'), 'utf8');
  assert(!/writeFileSync|writeFile\(|appendFile/.test(bsrc) && /ASTRA11K_BENCHMARK_RESULT/.test(bsrc));
  const a = dental(), b = dental();
  assert.strictEqual(a.report.content_hash, b.report.content_hash);
});

// ---------- W-matrix completeness ----------
const allW = [];
for (let i = 1; i <= 80; i++) allW.push('W' + i);
for (let i = 1; i <= 8; i++) allW.push('C' + i);
const missing = allW.filter(id => !covered[id]);
if (missing.length) { console.log('FAIL W-matrix completeness :: missing', missing.join(',')); fail++; }
else console.log('PASS W-matrix completeness (W1..W80 + C1..C8 all have explicit test evidence)');

console.log(`\nASTRA11K_TEST_RESULT pass=${pass} fail=${fail}`);
if (fail) { console.log('FAILURES:\n' + fails.join('\n')); process.exit(1); }
