'use strict';
// [ASTRA-11J benchmark] Frozen deterministic Funnel + Revenue fixtures. Business-supplied
// funnel counts / costs / revenue only. NO real data, NO network, NO LLM.
// 6 verticals + ecommerce + subscription + 26 adversarial cases.
const REFERENCE_TIME = '2026-09-09T00:00:00Z';
const P = Object.freeze({ start: '2026-08-01T00:00:00Z', end: '2026-09-01T00:00:00Z', tz: 'UTC', aggregation: 'MONTH' });
const P_JUL = Object.freeze({ start: '2026-07-01T00:00:00Z', end: '2026-08-01T00:00:00Z', tz: 'UTC', aggregation: 'MONTH' });

function obs(stage, count, e, extra) { return { stage, count, status: 'USER_PROVIDED', period: P, evidence_refs: [e], ...(extra || {}) }; }
function cost(cost_type, amount, e, extra) { return { cost_type, amount, currency: 'MXN', status: 'USER_PROVIDED', period: P, evidence_refs: [e], ...(extra || {}) }; }
function rev(revenue_type, amount, e, extra) { return { revenue_type, amount, currency: 'MXN', status: 'USER_PROVIDED', period: P, evidence_refs: [e], ...(extra || {}) }; }

// --- BOOKING vertical baseline (dental / laser / local service / b2b) ---
function bookingBase(ref, mult = 1) {
  const m = (n) => Math.round(n * mult);
  return {
    funnel: { funnel_kind: 'BOOKING', stages: ['CONVERSATION', 'QUALIFIED', 'BOOKED', 'ATTENDED', 'SOLD'] },
    observations: [obs('CONVERSATION', m(400), ref + '1'), obs('QUALIFIED', m(240), ref + '2'), obs('BOOKED', m(160), ref + '3'), obs('ATTENDED', m(100), ref + '4'), obs('SOLD', m(40), ref + '5'), obs('LEAD', m(400), ref + '1')],
    costs: [cost('MEDIA_SPEND', 20000, ref + '6'), cost('SALES_COST', 8000, ref + '7')],
    declared_acquisition_cost_types: ['MEDIA_SPEND', 'SALES_COST'],
    new_customers: m(40),
    revenue: [rev('GROSS', m(40) * 6000, ref + '8', { order_count: m(40), customer_count: m(40), user_count: m(40) })],
    margin_inputs: { variable_cost: m(40) * 6000 * 0.35, cogs: m(40) * 6000 * 0.45, contribution_margin_ratio: 0.65 },
    ltv_inputs: [{ methodology: 'OBSERVED_COHORT_LTV', observed_cohort: { customers: m(40), cumulative_revenue: m(40) * 6000, window_days: 30 }, currency: 'MXN', input_refs: [ref + '8'] }],
    monthly_contribution_margin: 3900,
    attribution_basis: 'SOURCE_REPORTED', attributed_revenue: m(40) * 6000 * 0.8,
    first_order_revenue: 6000, ltv_contribution: 12000,
    value_per_progression: { value: 1500, currency: 'MXN', status: 'MODELLED', methodology: 'avg deal value * close rate', input_refs: [ref + 'a'], high_threshold: 200000 },
  };
}

// --- ecommerce baseline ---
function commerceBase(ref) {
  return {
    funnel: { funnel_kind: 'ECOMMERCE', stages: ['VISIT', 'PRODUCT_VIEW', 'ADD_TO_CART', 'CHECKOUT', 'PURCHASE'] },
    commerce_shape: 'ECOMMERCE',
    observations: [obs('VISIT', 20000, ref + '1'), obs('PRODUCT_VIEW', 9000, ref + '2'), obs('ADD_TO_CART', 2400, ref + '3'), obs('CHECKOUT', 1200, ref + '4'), obs('PURCHASE', 600, ref + '5')],
    costs: [cost('MEDIA_SPEND', 60000, ref + '6'), cost('PAYMENT_FEE', 3000, ref + '7')],
    declared_acquisition_cost_types: ['MEDIA_SPEND'],
    new_customers: 600,
    revenue: [rev('GROSS', 600 * 800, ref + '8', { order_count: 600, customer_count: 600, user_count: 600 })],
    margin_inputs: { variable_cost: 600 * 800 * 0.5, cogs: 600 * 800 * 0.6, contribution_margin_ratio: 0.5 },
    ltv_inputs: [{ methodology: 'HISTORICAL_AVERAGE_LTV', historical: { total_revenue: 5000000, total_customers: 4000 }, currency: 'MXN', input_refs: [ref + 'h'] }],
    monthly_contribution_margin: 200,
    attribution_basis: 'LAST_TOUCH', attributed_revenue: 600 * 800 * 0.9,
    first_order_revenue: 800,
    value_per_progression: { value: 300, currency: 'MXN', status: 'MODELLED', methodology: 'AOV * checkout completion', input_refs: [ref + 'a'], high_threshold: 500000 },
  };
}

