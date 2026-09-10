'use strict';
// [ASTRA-11J] Funnel + Revenue Intelligence Engine — deterministic pipeline orchestrator.
//   business-supplied funnel counts / costs / revenue (+ optional 11H journey / 11I offer refs)
//   -> FunnelObservations -> scope-validated transition metrics -> volume/efficiency summary
//   -> cost / unit economics / revenue / margin / LTV / payback / ROAS / break-even
//   -> sales / booking / commerce funnels -> retention -> bottlenecks / leakage
//   -> diagnosis -> priorities -> completion -> report.
// Fully deterministic. NO LLM, NO web, NO I/O, NO clock (referenceTime caller-supplied).
// No ASTRA-11J output may feed production routing or autonomous action.
const FM = require('./funnel_model');
const FO = require('./funnel_observation');
const TM = require('./transition_metrics');
const DO = require('./dropoff');
const COST = require('./cost');
const UE = require('./unit_economics');
const REV = require('./revenue');
const MARGIN = require('./margin');
const LTV = require('./ltv');
const PB = require('./payback');
const RM = require('./roas_mer');
const BE = require('./break_even');
const SP = require('./sales_pipeline');
const BF = require('./booking_funnel');
const CF = require('./commerce_funnel');
const RET = require('./retention');
const IB = require('./internal_baseline');
const BN = require('./bottleneck');
const RL = require('./revenue_leakage');
const DX = require('./diagnosis');
const PRI = require('./priority');
const ATT = require('./attribution');
const CMP = require('./completion');
const REP = require('./report');

