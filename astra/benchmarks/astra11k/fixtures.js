'use strict';
// [ASTRA-11K benchmark] Frozen deterministic Experiment-Intelligence fixtures.
// A validated ASTRA-11J funnel/revenue result + an analyst-supplied experiment spec.
// NO real data, NO network, NO LLM. 8 vertical scenarios + 26 adversarial cases.
const FR = require('../../src/commercial/funnel_revenue');

const REFERENCE_TIME = '2026-09-09T00:00:00Z';
const P = Object.freeze({ start: '2026-08-01T00:00:00Z', end: '2026-09-01T00:00:00Z', tz: 'UTC', aggregation: 'MONTH' });
const P_JUL = Object.freeze({ start: '2026-07-01T00:00:00Z', end: '2026-08-01T00:00:00Z', tz: 'UTC', aggregation: 'MONTH' });

function obs(stage, count, extra) { return { stage, count, status: 'USER_PROVIDED', period: P, evidence_refs: ['e_' + stage], ...(extra || {}) }; }
function cost(t, a) { return { cost_type: t, amount: a, currency: 'MXN', status: 'USER_PROVIDED', period: P, evidence_refs: ['e_' + t] }; }
function rev(a, extra) { return { revenue_type: 'GROSS', amount: a, currency: 'MXN', status: 'USER_PROVIDED', period: P, evidence_refs: ['e_rev'], ...(extra || {}) }; }

function funnel(stages, counts, kind, extra) {
  const bi = {
    funnel: { funnel_kind: kind || 'CUSTOM', stages },
    observations: stages.map((s, i) => obs(s, counts[i])),
    costs: [cost('MEDIA_SPEND', 20000), cost('SALES_COST', 8000)],
    declared_acquisition_cost_types: ['MEDIA_SPEND', 'SALES_COST'],
    new_customers: counts[counts.length - 1],
    revenue: [rev(counts[counts.length - 1] * 3000, { order_count: counts[counts.length - 1], customer_count: counts[counts.length - 1], user_count: counts[counts.length - 1], account_count: counts[counts.length - 1] })],
    margin_inputs: { variable_cost: counts[counts.length - 1] * 3000 * 0.35, contribution_margin_ratio: 0.65, cogs: counts[counts.length - 1] * 3000 * 0.45 },
    value_per_progression: { value: 800, currency: 'MXN', status: 'MODELLED', methodology: 'avg value * downstream rate', input_refs: ['a_vpp'], high_threshold: 300000 },
    ...(extra || {}),
  };
  return FR.engine.runFunnelRevenue({ businessInput: bi, referenceTime: REFERENCE_TIME });
}

// a clean, WELL-FORMED experiment spec anchored on a primary_metric
function spec(primary, over) {
  return {
    business_id: 'biz1',
    hypothesis: { independent_variable: 'change X', target_population: 'scope pop', expected_direction: 'INCREASE', mechanism_hypothesis: 'a clearer prompt helps prospects self-identify fit', primary_metric: primary },
    metric_contract: { primary_metric: primary, primary_metric_definition: primary + ' on same period', secondary_metrics: ['secondary_rate'], guardrails: ['cpl', 'cancellation_rate', 'gross_margin'] },
    design: { design_type: 'CONTROL_VS_TREATMENT', allocation: 'RANDOM', unit_of_assignment: 'unit', treatment: 'variant B', control: 'variant A' },
    baseline: { value: 0.5, metric_definition: primary + ' on same period', scope: { period: P, cohort_basis: 'PERIOD_METRIC' } },
    treatment_scope: { period: P, cohort_basis: 'PERIOD_METRIC' },
    denominator_definition: 'upstream count', primary_denominator_count: 400,
    observation_window: { start: P.start, end: P.end }, unit_of_analysis: 'unit',
    time_to_signal_inputs: { primary_event_frequency_per_week: 100, min_events_for_signal: 200, sales_cycle_days: 2, outcome_delay_days: 0 },
    outcomes: { primary: { before: 0.5, after: 0.58 }, guardrails: { cpl: { before: 50, after: 50 }, cancellation_rate: { before: 0.1, after: 0.1 }, gross_margin: { before: 0.45, after: 0.45 } } },
    sample: { control_n: 200, treatment_n: 200, events_observed: 400 }, min_events: 200,
    timestamps: { created_at: REFERENCE_TIME, started_at: REFERENCE_TIME, completed_at: REFERENCE_TIME },
    experiment_id: 'exp-' + primary,
    impact_reference: 300000,
    ...(over || {}),
  };
}