// --- subscription / SaaS-like baseline ---
function subscriptionBase(ref) {
  return {
    funnel: { funnel_kind: 'SUBSCRIPTION', stages: ['LEAD', 'WEBINAR', 'OFFER', 'CHECKOUT', 'PURCHASE', 'ACTIVATED', 'RETAINED', 'RENEWED'] },
    commerce_shape: 'WEBINAR',
    observations: [obs('LEAD', 3000, ref + '1'), obs('WEBINAR', 1200, ref + '2'), obs('OFFER', 900, ref + '3'), obs('CHECKOUT', 300, ref + '4'), obs('PURCHASE', 210, ref + '5'), obs('ACTIVATED', 180, ref + '6', { cohort: '2026-08', cohort_basis: 'COHORT_METRIC' }), obs('RETAINED', 120, ref + '7', { cohort: '2026-08', cohort_basis: 'COHORT_METRIC' }), obs('RENEWED', 90, ref + '8', { cohort: '2026-08', cohort_basis: 'COHORT_METRIC' })],
    costs: [cost('MEDIA_SPEND', 90000, ref + '9'), cost('SOFTWARE', 12000, ref + '10'), cost('SALES_COST', 30000, ref + '11')],
    declared_acquisition_cost_types: ['MEDIA_SPEND', 'SALES_COST', 'SOFTWARE'],
    new_customers: 210,
    revenue: [rev('RECURRING', 210 * 1200, ref + '12', { account_count: 210, user_count: 210, order_count: 210 }), rev('GROSS', 210 * 1200, ref + '12', { account_count: 210, user_count: 210, order_count: 210 }), rev('EXPANSION', 40000, ref + '13', { cohort: '2026-08' })],
    margin_inputs: { variable_cost: 210 * 1200 * 0.2, cogs: 210 * 1200 * 0.25, contribution_margin_ratio: 0.8 },
    ltv_inputs: [{ methodology: 'MODELLED_LTV', arpu_churn: { arpu: 1200, churn_rate: 0.08, authorized: true }, currency: 'MXN', input_refs: [ref + 'm'] }, { methodology: 'OBSERVED_COHORT_LTV', observed_cohort: { customers: 210, cumulative_revenue: 210 * 1200 * 3, window_days: 90 }, currency: 'MXN', input_refs: [ref + '12'] }],
    monthly_contribution_margin: 960,
    attribution_basis: 'USER_PROVIDED', attributed_revenue: 210 * 1200,
    first_order_revenue: 1200, ltv_contribution: 20000,
    value_per_progression: { value: 800, currency: 'MXN', status: 'MODELLED', methodology: 'ARPA', input_refs: [ref + 'a'], high_threshold: 300000 },
  };
}

