'use strict';
// [ASTRA-11K §15] ExperimentIntelligenceReport. ~34 structured sections. Deterministic
// report_id. No fabricated metrics / causal claims / statistics. No LLM, no web, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const SECTION_NAMES = Object.freeze([
  'report_metadata', 'opportunity', 'evidence_scope', 'hypothesis', 'variable_map',
  'contamination_status', 'baseline', 'metric_contract', 'primary_metric', 'secondary_metrics',
  'guardrails', 'guardrail_evaluation', 'experiment_design', 'design_conclusion_permitted',
  'measurement_contract', 'risk', 'time_to_signal', 'priority', 'statistical_status',
  'causal_status', 'evaluation', 'primary_metric_movement', 'decision', 'decision_reasons',
  'registry_entry', 'duplicate_id_check', 'conflicts', 'unknowns', 'limitations',
  'integrity_status', 'boundary', 'evidence_appendix', 'caveats', 'section_index',
]);

function sec(v) {
  const empty = v == null || (Array.isArray(v) && v.length === 0) || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0);
  return empty ? { status: 'UNKNOWN' } : v;
}

function buildReport(x) {
  const {
    referenceTime = null, opportunity = null, hypothesis = null, variableMap = null, baseline = null,
    metricContract = null, guardrailEval = null, design = null, measurement = null, risk = null,
    timeToSignal = null, priority = null, statistics = null, causal = null, evaluation = null,
    decision = null, registryEntry = null, duplicateCheck = null, integrity = null, conflicts = [],
  } = x;

  const evidence_refs = [...new Set([
    ...(opportunity ? opportunity.evidence_refs : []),
    ...(hypothesis ? hypothesis.evidence_basis : []),
  ])].sort();
  const entries = evidence_refs.map(er => ({ evidence_ref: er }));

  const graphErrors = [];
  if (hypothesis && hypothesis.opportunity_id && opportunity && hypothesis.opportunity_id !== opportunity.opportunity_id) graphErrors.push('hypothesis.opportunity_id does not match the opportunity');
  if (decision && decision.decision === 'ADOPT' && (!causal || causal.policy !== 'CAUSAL_CLAIM_PERMITTED') && decision.causal_claim_made) graphErrors.push('ADOPT with a causal claim but causal policy does not permit it');

  const report = {
    schema_version: 'ucdm-experiment-1.0.0',
    downstream_schema_versions: { ucdm: 'ucdm-1.0.0', funnel_revenue: 'ucdm-funnel-revenue-1.0.0' },
    reference_time: referenceTime,
    generated_by: 'deterministic:ucdm/experiment',
    sections: {
      report_metadata: { engine: 'ASTRA-11K Experiment Intelligence', reference_time: referenceTime, deterministic: true },
      opportunity: sec(opportunity ? { opportunity_id: opportunity.opportunity_id, kind: opportunity.opportunity_kind, title: opportunity.title, impacted_metric: opportunity.impacted_metric, economic_impact: opportunity.economic_impact } : null),
      evidence_scope: sec(opportunity ? opportunity.scope : null),
      hypothesis: sec(hypothesis ? { hypothesis_id: hypothesis.hypothesis_id, if_change: hypothesis.if_change, for_population: hypothesis.for_population, then_expect: hypothesis.then_expect, because_mechanism: hypothesis.because_mechanism, mechanism_is_proven_causality: hypothesis.mechanism_is_proven_causality, status: hypothesis.status } : null),
      variable_map: sec(variableMap ? { independent_variables: variableMap.independent_variables, dependent_variable: variableMap.dependent_variable, controlled_variables: variableMap.controlled_variables, confounders: variableMap.confounders, external_factors: variableMap.external_factors } : null),
      contamination_status: sec(variableMap ? { contamination_status: variableMap.contamination_status, causal_attribution: variableMap.causal_attribution } : null),
      baseline: sec(baseline ? { status: baseline.status, mismatches: baseline.mismatches, comparison_permitted: baseline.comparison_permitted } : null),
      metric_contract: sec(metricContract ? { status: metricContract.status, primary_metric: metricContract.primary_metric, primary_operational: metricContract.primary_operational } : null),
      primary_metric: sec(metricContract ? { name: metricContract.primary_metric, definition: metricContract.primary_metric_definition } : null),
      secondary_metrics: sec(metricContract ? metricContract.secondary_metrics : null),
      guardrails: sec(metricContract ? metricContract.guardrail_metrics : null),
      guardrail_evaluation: sec(guardrailEval ? { status: guardrailEval.status, breaches: guardrailEval.breaches, automatic_winner_declared: guardrailEval.automatic_winner_declared } : null),
      experiment_design: sec(design ? { design_type: design.design_type, is_controlled: design.is_controlled, allocation: design.allocation } : null),
      design_conclusion_permitted: sec(design ? { ...design.conclusion_permitted, causal_blockers: design.causal_blockers } : null),
      measurement_contract: sec(measurement ? { status: measurement.status, primary_metric: measurement.primary_metric, denominator_definition: measurement.denominator_definition, observation_window: measurement.observation_window, unit_of_analysis: measurement.unit_of_analysis, invalidation_conditions: measurement.invalidation_conditions } : null),
      risk: sec(risk ? { dimension_ratings: risk.dimension_ratings, overall_qualitative_risk: risk.overall_qualitative_risk, probability_estimated: risk.probability_estimated } : null),
      time_to_signal: sec(timeToSignal ? { signal_class: timeToSignal.signal_class, estimated_days: timeToSignal.estimated_days, inputs_used: timeToSignal.inputs_used } : null),
      priority: sec(priority ? { mode: priority.mode, ordinal_priority: priority.ordinal_priority, priority_score: priority.priority_score, rank_basis: priority.rank_basis, triggers_action: priority.triggers_action } : null),
      statistical_status: sec(statistics ? { status: statistics.status, reason: statistics.reason, significance_declared_by_astra: statistics.significance_declared_by_astra, structural_check: statistics.structural_check } : null),
      causal_status: sec(causal ? { policy: causal.policy, blockers: causal.blockers } : null),
      evaluation: sec(evaluation ? { status: evaluation.status, primary_before: evaluation.primary_before, primary_after: evaluation.primary_after, primary_relative_change: evaluation.primary_relative_change, difference_type: evaluation.difference_type, descriptive_only: evaluation.descriptive_only } : null),
      primary_metric_movement: sec(evaluation ? evaluation.primary_movement : null),
      decision: sec(decision ? { decision: decision.decision, causal_claim_made: decision.causal_claim_made, triggers_action: decision.triggers_action, autonomous: decision.autonomous } : null),
      decision_reasons: sec(decision ? decision.reason_codes : null),
      registry_entry: sec(registryEntry ? { experiment_id: registryEntry.experiment_id, status: registryEntry.status, evidence_status: registryEntry.evidence_status, causal_status: registryEntry.causal_status, statistical_status: registryEntry.statistical_status } : null),
      duplicate_id_check: sec(duplicateCheck || null),
      conflicts: sec(conflicts),
      unknowns: buildUnknowns({ baseline, metricContract, timeToSignal, statistics, evaluation }),
      limitations: sec([
        !design || design.design_type === 'UNKNOWN' ? 'no valid experiment design' : null,
        baseline && baseline.required && baseline.status !== 'BASELINE_VALID' ? `baseline ${baseline.status}` : null,
        variableMap && variableMap.contamination_status === 'MULTI_VARIABLE_CONTAMINATION' ? 'multi-variable contamination — causal attribution not identifiable' : null,
        statistics && statistics.status !== 'STATISTICAL_EVALUATION_VALID' ? `statistics: ${statistics.status}` : null,
      ].filter(Boolean)),
      integrity_status: sec(integrity ? { network_calls: integrity.network_calls, llm_calls: integrity.llm_calls, production_db_writes: integrity.production_db_writes, deploys: integrity.deploys, cost_usd: integrity.cost_usd, clean: integrity.clean, executes_experiments: integrity.executes_experiments } : null),
      boundary: {
        does_not_execute_experiments: true, does_not_modify_campaigns: true, does_not_spend_budget: true,
        does_not_deploy: true, does_not_write_production: true, does_not_feed_production_routing: true, no_autonomous_action: true,
      },
      evidence_appendix: { count: entries.length, entries },
      caveats: [
        'ASTRA-11K designs and evaluates experiments; it never runs one.',
        'The BECAUSE mechanism of a hypothesis is never proven causality.',
        'No expected lift, significance, causality, sample size, benchmark, conversion, revenue, margin or probabilistic confidence score is fabricated.',
        'A descriptive before/after difference is never presented as a causal effect.',
        'Multi-variable contamination makes causal attribution not identifiable.',
        'INCONCLUSIVE and INSUFFICIENT_EVIDENCE are valid results; no winner is forced.',
        'No ASTRA-11K output may feed production routing or autonomous action.',
      ],
      section_index: SECTION_NAMES,
    },
    evidence_graph_valid: graphErrors.length === 0,
    evidence_graph_errors: graphErrors.sort(),
  };
  report.section_names = Object.keys(report.sections);
  report.report_id = 'exr_' + sha256Hex(canonicalize({ ...report, report_id: undefined }));
  report.content_hash = report.report_id;
  return deepFreeze(report);
}

function buildUnknowns({ baseline, metricContract, timeToSignal, statistics, evaluation }) {
  const u = new Set();
  if (!baseline || baseline.status !== 'BASELINE_VALID') u.add('baseline');
  if (!metricContract || metricContract.status !== 'METRIC_CONTRACT_VALID') u.add('metric_contract');
  if (!timeToSignal || timeToSignal.signal_class === 'TIME_TO_SIGNAL_UNKNOWN') u.add('time_to_signal');
  if (!statistics || statistics.status !== 'STATISTICAL_EVALUATION_VALID') u.add('statistical_evaluation');
  if (!evaluation || !['EVALUATION_VALID'].includes(evaluation.status)) u.add('evaluation');
  return [...u].sort();
}

module.exports = { SECTION_NAMES, buildReport };