const SCENARIOS = {
  dental: { fr: () => funnel(['CONVERSATION', 'QUALIFIED', 'BOOKED', 'ATTENDED', 'SOLD'], [800, 220, 160, 100, 40], 'BOOKING'), spec: () => spec('qualification_rate') },
  restaurant: { fr: () => funnel(['VISIT', 'LEAD', 'PURCHASE'], [5000, 400, 60], 'B2C'), spec: () => spec('visit_to_purchase_rate') },
  ecommerce: { fr: () => funnel(['VISIT', 'PRODUCT_VIEW', 'ADD_TO_CART', 'CHECKOUT', 'PURCHASE'], [20000, 9000, 2400, 1200, 300], 'ECOMMERCE', { commerce_shape: 'ECOMMERCE' }), spec: () => spec('checkout_completion_rate') },
  saas: { fr: () => funnel(['LEAD', 'CHECKOUT', 'PURCHASE', 'ACTIVATED'], [3000, 300, 210, 90], 'SUBSCRIPTION'), spec: () => spec('activation_rate') },
  real_estate: { fr: () => funnel(['LEAD', 'CONTACTED', 'QUALIFIED', 'OPPORTUNITY'], [1200, 800, 120, 40], 'B2B'), spec: () => spec('qualification_rate') },
  infoproduct: { fr: () => funnel(['LEAD', 'WEBINAR', 'OFFER', 'PURCHASE'], [4000, 900, 600, 120], 'WEBINAR', { commerce_shape: 'WEBINAR' }), spec: () => spec('webinar_show_rate') },
  local_service: { fr: () => funnel(['CONVERSATION', 'QUALIFIED', 'BOOKED', 'ATTENDED', 'SOLD'], [600, 400, 300, 120, 60], 'BOOKING'), spec: () => spec('show_rate') },
  subscription_churn: { fr: () => funnel(['PURCHASE', 'ACTIVATED', 'RETAINED', 'RENEWED'], [400, 360, 150, 90], 'SUBSCRIPTION'), spec: () => spec('renewal_rate', { outcomes: { primary: { before: 0.4, after: 0.41 }, guardrails: { cpl: { before: 50, after: 50 }, cancellation_rate: { before: 0.1, after: 0.1 }, gross_margin: { before: 0.45, after: 0.45 } } } }) },
};

function base() { return { fr: funnel(['CONVERSATION', 'QUALIFIED', 'BOOKED', 'ATTENDED', 'SOLD'], [800, 220, 160, 100, 40], 'BOOKING'), s: spec('qualification_rate') }; }
function withSpec(over) { const b = base(); return { funnelRevenueResult: b.fr, experimentSpec: { ...b.s, ...over } }; }