const VERTICALS = {
  dental: bookingBase('vd', 1),
  laser_aesthetics: bookingBase('vl', 0.6),
  restaurant: bookingBase('vr', 0.4),
  local_service: bookingBase('vp', 0.5),
  b2b_service: (() => { const b = bookingBase('vb', 0.3); b.funnel = { funnel_kind: 'B2B', stages: ['LEAD', 'CONTACTED', 'QUALIFIED', 'OPPORTUNITY', 'PROPOSAL', 'WON'] }; b.observations = [obs('LEAD', 200, 'vb1'), obs('CONTACTED', 150, 'vb2'), obs('QUALIFIED', 90, 'vb3'), obs('OPPORTUNITY', 50, 'vb4'), obs('PROPOSAL', 30, 'vb5'), obs('WON', 12, 'vb6')]; b.new_customers = 12; b.revenue = [rev('GROSS', 12 * 30000, 'vb7', { order_count: 12, customer_count: 12, account_count: 12, user_count: 12 })]; b.win_loss = [{ outcome: 'WON', reason: 'price fit', count: 12, rep: 'A' }, { outcome: 'LOST', reason: 'budget', count: 18, rep: 'B' }]; b.sales_cycle = { days: 45, basis: 'USER_PROVIDED', from: 'LEAD', to: 'WON' }; return b; })(),
  digital_education: subscriptionBase('ve'),
  ecommerce: commerceBase('vc'),
  subscription: subscriptionBase('vs'),
};

// helper to deep-clone a base and mutate
function clone(b) { return JSON.parse(JSON.stringify(b)); }

