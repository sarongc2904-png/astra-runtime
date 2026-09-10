'use strict';
// [ASTRA-11M benchmark fixtures] Offline, mock-only. Zero network, zero LLM, zero persistence,
// zero cost. 8 business scenarios + 26 adversarial cases.
const REFERENCE_TIME = '2026-09-09T00:00:00Z';
const P_AUG = { start: '2026-08-01', end: '2026-08-31' };
const P_JUN = { start: '2026-06-01', end: '2026-06-30' };

// opportunity helper
function opp(x) {
  return Object.assign({
    source_engine: 'astra11j', source_report_id: 'fr_1', scope: { period: P_AUG },
    evidence_refs: ['e1'], evidence_strength: 'EVIDENCE_MODERATE', time_to_signal: 'SHORT',
    reversibility: 'REVERSIBLE',
  }, x);
}
// base engine call
function baseCall(x) {
  return Object.assign({
    businessId: 'biz_x', referenceTime: REFERENCE_TIME, decisionTimestamp: REFERENCE_TIME,
    scope: { period: P_AUG }, currentFunnelState: { tracking_status: 'VALID' },
    currentRevenueState: { revenue: 100000, margin_state: 'POSITIVE', trend: 'FLAT' },
    constraints: [], operationalCapacity: { state: 'OK' }, availableResources: { budget: 100000 },
    opportunities: [], memories: [], experiments: [],
  }, x);
}
function mem(x) {
  return Object.assign({
    memory_id: 'mem_1', memory_type: 'LEARNING', temporal_status: 'ACTIVE', scope: { period: P_AUG },
  }, x);
}