const ADVERSARIAL = {
  zero_denominator: withSpec({ primary_denominator_count: 0 }),
  no_baseline: withSpec({ baseline: null }),
  scope_mismatch: withSpec({ baseline: { value: 0.5, scope: { period: P, cohort_basis: 'PERIOD_METRIC', channel: 'paid_social' } }, treatment_scope: { period: P, cohort_basis: 'PERIOD_METRIC', channel: 'referral' } }),
  period_mismatch: withSpec({ baseline: { value: 0.5, scope: { period: P_JUL, cohort_basis: 'PERIOD_METRIC' } }, treatment_scope: { period: P, cohort_basis: 'PERIOD_METRIC' } }),
  cohort_mismatch: withSpec({ baseline: { value: 0.5, scope: { period: P, cohort_basis: 'COHORT_METRIC', cohort: '2026-07' } }, treatment_scope: { period: P, cohort_basis: 'COHORT_METRIC', cohort: '2026-08' } }),
  multi_variable_contamination: withSpec({ variables: { independent_variables: ['script', 'price', 'landing_page'], also_changing: [] } }),
  insufficient_data: withSpec({ sample: { control_n: 5, treatment_n: 5, events_observed: 8 }, min_events: 200 }),
  primary_metric_missing: withSpec({ hypothesis: { independent_variable: 'x', target_population: 'y', expected_direction: 'INCREASE', mechanism_hypothesis: 'z' }, metric_contract: { primary_metric: null, guardrails: ['cpl'] } }),
  guardrail_deterioration: withSpec({ outcomes: { primary: { before: 0.5, after: 0.6 }, guardrails: { cpl: { before: 50, after: 70 }, cancellation_rate: { before: 0.1, after: 0.1 }, gross_margin: { before: 0.45, after: 0.45 } } } }),
  incomplete_outcome: withSpec({ outcomes: { guardrails: {} } }),
  early_stopping: withSpec({ sample: { control_n: 40, treatment_n: 40, events_observed: 60 }, min_events: 400, invalidation_conditions: ['EARLY_STOPPING_WITHOUT_RULE'] }),
  different_attribution_basis: withSpec({ supplied_statistics: { test_name: 't-test', p_value: 0.03, alpha: 0.05, sample_size_control: 200, sample_size_treatment: 200, computed_by: 'analyst', attribution_basis: 'LAST_TOUCH' }, design: { design_type: 'BEFORE_AFTER_DESCRIPTIVE' } }),
  margin_degradation: withSpec({ outcomes: { primary: { before: 0.5, after: 0.62 }, guardrails: { cpl: { before: 50, after: 50 }, cancellation_rate: { before: 0.1, after: 0.1 }, gross_margin: { before: 0.45, after: 0.30 } } } }),
  delayed_outcome: withSpec({ time_to_signal_inputs: { sales_cycle_days: 120, outcome_delay_days: 30 }, outcomes: { guardrails: {} } }),
  contaminated_control: withSpec({ design: { design_type: 'CONTROL_VS_TREATMENT', allocation: 'RANDOM', control_contaminated: true, treatment: 'B', control: 'A' } }),
  incompatible_treatment_population: withSpec({ design: { design_type: 'CONTROL_VS_TREATMENT', allocation: 'RANDOM', treatment_population_comparable: false, treatment: 'B', control: 'A' } }),
  descriptive_presented_as_causal: withSpec({ design: { design_type: 'BEFORE_AFTER_DESCRIPTIVE', treatment: 'B', control: 'before' } }),
  invalid_significance_claim: withSpec({ supplied_statistics: { test_name: 'chi2', p_value: 1.7, alpha: 0.05, sample_size_control: -1, computed_by: '' } }),
  missing_currency: withSpec({}),
  missing_acquisition_cost_component: (() => {
    const b = base();
    const fr2 = funnel(['CONVERSATION', 'QUALIFIED', 'BOOKED', 'ATTENDED', 'SOLD'], [800, 220, 160, 100, 40], 'BOOKING', { costs: [cost('MEDIA_SPEND', 20000)], declared_acquisition_cost_types: ['MEDIA_SPEND', 'SALES_COST'] });
    return { funnelRevenueResult: fr2, experimentSpec: b.s };
  })(),
  simpson_segmentation_conflict: withSpec({ variables: { independent_variables: ['script'], confounders: ['segment_mix_shift'], also_changing: ['segment_mix_shift'] } }),
  treatment_leakage: withSpec({ design: { design_type: 'CONTROL_VS_TREATMENT', allocation: 'RANDOM', treatment_leakage: true, treatment: 'B', control: 'A' } }),
  duplicate_experiment_id: withSpec({ other_supplied_ids: ['exp-qualification_rate'], other_registry_entries: [] }),
  malformed_hypothesis: withSpec({ hypothesis: { independent_variable: 'x', mechanism_hypothesis: 'this proves the change causes higher conversion' } }),
  descriptive_lift_valid: withSpec({ design: { design_type: 'BEFORE_AFTER_DESCRIPTIVE', treatment: 'new copy', control: 'old copy' }, baseline: { value: 0.5, scope: { period: P_JUL, cohort_basis: 'PERIOD_METRIC' } } }),
  time_to_signal_unknown: withSpec({ time_to_signal_inputs: {} }),
  deterministic_rerun: withSpec({}),
};

module.exports = { REFERENCE_TIME, P, P_JUL, SCENARIOS, ADVERSARIAL, funnel, spec, base, withSpec };