function runFunnelRevenue(opts) {
  const businessInput = opts.businessInput || {};
  const referenceTime = opts.referenceTime;
  if (!referenceTime) throw new Error('[ASTRA-11J] referenceTime is required (no implicit clock)');
  if (!businessInput.funnel) throw new Error('[ASTRA-11J] runFunnelRevenue: businessInput.funnel is required');

  const request = businessInput.request || {};

  // ---- FUNNEL MODEL (§A) ----
  const funnel = FM.makeFunnel(businessInput.funnel);
  { const v = FM.validateFunnel(funnel); if (!v.valid) throw new Error(`[ASTRA-11J] invalid CommercialFunnel: ${v.errors.join(' | ')}`); }

  // ---- FUNNEL OBSERVATIONS (§B) ----
  let observations = (businessInput.observations || []).map(FO.makeFunnelObservation);
  for (const o of observations) { const v = FO.validateFunnelObservation(o); if (!v.valid) throw new Error(`[ASTRA-11J] invalid FunnelObservation: ${v.errors.join(' | ')}`); }
  const dd = FO.dedupeObservations(observations);
  const dataConflicts = [];
  if (dd.duplicate_ids.length) dataConflicts.push({ dimension: 'DUPLICATE_OBSERVATIONS', count: dd.duplicate_ids.length });
  observations = dd.kept;
  const obsByKey = {};
  for (const o of observations) if (!(o.stage_key in obsByKey)) obsByKey[o.stage_key] = o;

  const attribution = ATT.resolveAttribution(businessInput);
  { const v = ATT.validateAttribution(attribution); if (!v.valid) throw new Error(`[ASTRA-11J] invalid AttributionContext: ${v.errors.join(' | ')}`); }

  // ---- TRANSITION METRICS along declared in-scope stage order (§C §D) ----
  const orderedKeys = funnel.stages.filter(s => s.in_scope).map(FM.stageKey);
  const transitions = [];
  for (let i = 0; i < orderedKeys.length - 1; i++) {
    const m = TM.computeTransition(obsByKey[orderedKeys[i]] || null, obsByKey[orderedKeys[i + 1]] || null, businessInput.transition_opts || {});
    const v = TM.validateTransitionMetric(m); if (!v.valid) throw new Error(`[ASTRA-11J] invalid FunnelTransitionMetric: ${v.errors.join(' | ')}`);
    transitions.push(m);
  }
  // caller-declared extra transitions (e.g. spanning rates)
  for (const [a, b] of (businessInput.extra_transitions || [])) {
    const m = TM.computeTransition(obsByKey[a] || null, obsByKey[b] || null, businessInput.transition_opts || {});
    TM.validateTransitionMetric(m); transitions.push(m);
  }
  const summary = DO.summarizeFunnel(transitions, orderedKeys, obsByKey);

  // ---- COSTS / UNIT ECONOMICS (§J §K) ----
  const costs = (businessInput.costs || []).map(COST.makeCost);
  for (const c of costs) { const v = COST.validateCost(c); if (!v.valid) throw new Error(`[ASTRA-11J] invalid CommercialCost: ${v.errors.join(' | ')}`); }
  const leadCount = obsByKey.LEAD ? obsByKey.LEAD.count : null;
  const purchaseCount = obsByKey.PURCHASE ? obsByKey.PURCHASE.count : (obsByKey.SOLD ? obsByKey.SOLD.count : null);
  const newCustomers = businessInput.new_customers != null ? Number(businessInput.new_customers) : purchaseCount;
  const unitEconomics = {
    CPL: UE.computeCPL({ costs, validLeads: businessInput.valid_leads != null ? Number(businessInput.valid_leads) : leadCount }),
    CPA: UE.computeCPA({ costs, actions: businessInput.cpa_actions != null ? Number(businessInput.cpa_actions) : purchaseCount, actionLabel: businessInput.cpa_action_label || 'purchase', includeTypes: businessInput.cpa_cost_types || ['MEDIA_SPEND'] }),
    CAC: UE.computeCAC({ costs, newCustomers, declaredAcquisitionTypes: businessInput.declared_acquisition_cost_types || null }),
  };
  for (const m of Object.values(unitEconomics)) { const v = UE.validateUnitEconomic(m); if (!v.valid) throw new Error(`[ASTRA-11J] invalid UnitEconomicMetric: ${v.errors.join(' | ')}`); }

  // ---- REVENUE / AOV-ARPU-ARPA / MARGIN (§L §M §N) ----
  const revenues = (businessInput.revenue || []).map(REV.makeRevenueObservation);
  for (const r of revenues) { const v = REV.validateRevenueObservation(r); if (!v.valid) throw new Error(`[ASTRA-11J] invalid RevenueObservation: ${v.errors.join(' | ')}`); }
  const grossRev = pick(revenues, 'GROSS');
  const netInput = businessInput.net_revenue_components || null;
  let netRevenue = null;
  if (netInput) {
    const d = REV.deriveNetRevenue(netInput);
    if (d.status === 'COMPUTED') netRevenue = REV.makeRevenueObservation({ revenue_type: 'NET', amount: d.value, currency: netInput.currency || (grossRev ? grossRev.currency : null), status: 'COMPUTED', source_class: 'COMPUTED' });
    if (netRevenue) netRevenue = Object.freeze({ ...netRevenue, derivation: d });
  } else {
    netRevenue = pick(revenues, 'NET');
  }
  const revForMetrics = grossRev || netRevenue;
  const aovArpuArpa = {
    AOV: REV.aov(revForMetrics ? revForMetrics.amount : null, revForMetrics ? revForMetrics.order_count : (businessInput.order_count != null ? Number(businessInput.order_count) : null)),
    ARPU: REV.arpu(revForMetrics ? revForMetrics.amount : null, revForMetrics ? revForMetrics.user_count : (businessInput.user_count != null ? Number(businessInput.user_count) : null)),
    ARPA: REV.arpa(revForMetrics ? revForMetrics.amount : null, revForMetrics ? revForMetrics.account_count : (businessInput.account_count != null ? Number(businessInput.account_count) : null)),
  };
  const mi = businessInput.margin_inputs || {};
  const margins = MARGIN.computeMargins({ revenue: revForMetrics ? revForMetrics.amount : null, cogs: numOrNull(mi.cogs), variable_cost: numOrNull(mi.variable_cost), variable_cost_components: mi.variable_cost_components || null, currency: revForMetrics ? revForMetrics.currency : null });
  { const v = MARGIN.validateMargins(margins); if (!v.valid) throw new Error(`[ASTRA-11J] invalid MarginAssessment: ${v.errors.join(' | ')}`); }
  const allRevenues = netRevenue && !revenues.includes(netRevenue) ? [...revenues, netRevenue] : revenues;

  // ---- LTV / PAYBACK / ROAS-MER / BREAK-EVEN (§P §Q §R §O) ----
  const ltv = LTV.buildLTV(businessInput.ltv_inputs || []);
  for (const l of ltv) { const v = LTV.validateLTV(l); if (!v.valid) throw new Error(`[ASTRA-11J] invalid LTVEstimate: ${v.errors.join(' | ')}`); }
  const cmr = mi.contribution_margin_ratio != null ? Number(mi.contribution_margin_ratio) : (margins.contribution_margin.status === 'COMPUTED' ? margins.contribution_margin.margin_ratio : null);
  const payback = PB.computePayback({ cac: unitEconomics.CAC.value, cac_is_lower_bound: unitEconomics.CAC.is_lower_bound, monthly_contribution_margin: numOrNull(businessInput.monthly_contribution_margin), monthly_revenue: numOrNull(businessInput.monthly_revenue_per_customer), contribution_margin_ratio: cmr });
  { const v = PB.validatePayback(payback); if (!v.valid) throw new Error(`[ASTRA-11J] invalid CACPayback: ${v.errors.join(' | ')}`); }
  const mediaSpend = sumCosts(costs, ['MEDIA_SPEND']);
  const roas = RM.computeROAS({ attributed_revenue: numOrNull(businessInput.attributed_revenue), ad_spend: mediaSpend, attribution });
  const mer = RM.computeMER({ total_revenue: revForMetrics ? revForMetrics.amount : null, total_media_spend: mediaSpend });
  for (const m of [roas, mer]) { const v = RM.validateAdEfficiency(m); if (!v.valid) throw new Error(`[ASTRA-11J] invalid AdEfficiencyMetric: ${v.errors.join(' | ')}`); }
  const breakEven = BE.computeBreakEven({ first_order_revenue: businessInput.first_order_revenue != null ? Number(businessInput.first_order_revenue) : (aovArpuArpa.AOV.status === 'COMPUTED' ? aovArpuArpa.AOV.value : null), contribution_margin_ratio: cmr, ltv_contribution: numOrNull(businessInput.ltv_contribution) });
  { const v = BE.validateBreakEven(breakEven); if (!v.valid) throw new Error(`[ASTRA-11J] invalid BreakEvenAssessment: ${v.errors.join(' | ')}`); }

  // ---- FUNNEL SHAPES (§S §T §U) ----
  const salesPipeline = SP.buildSalesPipeline({ obsByKey, customStates: businessInput.pipeline_custom_states || [], cycle: businessInput.sales_cycle || null, winLoss: businessInput.win_loss || [], opts: businessInput.transition_opts || {} });
  const bookingFunnel = BF.buildBookingFunnel({ obsByKey, opts: businessInput.transition_opts || {} });
  { const v = BF.validateBookingFunnel(bookingFunnel); if (!v.valid) throw new Error(`[ASTRA-11J] invalid BookingFunnel: ${v.errors.join(' | ')}`); }
  const commerceFunnel = businessInput.commerce_shape ? CF.buildCommerceFunnel({ shape: businessInput.commerce_shape, obsByKey, opts: businessInput.transition_opts || {} }) : null;

  // ---- RETENTION (§V) ----
  const retention = RET.buildRetention({ obsByKey, expansionRevenue: allRevenues.filter(r => r.revenue_type === 'EXPANSION'), opts: businessInput.transition_opts || {} });
  { const v = RET.validateRetention(retention); if (!v.valid) throw new Error(`[ASTRA-11J] invalid RetentionAssessment: ${v.errors.join(' | ')}`); }

  // ---- BASELINE COMPARISONS (§X §Y) ----
  const baselineComparisons = (businessInput.baseline_comparisons || []).map(bc => IB.compareToBaseline(bc));
  for (const b of baselineComparisons) { const v = IB.validateBaselineComparison(b); if (!v.valid) throw new Error(`[ASTRA-11J] invalid BaselineComparison: ${v.errors.join(' | ')}`); }

  // ---- BOTTLENECKS / LEAKAGE / OPPORTUNITY VALUE (§W §AA §AB) ----
  const bottlenecks = BN.buildBottleneckCandidates({ transitions, valuePerProgression: businessInput.value_per_progression || null, retention, suppliedBaselines: businessInput.transition_baselines || {} });
  for (const b of bottlenecks) { const v = BN.validateBottleneck(b); if (!v.valid) throw new Error(`[ASTRA-11J] invalid FunnelBottleneckCandidate: ${v.errors.join(' | ')}`); }
  const leakages = RL.buildRevenueLeakage({ transitions, valueAssumptions: businessInput.leakage_value_assumptions || {}, refunds: businessInput.refunds || null, churnUnits: obsByKey.CHURN ? { count: obsByKey.CHURN.count, evidence_refs: obsByKey.CHURN.evidence_refs } : null });
  for (const l of leakages) { const v = RL.validateLeakage(l); if (!v.valid) throw new Error(`[ASTRA-11J] invalid RevenueLeakageCandidate: ${v.errors.join(' | ')}`); }
  const opportunityValue = RL.buildOpportunityValue({ leakages, businessInput });
  { const v = RL.validateOpportunityValue(opportunityValue); if (!v.valid) throw new Error(`[ASTRA-11J] invalid OpportunityValue: ${v.errors.join(' | ')}`); }

  // ---- DIAGNOSIS / PRIORITY (§AC §AD) ----
  const diagnosis = DX.buildDiagnosis({ summary, transitions, bottlenecks, retention, margins, breakEven, roas, cac: unitEconomics.CAC, dataQuality: dataConflicts.length ? { issues: dataConflicts.map(c => c.dimension) } : null, volume_target: businessInput.volume_target });
  { const v = DX.validateDiagnosis(diagnosis); if (!v.valid) throw new Error(`[ASTRA-11J] invalid FunnelDiagnosis: ${v.errors.join(' | ')}`); }
  const priorities = PRI.prioritize({ bottlenecks, leakages, businessInput, weights: businessInput.priority_weights || null });
  for (const p of priorities) { const v = PRI.validatePriority(p); if (!v.valid) throw new Error(`[ASTRA-11J] invalid FunnelPriorityItem: ${v.errors.join(' | ')}`); }

  // ---- COVERAGE / COMPLETION ----
  const coverage = buildCoverage({ funnel, observations, transitions, costs, revenues: allRevenues, margins, retention, attribution, ltv });
  const completion = CMP.assessCompletion({ funnel, observations, transitions, costs, revenues: allRevenues, margins, unitEconomics, ltv, payback, attribution, retention, dataConflicts, businessInput });

  const report = REP.buildReport({
    request, referenceTime, funnel, observations, transitions, summary, costs, unitEconomics,
    revenues: allRevenues, aovArpuArpa, margins, roas, mer, ltv, payback, breakEven,
    salesPipeline, bookingFunnel, commerceFunnel, retention, bottlenecks, leakages, opportunityValue,
    diagnosis, priorities, conflicts: dataConflicts, coverage, completion, attribution, baselineComparisons,
  });

  return {
    report, funnel, observations, transitions, summary, attribution, costs, unitEconomics,
    revenues: allRevenues, aovArpuArpa, margins, ltv, payback, roas, mer, breakEven,
    salesPipeline, bookingFunnel, commerceFunnel, retention, baselineComparisons,
    bottlenecks, leakages, opportunityValue, diagnosis, priorities, coverage, completion, dataConflicts,
    provenance_note: 'ASTRA-11J deterministic pipeline. Metrics computed only from scope-compatible counts with valid denominators. Attribution is not causal. No metric, cost, revenue, margin, LTV, or lost-revenue figure is fabricated. No LLM. No production routing. No autonomous action.',
  };
}