// ---------------- 8 BUSINESS SCENARIOS ----------------
const SCENARIOS = {
  // 1. Dental — many leads, low bookings, poor response process
  dental: baseCall({
    businessId: 'biz_dental',
    currentFunnelState: { tracking_status: 'VALID', downstream_bottleneck: 'lead_to_booking', stage_volumes: { leads: 800, bookings: 60 } },
    currentRevenueState: { revenue: 240000, margin_state: 'POSITIVE', trend: 'FLAT' },
    opportunities: [
      opp({ opportunity_id: 'd_process', affected_funnel_transition: 'lead_to_booking', affected_metric: 'response_process_speed', evidence_refs: ['d_e1', 'd_e2'], evidence_strength: 'EVIDENCE_STRONG', impact_basis: { affected_revenue: 90000, funnel_total_volume: 800, affected_volume: 400, currency: 'MXN' }, time_to_signal: 'SHORT', reversibility: 'EASILY_REVERSIBLE' }),
      opp({ opportunity_id: 'd_ads', affected_metric: 'acquisition_volume', evidence_refs: ['d_e3'], evidence_strength: 'EVIDENCE_WEAK', impact_basis: 'IMPACT_MEDIUM', time_to_signal: 'MEDIUM', action_hint: 'SCALE' }),
    ],
    memories: [mem({ memory_id: 'mem_d1', memory_type: 'DIAGNOSIS', claim: 'lead_to_booking is the bottleneck', semantic_target: 'lead_to_booking', scope: { period: P_JUN } })],
  }),

  // 2. Restaurant — traffic healthy, low repeat purchase
  restaurant: baseCall({
    businessId: 'biz_rest',
    currentFunnelState: { tracking_status: 'VALID', stage_volumes: { visits: 5000, first_orders: 1200, repeat_orders: 90 } },
    currentRevenueState: { revenue: 180000, margin_state: 'POSITIVE', trend: 'FLAT' },
    opportunities: [
      opp({ opportunity_id: 'r_repeat', affected_metric: 'repeat_purchase_rate', affected_funnel_transition: 'first_to_repeat', evidence_refs: ['r_e1', 'r_e2'], evidence_strength: 'EVIDENCE_MODERATE', impact_basis: { affected_revenue: 40000, currency: 'USD' }, time_to_signal: 'MEDIUM', reversibility: 'REVERSIBLE' }),
      opp({ opportunity_id: 'r_traffic', affected_metric: 'acquisition_volume', evidence_refs: ['r_e3'], evidence_strength: 'EVIDENCE_MODERATE', impact_basis: 'IMPACT_LOW', time_to_signal: 'SHORT', action_hint: 'SCALE' }),
    ],
  }),

  // 3. Ecommerce — checkout bottleneck + margin pressure
  ecommerce: baseCall({
    businessId: 'biz_ecom',
    currentFunnelState: { tracking_status: 'VALID', downstream_bottleneck: 'cart_to_purchase', stage_volumes: { sessions: 40000, carts: 6000, purchases: 900 } },
    currentRevenueState: { revenue: 500000, margin_state: 'NEGATIVE', margin: -0.04, trend: 'FLAT' },
    opportunities: [
      opp({ opportunity_id: 'e_checkout', affected_funnel_transition: 'cart_to_purchase', affected_metric: 'checkout_completion', evidence_refs: ['e_e1', 'e_e2'], evidence_strength: 'EVIDENCE_STRONG', impact_basis: { affected_revenue: 120000, currency: 'USD' }, time_to_signal: 'SHORT', reversibility: 'EASILY_REVERSIBLE' }),
      opp({ opportunity_id: 'e_scale', affected_metric: 'acquisition_traffic', evidence_refs: ['e_e3'], evidence_strength: 'EVIDENCE_MODERATE', impact_basis: 'IMPACT_HIGH', time_to_signal: 'MEDIUM', action_hint: 'SCALE' }),
      opp({ opportunity_id: 'e_margin', affected_metric: 'unit_margin_economics', evidence_refs: ['e_e4'], evidence_strength: 'EVIDENCE_MODERATE', impact_basis: { affected_margin_pct: 6 }, time_to_signal: 'MEDIUM', reversibility: 'REVERSIBLE' }),
    ],
  }),

  // 4. SaaS — activation weak, acquisition healthy
  saas: baseCall({
    businessId: 'biz_saas',
    currentFunnelState: { tracking_status: 'VALID', downstream_bottleneck: 'signup_to_activation', stage_volumes: { signups: 3000, activated: 600, paid: 180 } },
    currentRevenueState: { revenue: 320000, margin_state: 'POSITIVE', trend: 'GROWING' },
    opportunities: [
      opp({ opportunity_id: 's_activation', affected_funnel_transition: 'signup_to_activation', affected_metric: 'activation_rate', evidence_refs: ['s_e1', 's_e2'], evidence_strength: 'EVIDENCE_STRONG', impact_basis: { affected_revenue: 80000, currency: 'USD' }, time_to_signal: 'MEDIUM', reversibility: 'REVERSIBLE' }),
      opp({ opportunity_id: 's_acq', affected_metric: 'acquisition_volume', evidence_refs: ['s_e3'], evidence_strength: 'EVIDENCE_MODERATE', impact_basis: 'IMPACT_MEDIUM', time_to_signal: 'SHORT', action_hint: 'SCALE' }),
    ],
  }),

  // 5. Real estate — lead volume high, sales capacity saturated
  real_estate: baseCall({
    businessId: 'biz_re',
    currentFunnelState: { tracking_status: 'VALID', stage_volumes: { leads: 1200, qualified: 300, closed: 12 } },
    currentRevenueState: { revenue: 900000, margin_state: 'POSITIVE', trend: 'FLAT' },
    operationalCapacity: { state: 'SATURATED', sales_state: 'SATURATED', team_available: 2 },
    opportunities: [
      opp({ opportunity_id: 're_capacity', affected_metric: 'sales_capacity_process', affected_funnel_transition: 'qualified_to_closed', evidence_refs: ['re_e1', 're_e2'], evidence_strength: 'EVIDENCE_STRONG', impact_basis: { affected_revenue: 200000, currency: 'USD' }, time_to_signal: 'MEDIUM', reversibility: 'PARTIALLY_REVERSIBLE' }),
      opp({ opportunity_id: 're_leadgen', affected_metric: 'acquisition_leads', evidence_refs: ['re_e3'], evidence_strength: 'EVIDENCE_MODERATE', impact_basis: 'IMPACT_MEDIUM', time_to_signal: 'SHORT', action_hint: 'SCALE', resource_requirements: { team: 3 } }),
    ],
  }),

  // 6. Infoproduct — registrations high, attendance weak
  infoproduct: baseCall({
    businessId: 'biz_info',
    currentFunnelState: { tracking_status: 'VALID', downstream_bottleneck: 'registration_to_attendance', stage_volumes: { registrations: 2000, attended: 300, bought: 45 } },
    currentRevenueState: { revenue: 90000, margin_state: 'POSITIVE', trend: 'FLAT' },
    opportunities: [
      opp({ opportunity_id: 'i_attend', affected_funnel_transition: 'registration_to_attendance', affected_metric: 'attendance_rate', evidence_refs: ['i_e1', 'i_e2'], evidence_strength: 'EVIDENCE_MODERATE', impact_basis: { affected_revenue: 30000, currency: 'USD' }, time_to_signal: 'SHORT', reversibility: 'EASILY_REVERSIBLE' }),
      opp({ opportunity_id: 'i_reg', affected_metric: 'registration_volume', evidence_refs: ['i_e3'], evidence_strength: 'EVIDENCE_WEAK', impact_basis: 'IMPACT_LOW', time_to_signal: 'SHORT', action_hint: 'SCALE' }),
    ],
  }),

  // 7. Local service — show rate low, acquisition healthy
  local_service: baseCall({
    businessId: 'biz_local',
    currentFunnelState: { tracking_status: 'VALID', downstream_bottleneck: 'booking_to_show', stage_volumes: { bookings: 600, shows: 360, sales: 150 } },
    currentRevenueState: { revenue: 150000, margin_state: 'POSITIVE', trend: 'FLAT' },
    opportunities: [
      opp({ opportunity_id: 'l_show', affected_funnel_transition: 'booking_to_show', affected_metric: 'show_rate', evidence_refs: ['l_e1', 'l_e2'], evidence_strength: 'EVIDENCE_STRONG', impact_basis: { affected_revenue: 45000, currency: 'USD' }, time_to_signal: 'SHORT', reversibility: 'EASILY_REVERSIBLE' }),
      opp({ opportunity_id: 'l_acq', affected_metric: 'acquisition_volume', evidence_refs: ['l_e3'], evidence_strength: 'EVIDENCE_MODERATE', impact_basis: 'IMPACT_MEDIUM', time_to_signal: 'SHORT', action_hint: 'SCALE' }),
    ],
  }),

  // 8. Subscription — growth positive, churn severe
  subscription: baseCall({
    businessId: 'biz_sub',
    currentFunnelState: { tracking_status: 'VALID', stage_volumes: { trials: 4000, paid: 1000, retained_90d: 400 } },
    currentRevenueState: { revenue: 600000, margin_state: 'POSITIVE', trend: 'GROWING', churn_state: 'SPIKE', churn_change_pct: 60 },
    opportunities: [
      opp({ opportunity_id: 'sub_churn', affected_metric: 'churn_rate', affected_funnel_transition: 'paid_to_retained', evidence_refs: ['sub_e1', 'sub_e2'], evidence_strength: 'EVIDENCE_STRONG', impact_basis: { affected_revenue: 150000, currency: 'USD' }, time_to_signal: 'MEDIUM', reversibility: 'REVERSIBLE' }),
      opp({ opportunity_id: 'sub_growth', affected_metric: 'acquisition_volume', evidence_refs: ['sub_e3'], evidence_strength: 'EVIDENCE_MODERATE', impact_basis: 'IMPACT_MEDIUM', time_to_signal: 'SHORT', action_hint: 'SCALE' }),
    ],
  }),
};

