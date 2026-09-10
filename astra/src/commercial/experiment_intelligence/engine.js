'use strict';
// [ASTRA-11K] Experiment Intelligence Engine — deterministic pipeline orchestrator.
//   Validated funnel/revenue evidence -> ExperimentOpportunity -> Hypothesis ->
//   VariableMap -> Baseline -> MetricContract -> Design -> Guardrails -> Risk ->
//   TimeToSignal -> Priority -> MeasurementContract -> Statistics -> Causality ->
//   Evaluation -> Decision -> RegistryEntry -> ExperimentIntelligenceReport.
// Fully deterministic. NO LLM, NO web, NO I/O (beyond the integrity self-scan), NO clock.
// ASTRA-11K executes nothing: no experiments, no campaigns, no budget, no deploy, no prod write.
const OPP = require('./opportunity');
const HYP = require('./hypothesis');
const VAR = require('./variables');
const BASE = require('./baseline');
const MET = require('./metrics');
const GRD = require('./guardrails');
const DES = require('./design');
const RSK = require('./risk');
const TTS = require('./time_to_signal');
const PRI = require('./priority');
const MSR = require('./measurement');
const STAT = require('./statistics');
const CAUS = require('./causality');
const EVAL = require('./evaluation');
const DEC = require('./decision');
const REG = require('./registry');
const IG = require('./integrity');
const REP = require('./report');
const { denominatorState } = require('../funnel_revenue/scope_validation');