const ADVERSARIAL = {
  missing_denominator: (() => { const b = clone(bookingBase('am')); delete b.observations[1].count; b.observations[1].status = 'UNKNOWN'; return b; })(),
  zero_denominator: (() => { const b = clone(bookingBase('az')); b.observations[0].count = 0; return b; })(),
  mismatched_time_periods: (() => { const b = clone(bookingBase('at')); b.observations[2].period = P_JUL; return b; })(),
  cohort_mismatch: (() => { const b = clone(bookingBase('ac')); b.observations[3].cohort = '2026-08'; b.observations[3].cohort_basis = 'COHORT_METRIC'; return b; })(),
  mixed_currencies: (() => { const b = clone(bookingBase('ax')); b.observations[2].currency = 'USD'; b.observations[3].currency = 'MXN'; return b; })(),
  mixed_channels: (() => { const b = clone(bookingBase('ah')); b.observations[0].channel = 'paid_social'; b.observations[1].channel = 'referral'; return b; })(),
  duplicate_observations: (() => { const b = clone(bookingBase('ad')); b.observations.push(clone(b.observations[1])); return b; })(),
  ad_spend_no_sales_cost: (() => { const b = clone(bookingBase('as')); b.costs = [cost('MEDIA_SPEND', 20000, 'as6')]; b.declared_acquisition_cost_types = ['MEDIA_SPEND', 'SALES_COST']; return b; })(),
  revenue_without_customer_count: (() => { const b = clone(bookingBase('ar')); b.revenue = [rev('GROSS', 240000, 'ar8')]; delete b.new_customers; return b; })(),
  customer_count_without_revenue: (() => { const b = clone(bookingBase('au')); b.revenue = []; b.new_customers = 40; return b; })(),
  gross_presented_as_net: (() => { const b = clone(bookingBase('ag')); b.revenue = [rev('NET', 240000, 'ag8', { order_count: 40, customer_count: 40 })]; b.net_revenue_components = null; return b; })(),
  missing_variable_cost: (() => { const b = clone(bookingBase('av')); delete b.margin_inputs.variable_cost; delete b.margin_inputs.contribution_margin_ratio; return b; })(),
  fake_break_even_temptation: (() => { const b = clone(bookingBase('abe')); b.margin_inputs = { cogs: 40 * 6000 * 0.45 }; delete b.first_order_revenue; delete b.ltv_contribution; return b; })(),
  fake_ltv_temptation: (() => { const b = clone(bookingBase('alt')); b.ltv_inputs = [{ methodology: 'MODELLED_LTV', arpu_churn: { arpu: 6000, churn_rate: 0.1 /* NOT authorized */ }, currency: 'MXN', input_refs: ['x'] }]; return b; })(),
  short_cohort: (() => { const b = clone(subscriptionBase('ash')); b.ltv_inputs = [{ methodology: 'OBSERVED_COHORT_LTV', observed_cohort: { customers: 210, cumulative_revenue: 210 * 1200, window_days: 7 }, currency: 'MXN', input_refs: ['x'] }]; return b; })(),
  high_cpl_high_close: (() => { const b = clone(bookingBase('ahc')); b.costs = [cost('MEDIA_SPEND', 120000, 'ahc6'), cost('SALES_COST', 8000, 'ahc7')]; b.observations[3].count = 90; b.observations[4].count = 70; b.new_customers = 70; b.revenue = [rev('GROSS', 70 * 6000, 'ahc8', { order_count: 70, customer_count: 70 })]; return b; })(),
  cheap_leads_low_qualification: (() => { const b = clone(bookingBase('acl')); b.costs = [cost('MEDIA_SPEND', 4000, 'acl6'), cost('SALES_COST', 8000, 'acl7')]; b.observations[1].count = 60; b.observations[2].count = 40; b.observations[3].count = 25; b.observations[4].count = 10; b.new_customers = 10; b.revenue = [rev('GROSS', 60000, 'acl8', { order_count: 10, customer_count: 10 })]; return b; })(),
  strong_booking_poor_show: (() => { const b = clone(bookingBase('abs')); b.observations[2].count = 220; b.observations[3].count = 70; b.observations[4].count = 28; b.new_customers = 28; b.revenue = [rev('GROSS', 168000, 'abs8', { order_count: 28, customer_count: 28 })]; return b; })(),
  high_show_poor_close: (() => { const b = clone(bookingBase('ahs')); b.observations[3].count = 150; b.observations[4].count = 20; b.new_customers = 20; b.revenue = [rev('GROSS', 120000, 'ahs8', { order_count: 20, customer_count: 20 })]; return b; })(),
  strong_acquisition_poor_retention: (() => { const b = clone(subscriptionBase('aap')); b.observations[6].count = 40; b.observations[7].count = 20; return b; })(),
  high_roas_poor_contribution: (() => { const b = clone(bookingBase('arp')); b.attributed_revenue = 700000; b.margin_inputs = { variable_cost: 40 * 6000 * 1.05, contribution_margin_ratio: -0.05, cogs: 40 * 6000 * 0.9 }; b.monthly_contribution_margin = 60; delete b.ltv_contribution; b.first_order_revenue = 6000; return b; })(),
  low_roas_strong_repeat: (() => { const b = clone(subscriptionBase('alr')); b.attributed_revenue = 40000; b.costs = [cost('MEDIA_SPEND', 200000, 'alr9'), cost('SALES_COST', 10000, 'alr11')]; b.observations.push(obs('REPEAT_PURCHASE', 150, 'alrr', { cohort: '2026-08', cohort_basis: 'COHORT_METRIC' })); b.observations[4].cohort = '2026-08'; b.observations[4].cohort_basis = 'COHORT_METRIC'; return b; })(),
  attribution_ambiguity: (() => { const b = clone(bookingBase('aa')); b.attribution_basis = 'unclear'; return b; })(),
  period_vs_cohort_confusion: (() => { const b = clone(bookingBase('apc')); b.observations[0].cohort_basis = 'PERIOD_METRIC'; b.observations[4].cohort = '2026-06'; b.observations[4].cohort_basis = 'COHORT_METRIC'; return b; })(),
  delta_without_causality: (() => { const b = clone(bookingBase('adc')); b.baseline_comparisons = [{ current: 0.4, baseline: 0.3, kind: 'PREVIOUS_PERIOD', is_rate: true }]; return b; })(),
  small_volume_extreme_rate: (() => { const b = clone(bookingBase('asv')); b.observations = [obs('CONVERSATION', 5, 'asv1'), obs('QUALIFIED', 5, 'asv2'), obs('BOOKED', 4, 'asv3'), obs('ATTENDED', 3, 'asv4'), obs('SOLD', 3, 'asv5'), obs('LEAD', 5, 'asv1')]; b.new_customers = 3; b.revenue = [rev('GROSS', 18000, 'asv8', { order_count: 3, customer_count: 3 })]; return b; })(),
  lost_revenue_exaggeration_temptation: (() => { const b = clone(bookingBase('alx')); delete b.value_per_progression; b.leakage_value_assumptions = {}; return b; })(),
};

module.exports = { REFERENCE_TIME, P, P_JUL, VERTICALS, ADVERSARIAL, obs, cost, rev, bookingBase, commerceBase, subscriptionBase, clone };