function pick(list, type) { return list.find(r => r.revenue_type === type && r.amount != null) || null; }
function numOrNull(v) { return v == null || Number.isNaN(Number(v)) ? null : Number(v); }
function sumCosts(costs, types) { const c = costs.filter(x => types.includes(x.cost_type) && x.amount != null); return c.length ? Number(c.reduce((s, x) => s + x.amount, 0).toFixed(4)) : null; }

function buildCoverage({ funnel, observations, transitions, costs, revenues, margins, retention, attribution, ltv }) {
  const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
  const inScope = new Set(funnel.in_scope_stages);
  const observed = new Set(observations.filter(o => o.count != null).map(o => o.stage_key));
  const body = {
    schema_version: 'ucdm-funnel-revenue-1.0.0', kind: 'FunnelRevenueCoverage',
    in_scope_stages: inScope.size,
    observed_stages: [...inScope].filter(k => observed.has(k)).length,
    stage_coverage_ratio: inScope.size ? Number(([...inScope].filter(k => observed.has(k)).length / inScope.size).toFixed(4)) : 0,
    valid_transitions: transitions.filter(t => t.status === 'VALID').length,
    invalid_transitions: transitions.filter(t => t.status !== 'VALID').length,
    cost_types_present: [...new Set(costs.filter(c => c.amount != null).map(c => c.cost_type))].sort(),
    revenue_types_present: [...new Set(revenues.filter(r => r.amount != null).map(r => r.revenue_type))].sort(),
    has_margin: margins.gross_margin.status === 'COMPUTED' || margins.contribution_margin.status === 'COMPUTED',
    has_retention_rate: Object.values(retention.rates).some(r => r.status === 'VALID'),
    attribution_basis: attribution.basis,
    has_ltv_basis: ltv.some(l => l.status !== 'UNKNOWN'),
    limitations: [],
  };
  if (body.stage_coverage_ratio < 0.6) body.limitations.push('less than 60% of in-scope stages observed');
  if (body.invalid_transitions > 0) body.limitations.push(`${body.invalid_transitions} transitions unusable (scope/denominator)`);
  if (!body.has_margin) body.limitations.push('no margin data — unit economics partial');
  if (body.attribution_basis === 'UNKNOWN') body.limitations.push('no attribution basis — channel revenue/ROAS UNKNOWN');
  body.coverage_id = 'frcov_' + sha256Hex(canonicalize({ ...body, coverage_id: undefined }));
  return deepFreeze(body);
}

module.exports = { runFunnelRevenue };