// ---------------- 26 ADVERSARIAL CASES ----------------
const ADVERSARIAL = {
  insufficient_evidence: baseCall({ businessId: 'biz_a', opportunities: [opp({ opportunity_id: 'a1', affected_metric: 'x', evidence_refs: [], evidence_strength: 'EVIDENCE_NONE' })] }),

  memory_conflict: baseCall({
    businessId: 'biz_a',
    opportunities: [opp({ opportunity_id: 'a1', affected_metric: 'discount_depth', evidence_refs: ['a_e1'], evidence_strength: 'EVIDENCE_MODERATE' })],
    memories: [mem({ memory_id: 'mem_c1', memory_type: 'LEARNING', claim: 'deeper discount did not move discount_depth revenue', semantic_target: 'discount_depth', contradicts_direction: true, is_positive_learning: false, scope: { period: P_AUG } })],
  }),

  stale_memory: baseCall({
    businessId: 'biz_a',
    opportunities: [opp({ opportunity_id: 'a1', affected_metric: 'landing_conversion', evidence_refs: ['a_e1'], evidence_strength: 'EVIDENCE_MODERATE' })],
    memories: [mem({ memory_id: 'mem_s1', memory_type: 'LEARNING', claim: 'new landing improved landing_conversion', semantic_target: 'landing_conversion', temporal_status: 'STALE', staleness_class: 'STALE', is_positive_learning: true })],
    staleMemories: ['mem_s1'],
  }),

  invalidated_memory: baseCall({
    businessId: 'biz_a',
    opportunities: [opp({ opportunity_id: 'a1', affected_metric: 'email_cadence', evidence_refs: ['a_e1', 'inv_ref'], evidence_strength: 'EVIDENCE_MODERATE' })],
    memories: [mem({ memory_id: 'mem_i1', memory_type: 'LEARNING', claim: 'email cadence increase helped email_cadence', semantic_target: 'email_cadence', temporal_status: 'INVALIDATED' })],
    invalidatedMemories: ['inv_ref'],
  }),

  unresolved_dependency: baseCall({
    businessId: 'biz_a',
    currentFunnelState: { tracking_status: 'INVALID' },
    opportunities: [opp({ opportunity_id: 'a1', affected_metric: 'acquisition_spend', evidence_refs: ['a_e1'], evidence_strength: 'EVIDENCE_MODERATE', action_hint: 'SCALE', dependencies: ['VALID_TRACKING'] })],
    constraints: [{ type: 'DEPENDENCY_MISSING', dependency: 'VALID_TRACKING' }],
  }),

  budget_unavailable: baseCall({
    businessId: 'biz_a', availableResources: { budget: 100 },
    opportunities: [opp({ opportunity_id: 'a1', affected_metric: 'paid_acquisition', evidence_refs: ['a_e1'], evidence_strength: 'EVIDENCE_MODERATE', resource_requirements: { budget: 50000 } })],
  }),

  capacity_saturated: baseCall({
    businessId: 'biz_a', operationalCapacity: { state: 'SATURATED', sales_state: 'SATURATED', team_available: 1 },
    opportunities: [opp({ opportunity_id: 'a1', affected_metric: 'acquisition_leads', evidence_refs: ['a_e1'], evidence_strength: 'EVIDENCE_MODERATE', action_hint: 'SCALE', resource_requirements: { team: 4 } })],
  }),

  negative_margin: baseCall({
    businessId: 'biz_a', currentRevenueState: { revenue: 100000, margin_state: 'NEGATIVE', margin: -0.1, trend: 'FLAT' },
    opportunities: [opp({ opportunity_id: 'a1', affected_metric: 'acquisition_traffic', evidence_refs: ['a_e1'], evidence_strength: 'EVIDENCE_MODERATE', action_hint: 'SCALE' })],
  }),

  opportunity_value_unknown: baseCall({
    businessId: 'biz_a',
    opportunities: [opp({ opportunity_id: 'a1', affected_metric: 'nurture_flow', evidence_refs: ['a_e1'], evidence_strength: 'EVIDENCE_MODERATE', impact_basis: null })],
  }),

  scope_mismatch: baseCall({
    businessId: 'biz_a', scope: { period: P_AUG, geography: 'MX' },
    opportunities: [opp({ opportunity_id: 'a1', affected_metric: 'x', evidence_refs: ['a_e1'], scope: { period: P_AUG, geography: 'US' } })],
  }),

  cohort_mismatch: baseCall({
    businessId: 'biz_a', scope: { period: P_AUG, cohort: 'new' },
    opportunities: [opp({ opportunity_id: 'a1', affected_metric: 'x', evidence_refs: ['a_e1'], scope: { period: P_AUG, cohort: 'returning' } })],
  }),

  period_mismatch: baseCall({
    businessId: 'biz_a', scope: { period: P_AUG },
    opportunities: [opp({ opportunity_id: 'a1', affected_metric: 'x', evidence_refs: ['a_e1'], scope: { period: P_JUN } })],
  }),

  acquisition_vs_retention: baseCall({
    businessId: 'biz_a',
    opportunities: [
      opp({ opportunity_id: 'a_acq', affected_metric: 'acquisition_volume', evidence_refs: ['a_e1'], evidence_strength: 'EVIDENCE_MODERATE', impact_basis: 'IMPACT_MEDIUM' }),
      opp({ opportunity_id: 'a_ret', affected_metric: 'retention_rate', evidence_refs: ['a_e2'], evidence_strength: 'EVIDENCE_MODERATE', impact_basis: 'IMPACT_MEDIUM' }),
    ],
  }),

  growth_vs_capacity: baseCall({
    businessId: 'biz_a', operationalCapacity: { state: 'SATURATED', sales_state: 'SATURATED' },
    opportunities: [
      opp({ opportunity_id: 'a_growth', affected_metric: 'acquisition_volume', evidence_refs: ['a_e1'], evidence_strength: 'EVIDENCE_MODERATE', impact_basis: 'IMPACT_HIGH', action_hint: 'SCALE' }),
      opp({ opportunity_id: 'a_cap', affected_metric: 'fulfillment_process', evidence_refs: ['a_e2'], evidence_strength: 'EVIDENCE_MODERATE', impact_basis: 'IMPACT_MEDIUM' }),
    ],
  }),

  short_vs_long_term: baseCall({
    businessId: 'biz_a', cashUrgency: 'CRITICAL', currentRevenueState: { revenue: 100000, margin_state: 'POSITIVE', trend: 'DECLINING', runway_months: 2 },
    opportunities: [
      opp({ opportunity_id: 'a_short', affected_metric: 'checkout_fix', evidence_refs: ['a_e1'], evidence_strength: 'EVIDENCE_STRONG', impact_basis: 'IMPACT_HIGH', time_to_signal: 'IMMEDIATE' }),
      opp({ opportunity_id: 'a_long', affected_metric: 'brand_positioning', evidence_refs: ['a_e2'], evidence_strength: 'EVIDENCE_MODERATE', impact_basis: 'IMPACT_HIGH', time_to_signal: 'LONG', proposed_action: 'TEST' }),
    ],
  }),

  repeated_failed_experiment: baseCall({
    businessId: 'biz_a',
    opportunities: [opp({ opportunity_id: 'a1', affected_metric: 'popup_optin', evidence_refs: ['a_e1'], evidence_strength: 'EVIDENCE_MODERATE' })],
    memories: [mem({ memory_id: 'mem_f1', memory_type: 'LEARNING', claim: 'exit popup did not move popup_optin', semantic_target: 'popup_optin', is_positive_learning: false, outcome: 'FAILED', scope: { period: P_AUG } })],
  }),

  repeated_failed_but_justified: baseCall({
    businessId: 'biz_a', repeatJustifications: { /* filled by opportunity_id at runtime in test */ },
    opportunities: [opp({ opportunity_id: 'a1', affected_metric: 'popup_optin', evidence_refs: ['a_e1'], evidence_strength: 'EVIDENCE_STRONG' })],
    memories: [mem({ memory_id: 'mem_f1', memory_type: 'LEARNING', claim: 'exit popup did not move popup_optin', semantic_target: 'popup_optin', is_positive_learning: false, outcome: 'FAILED', scope: { period: P_JUN } })],
  }),

  irreversible_weak_evidence: baseCall({
    businessId: 'biz_a',
    opportunities: [opp({ opportunity_id: 'a1', affected_metric: 'pricing_model_change', evidence_refs: ['a_e1'], evidence_strength: 'EVIDENCE_WEAK', reversibility: 'HARD_TO_REVERSE', impact_basis: { structural_change: true } })],
  }),

  high_impact_but_blocked: baseCall({
    businessId: 'biz_a', constraints: [{ type: 'legal_compliance', severity: 'CRITICAL', note: 'legal hold' }],
    opportunities: [opp({ opportunity_id: 'a1', affected_metric: 'x', evidence_refs: ['a_e1'], evidence_strength: 'EVIDENCE_STRONG', impact_basis: 'IMPACT_HIGH' })],
  }),

  low_impact_fast_signal: baseCall({
    businessId: 'biz_a',
    opportunities: [opp({ opportunity_id: 'a1', affected_metric: 'button_copy', evidence_refs: ['a_e1'], evidence_strength: 'EVIDENCE_MODERATE', impact_basis: 'IMPACT_LOW', time_to_signal: 'IMMEDIATE' })],
  }),

  no_valid_primary_decision: baseCall({
    businessId: 'biz_a',
    opportunities: [
      opp({ opportunity_id: 'a1', affected_metric: 'x', evidence_refs: [], evidence_strength: 'EVIDENCE_NONE' }),
      opp({ opportunity_id: 'a2', affected_metric: 'y', evidence_refs: [], evidence_strength: 'EVIDENCE_NONE' }),
    ],
  }),

  malformed_candidate: baseCall({
    businessId: 'biz_a',
    opportunities: [{ opportunity_id: 'a1', scope: { period: P_AUG } }],
  }),

  duplicate_decision_identity: baseCall({
    businessId: 'biz_a',
    opportunities: [
      opp({ opportunity_id: 'a1', affected_metric: 'checkout_fix', evidence_refs: ['a_e1'], evidence_strength: 'EVIDENCE_MODERATE' }),
      opp({ opportunity_id: 'a1_dup', affected_metric: 'checkout_fix', evidence_refs: ['a_e1'], evidence_strength: 'EVIDENCE_MODERATE' }),
    ],
  }),

  all_actions_blocked: baseCall({
    businessId: 'biz_a', constraints: [{ type: 'cash', severity: 'CRITICAL', blocking: true }],
    opportunities: [
      opp({ opportunity_id: 'a1', affected_metric: 'x', evidence_refs: ['a_e1'], evidence_strength: 'EVIDENCE_STRONG', resource_requirements: { budget: 999999 } }),
      opp({ opportunity_id: 'a2', affected_metric: 'y', evidence_refs: ['a_e2'], evidence_strength: 'EVIDENCE_STRONG', resource_requirements: { budget: 999999 } }),
    ],
    availableResources: { budget: 1 },
  }),

  conflicting_priorities: baseCall({
    businessId: 'biz_a',
    opportunities: [
      opp({ opportunity_id: 'a1', affected_metric: 'm1', evidence_refs: ['a_e1'], evidence_strength: 'EVIDENCE_WEAK', impact_basis: 'IMPACT_UNKNOWN', time_to_signal: 'MEDIUM', reversibility: 'REVERSIBLE' }),
      opp({ opportunity_id: 'a2', affected_metric: 'm2', evidence_refs: ['a_e2'], evidence_strength: 'EVIDENCE_WEAK', impact_basis: 'IMPACT_UNKNOWN', time_to_signal: 'MEDIUM', reversibility: 'REVERSIBLE' }),
    ],
  }),

  missing_business_id: baseCall({ businessId: undefined }),

  downstream_bottleneck: baseCall({
    businessId: 'biz_a',
    currentFunnelState: { tracking_status: 'VALID', downstream_bottleneck: 'trial_to_paid' },
    opportunities: [opp({ opportunity_id: 'a1', affected_metric: 'acquisition_traffic', evidence_refs: ['a_e1'], evidence_strength: 'EVIDENCE_STRONG', impact_basis: 'IMPACT_HIGH', action_hint: 'SCALE' })],
  }),

  deterministic_rerun: baseCall({
    businessId: 'biz_a',
    opportunities: [opp({ opportunity_id: 'a1', affected_metric: 'checkout_fix', evidence_refs: ['a_e1', 'a_e2'], evidence_strength: 'EVIDENCE_STRONG', impact_basis: { affected_revenue: 20000 }, time_to_signal: 'SHORT' })],
  }),
};

module.exports = { REFERENCE_TIME, P_AUG, P_JUN, opp, baseCall, mem, SCENARIOS, ADVERSARIAL };