// runExperimentIntelligence({ opportunity | funnelRevenueResult, experimentSpec, referenceTime })
//   experimentSpec (business/analyst supplied): hypothesis fields, variables, baseline,
//   metric contract, design, guardrail outcomes, risk inputs, time-to-signal inputs,
//   supplied statistics, supplied outcome, timestamps, experiment_id.
function runExperimentIntelligence(opts) {
  const referenceTime = opts.referenceTime;
  if (!referenceTime) throw new Error('[ASTRA-11K] referenceTime is required (no implicit clock)');
  const spec = opts.experimentSpec || {};

  // ---- OPPORTUNITY (§1) ----
  let opportunity;
  if (opts.opportunity) opportunity = OPP.makeOpportunity(opts.opportunity);
  else if (opts.funnelRevenueResult) {
    const list = OPP.extractOpportunities(opts.funnelRevenueResult);
    const pick = spec.opportunity_source_ref ? list.find(o => o.source_ref === spec.opportunity_source_ref) : list[0];
    if (!pick) throw new Error('[ASTRA-11K] no ExperimentOpportunity could be extracted from the funnel/revenue result');
    opportunity = pick;
  } else throw new Error('[ASTRA-11K] runExperimentIntelligence needs an opportunity or a funnelRevenueResult');
  { const v = OPP.validateOpportunity(opportunity); if (!v.valid) throw new Error(`[ASTRA-11K] invalid ExperimentOpportunity: ${v.errors.join(' | ')}`); }

  const treatmentScope = spec.treatment_scope || opportunity.scope;

  // ---- HYPOTHESIS (§2) ----
  const hypothesis = HYP.makeHypothesis({ opportunity_id: opportunity.opportunity_id, ...(spec.hypothesis || {}), primary_metric: (spec.hypothesis && spec.hypothesis.primary_metric) || (spec.metric_contract && spec.metric_contract.primary_metric) || opportunity.impacted_metric });
  { const v = HYP.validateHypothesis(hypothesis); if (!v.valid) throw new Error(`[ASTRA-11K] invalid Hypothesis: ${v.errors.join(' | ')}`); }

  // ---- VARIABLE MAP (§3) ----
  const variableMap = VAR.buildVariableMap({ independent_variable: hypothesis.independent_variable, dependent_variable: hypothesis.primary_metric, ...(spec.variables || {}) });
  { const v = VAR.validateVariableMap(variableMap); if (!v.valid) throw new Error(`[ASTRA-11K] invalid VariableMap: ${v.errors.join(' | ')}`); }

  // ---- METRIC CONTRACT (§5) ----
  const metricContract = MET.buildMetricContract(spec.metric_contract || { primary_metric: hypothesis.primary_metric });
  { const v = MET.validateMetricContract(metricContract); if (!v.valid) throw new Error(`[ASTRA-11K] invalid MetricContract: ${v.errors.join(' | ')}`); }

  // ---- BASELINE (§4) ----
  const designRequiresBaseline = !spec.design || !['BEFORE_AFTER_DESCRIPTIVE', 'OPERATIONAL_PROCESS_TEST'].includes(String((spec.design || {}).design_type || '').toUpperCase()) || (spec.design && spec.design.baseline_required === true);
  // a baseline is used ONLY when explicitly supplied — a null/absent baseline is not synthesised
  const baselineInput = spec.baseline !== undefined ? spec.baseline : null;
  const baseline = BASE.validateBaseline({ baseline: baselineInput, treatmentScope, metricDefinition: metricContract.primary_metric_definition, required: designRequiresBaseline });
  { const v = BASE.validateBaselineValidation(baseline); if (!v.valid) throw new Error(`[ASTRA-11K] invalid BaselineValidation: ${v.errors.join(' | ')}`); }

  // ---- DESIGN (§7) ----
  const design = DES.buildDesign({ ...(spec.design || {}), contamination_status: variableMap.contamination_status });
  { const v = DES.validateDesign(design); if (!v.valid) throw new Error(`[ASTRA-11K] invalid ExperimentDesign: ${v.errors.join(' | ')}`); }

  // ---- GUARDRAILS (§6) ----
  const guardrailEval = GRD.evaluateGuardrails({ guardrailMetrics: metricContract.guardrail_metrics, primaryImproved: null, outcomes: (spec.outcomes && spec.outcomes.guardrails) || {}, relative_threshold: spec.guardrail_relative_threshold });
  { const v = GRD.validateGuardrailEvaluation(guardrailEval); if (!v.valid) throw new Error(`[ASTRA-11K] invalid GuardrailEvaluation: ${v.errors.join(' | ')}`); }

  // ---- RISK (§11) ----
  const risk = RSK.assessRisk({ inputs: spec.risk_inputs || {}, variableMap, design, opportunity });
  { const v = RSK.validateRisk(risk); if (!v.valid) throw new Error(`[ASTRA-11K] invalid RiskAssessment: ${v.errors.join(' | ')}`); }

  // ---- TIME TO SIGNAL (§9) ----
  const timeToSignal = TTS.estimateTimeToSignal(spec.time_to_signal_inputs || {});
  { const v = TTS.validateTimeToSignal(timeToSignal); if (!v.valid) throw new Error(`[ASTRA-11K] invalid TimeToSignal: ${v.errors.join(' | ')}`); }

  // ---- PRIORITY (§10) ----
  const priority = PRI.prioritizeExperiment({ opportunity, timeToSignal, risk, evidenceQuality: opportunity.evidence_quality, businessInput: spec });
  { const v = PRI.validatePriority(priority); if (!v.valid) throw new Error(`[ASTRA-11K] invalid ExperimentPriority: ${v.errors.join(' | ')}`); }

  // ---- MEASUREMENT CONTRACT (§15) ----
  const denomState = spec.primary_denominator_count != null ? denominatorState(spec.primary_denominator_count) : (spec.primary_denominator_state || 'UNKNOWN');
  const measurement = MSR.buildMeasurementContract({ metricContract, design, opportunityScope: treatmentScope, denominator_definition: spec.denominator_definition, denominator_state: denomState, observation_window: spec.observation_window, unit_of_analysis: spec.unit_of_analysis, invalidation_conditions: spec.invalidation_conditions });
  { const v = MSR.validateMeasurementContract(measurement); if (!v.valid) throw new Error(`[ASTRA-11K] invalid MeasurementContract: ${v.errors.join(' | ')}`); }

  // ---- STATISTICS (§8) ----
  const statistics = STAT.assessStatistics({ design, outcomes: spec.outcomes || {}, supplied_statistics: spec.supplied_statistics || null });
  { const v = STAT.validateStatistics(statistics); if (!v.valid) throw new Error(`[ASTRA-11K] invalid StatisticalAssessment: ${v.errors.join(' | ')}`); }

  // ---- CAUSALITY (§14) ----
  const causal = CAUS.assessCausality({ design, variableMap, baseline, statistics });
  { const v = CAUS.validateCausality(causal); if (!v.valid) throw new Error(`[ASTRA-11K] invalid CausalPolicy: ${v.errors.join(' | ')}`); }

  // ---- EVALUATION (§13-prep) ----
  const evaluation = EVAL.evaluateOutcome({
    metricContract, design, baseline, guardrailEval, statistics, causal,
    outcomes: spec.outcomes || {}, sample: spec.sample || null, min_events: spec.min_events,
    expected_direction: hypothesis.expected_direction, material_change_threshold: spec.material_change_threshold,
  });
  { const v = EVAL.validateEvaluation(evaluation); if (!v.valid) throw new Error(`[ASTRA-11K] invalid ExperimentEvaluation: ${v.errors.join(' | ')}`); }

  // ---- DECISION (§13) ----
  const decision = DEC.decide({ evaluation, guardrailEval, causal, baseline, statistics, variableMap });
  { const v = DEC.validateDecision(decision); if (!v.valid) throw new Error(`[ASTRA-11K] invalid ExperimentDecision: ${v.errors.join(' | ')}`); }

  // ---- REGISTRY (§12) ----
  const registryEntry = REG.makeRegistryEntry({ business_id: spec.business_id, opportunity, hypothesis, variableMap, metricContract, design, baseline, guardrailEval, evaluation, decision, statistics, causal, timestamps: spec.timestamps || {}, experiment_id: spec.experiment_id, force_status: spec.force_status });
  { const v = REG.validateRegistryEntry(registryEntry); if (!v.valid) throw new Error(`[ASTRA-11K] invalid ExperimentRegistryEntry: ${v.errors.join(' | ')}`); }
  const duplicateCheck = REG.detectDuplicateIds([registryEntry, ...((spec.other_registry_entries) || [])], [spec.experiment_id, ...((spec.other_supplied_ids) || [])]);

  // ---- INTEGRITY + REPORT ----
  const integrity = IG.attestIntegrity();
  const conflicts = [];
  if (opportunity.economic_impact && opportunity.economic_impact.status === 'NOT_VALIDLY_CALCULATED' && priority.mode === 'QUANTITATIVE') conflicts.push({ dimension: 'PRIORITY_MODE', detail: 'quantitative priority without a validly-calculated economic impact' });
  if (baseline.required && baseline.status !== 'BASELINE_VALID' && decision.decision === 'ADOPT') conflicts.push({ dimension: 'DECISION', detail: 'ADOPT with an invalid required baseline' });

  const report = REP.buildReport({
    referenceTime, opportunity, hypothesis, variableMap, baseline, metricContract, guardrailEval,
    design, measurement, risk, timeToSignal, priority, statistics, causal, evaluation, decision,
    registryEntry, duplicateCheck, integrity, conflicts,
  });

  return {
    report, opportunity, hypothesis, variableMap, baseline, metricContract, guardrailEval, design,
    measurement, risk, timeToSignal, priority, statistics, causal, evaluation, decision,
    registryEntry, duplicateCheck, integrity, conflicts,
    provenance_note: 'ASTRA-11K deterministic pipeline. Diagnosis -> hypothesis -> design -> priority -> evaluation -> structured decision. No experiment is executed. No lift, significance, causality, sample size, benchmark, conversion, revenue, margin or probabilistic confidence score is fabricated. No LLM. No production routing. No autonomous action.',
  };
}

module.exports = { runExperimentIntelligence };
