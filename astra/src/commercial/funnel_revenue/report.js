'use strict';
// [ASTRA-11J §AE] FunnelRevenueReport. No fabricated narrative metrics. Reproducible from
// identical inputs. Missing sections stay UNKNOWN. No LLM, no web, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const SECTION_NAMES = Object.freeze([
  'executive_summary', 'scope', 'data_coverage', 'funnel_definition', 'stage_counts',
  'transition_rates', 'drop_offs', 'volume_vs_efficiency', 'channel_views', 'segment_views',
  'offer_views', 'cohort_views', 'acquisition_costs', 'unit_economics', 'revenue',
  'aov_arpu_arpa', 'margins', 'roas_mer', 'ltv', 'payback', 'break_even', 'sales_pipeline',
  'booking_funnel', 'commerce_funnel', 'retention', 'expansion', 'bottleneck_candidates',
  'revenue_leakage_candidates', 'opportunity_value', 'diagnoses', 'priorities',
  'conflicts_data_mismatches', 'unknowns', 'limitations', 'evidence_appendix',
]);

function sec(v) {
  const empty = v == null || (Array.isArray(v) && v.length === 0) || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0);
  return empty ? { status: 'UNKNOWN' } : v;
}

function buildReport(x) {
  const {
    request = {}, referenceTime = null, funnel = null, observations = [], transitions = [], summary = null,
    costs = [], unitEconomics = {}, revenues = [], aovArpuArpa = {}, margins = null, roas = null, mer = null,
    ltv = [], payback = null, breakEven = null, salesPipeline = null, bookingFunnel = null, commerceFunnel = null,
    retention = null, bottlenecks = [], leakages = [], opportunityValue = null, diagnosis = null, priorities = [],
    conflicts = [], coverage = null, completion = null, attribution = null, baselineComparisons = [],
  } = x;

  const seen = new Set(); const entries = [];
  const add = (er) => { if (er && !seen.has(er)) { seen.add(er); entries.push({ evidence_ref: er }); } };
  for (const o of observations) for (const er of o.evidence_refs) add(er);
  for (const c of costs) for (const er of c.evidence_refs) add(er);
  for (const r of revenues) for (const er of r.evidence_refs) add(er);
  entries.sort((a, b) => (a.evidence_ref < b.evidence_ref ? -1 : a.evidence_ref > b.evidence_ref ? 1 : 0));
  const appendixRefs = new Set(entries.map(e => e.evidence_ref));

  const graphErrors = [];
  for (const t of transitions) if (t.status === 'VALID') for (const er of t.evidence_refs) if (er && !appendixRefs.has(er)) graphErrors.push(`transition ${t.metric_id} -> evidence ${er} not in appendix`);
  for (const b of bottlenecks) for (const er of b.evidence_refs) if (er && !appendixRefs.has(er)) graphErrors.push(`bottleneck ${b.bottleneck_id} -> evidence ${er} not in appendix`);

  const byField = (field) => {
    const m = {};
    for (const o of observations) { const v = o[field] || null; if (v == null) continue; (m[v] = m[v] || []).push({ stage: o.stage_key, count: o.count }); }
    return Object.keys(m).length ? m : null;
  };

  const report = {
    schema_version: 'ucdm-funnel-revenue-1.0.0',
    downstream_schema_versions: { ucdm: 'ucdm-1.0.0', voc: 'ucdm-voc-1.0.0', customer_model: 'ucdm-customer-model-1.0.0', journey: 'ucdm-journey-1.0.0', positioning_offer: 'ucdm-positioning-offer-1.0.0' },
    request_ref: request.request_id || null,
    reference_time: referenceTime,
    generated_by: 'deterministic:ucdm/funnel_revenue',
    counts: { observations: observations.length, valid_transitions: transitions.filter(t => t.status === 'VALID').length, bottlenecks: bottlenecks.length, leakages: leakages.length, priorities: priorities.length },
    sections: {
      executive_summary: sec(completion ? { status: completion.status, reason_codes: completion.reason_codes, primary_diagnosis: diagnosis ? diagnosis.primary_diagnosis : 'UNKNOWN', valid_transitions: transitions.filter(t => t.status === 'VALID').length } : null),
      scope: { objectives: request.objectives || [], funnel_kind: funnel ? funnel.funnel_kind : null, in_scope_stages: funnel ? funnel.in_scope_stages : [], attribution_basis: attribution ? attribution.basis : 'UNKNOWN' },
      data_coverage: sec(coverage),
      funnel_definition: sec(funnel ? { funnel_id: funnel.funnel_id, funnel_kind: funnel.funnel_kind, stages: funnel.stages.map(s => ({ stage: s.stage, key: s.custom_key || s.stage, in_scope: s.in_scope })) } : null),
      stage_counts: sec(observations.map(o => ({ stage: o.stage_key, count: o.count, status: o.status, period: [o.period.start, o.period.end], cohort_basis: o.cohort_basis, channel: o.channel, segment: o.segment }))),
      transition_rates: sec(transitions.map(t => ({ from: t.from_stage, to: t.to_stage, status: t.status, conversion_rate: t.conversion_rate, reason: t.reason || null, denominator_note: t.denominator_note }))),
      drop_offs: sec(transitions.filter(t => t.status === 'VALID').map(t => ({ from: t.from_stage, to: t.to_stage, drop_off_count: t.drop_off_count, drop_off_rate: t.drop_off_rate, causal: false }))),
      volume_vs_efficiency: sec(summary ? { volume: summary.volume, largest_absolute_loss: summary.largest_absolute_loss, weakest_conversion: summary.weakest_conversion, note: summary.volume_vs_efficiency_note } : null),
      channel_views: sec(byField('channel')),
      segment_views: sec(byField('segment')),
      offer_views: sec(byField('offer')),
      cohort_views: sec(byField('cohort')),
      acquisition_costs: sec(costs.map(c => ({ cost_type: c.cost_type, amount: c.amount, currency: c.currency, status: c.status, is_acquisition_cost: c.is_acquisition_cost }))),
      unit_economics: sec(Object.fromEntries(Object.entries(unitEconomics).map(([k, m]) => [k, m ? { status: m.status, value: m.value, cost_coverage: m.cost_coverage || null, is_lower_bound: m.is_lower_bound || false } : { status: 'UNKNOWN' }]))),
      revenue: sec(revenues.map(r => ({ revenue_type: r.revenue_type, amount: r.amount, currency: r.currency, status: r.status, derivation: r.derivation || null }))),
      aov_arpu_arpa: sec(aovArpuArpa),
      margins: sec(margins ? { gross_margin: margins.gross_margin, contribution_margin: margins.contribution_margin, distinct: margins.distinct } : null),
      roas_mer: sec({ roas: roas ? { status: roas.status, value: roas.value, attribution_basis: roas.attribution_basis } : { status: 'UNKNOWN' }, mer: mer ? { status: mer.status, value: mer.value } : { status: 'UNKNOWN' }, interchangeable: false }),
      ltv: sec(ltv.map(l => ({ methodology: l.methodology, status: l.status, value: l.value, is_modelled: l.is_modelled }))),
      payback: sec(payback ? { status: payback.status, payback_months: payback.payback_months, reason: payback.reason } : null),
      break_even: sec(breakEven ? { status: breakEven.status, break_even_cac: breakEven.break_even_cac, break_even_roas: breakEven.break_even_roas, allowable_acquisition_cost: breakEven.allowable_acquisition_cost } : null),
      sales_pipeline: sec(salesPipeline && salesPipeline.applicable ? { states: salesPipeline.states, rates: salesPipeline.rates, cycle_duration: salesPipeline.cycle_duration, win_loss_reasons: salesPipeline.win_loss_reasons } : { status: 'NOT_APPLICABLE' }),
      booking_funnel: sec(bookingFunnel && bookingFunnel.applicable ? { counts: bookingFunnel.counts, rates: bookingFunnel.rates } : { status: 'NOT_APPLICABLE' }),
      commerce_funnel: sec(commerceFunnel && commerceFunnel.applicable ? { shape: commerceFunnel.shape, counts: commerceFunnel.counts, rates: commerceFunnel.rates } : { status: 'NOT_APPLICABLE' }),
      retention: sec(retention ? { counts: retention.counts, rates: retention.rates, churn_probability: retention.churn_probability } : null),
      expansion: sec(retention ? retention.expansion_revenue : null),
      bottleneck_candidates: sec(bottlenecks.map(b => ({ transition: b.transition, reason_codes: b.reason_codes, economic_impact: b.economic_impact, is_fact: b.is_fact, causal_claim: b.causal_claim }))),
      revenue_leakage_candidates: sec(leakages.map(l => ({ source: l.leakage_source, lost_units: l.lost_units, value_estimate: { status: l.value_estimate.status, amount: l.value_estimate.amount || null }, is_fact: l.is_fact }))),
      opportunity_value: sec(opportunityValue ? { status: opportunityValue.status, total: opportunityValue.total, currency: opportunityValue.currency, methodology: opportunityValue.methodology } : null),
      diagnoses: sec(diagnosis ? { primary_diagnosis: diagnosis.primary_diagnosis, finding_types: diagnosis.finding_types, findings: diagnosis.findings, causal: diagnosis.causal } : null),
      priorities: sec(priorities.map(p => ({ target_kind: p.target_kind, target_key: p.target_key, priority_band: p.priority_band, priority_score: p.priority_score, triggers_action: p.triggers_action }))),
      conflicts_data_mismatches: sec(conflicts.concat(transitions.filter(t => t.status === 'SCOPE_MISMATCH').map(t => ({ dimension: 'SCOPE_MISMATCH', from: t.from_stage, to: t.to_stage, mismatches: t.scope_mismatches })))),
      unknowns: buildUnknowns({ transitions, unitEconomics, margins, ltv, payback, roas, retention }),
      limitations: sec(completion ? completion.reason_codes : (coverage ? coverage.limitations : null)),
      evidence_appendix: { count: entries.length, entries },
    },
    baseline_comparisons: baselineComparisons.map(b => ({ baseline_kind: b.baseline_kind, comparable: b.comparability.comparable, delta: b.delta })),
    evidence_graph_valid: graphErrors.length === 0,
    evidence_graph_errors: graphErrors.sort(),
    completion_status: completion ? completion.status : null,
    caveats: [
      'Metrics are computed only from scope-compatible counts with a positive denominator; otherwise UNKNOWN.',
      'Volume (counts) and efficiency (conversion) are reported separately — a weak result can be a volume problem.',
      'Different time periods and cohort bases are never silently compared.',
      'Attribution is reported/positional, never causal; multi-touch attribution is never fabricated.',
      'CPL, CPA and CAC are distinct; CAC is a lower bound when declared acquisition cost types are missing.',
      'Net revenue is never derived without its components; AOV/ARPU/ARPA use their own denominators.',
      'Gross margin and contribution margin are distinct; no cost of goods or variable cost is assumed.',
      'LTV methodology is explicit; a modelled LTV is labelled MODELLED, never observed.',
      'ROAS and MER are not interchangeable; ROAS carries its attribution basis.',
      'Bottlenecks and leakage figures are analytical, non-causal; no "$X lost" is fabricated.',
      'No statistical significance is claimed.',
      'No ASTRA-11J output may feed production routing or autonomous action.',
    ],
  };
  report.section_names = Object.keys(report.sections);
  report.report_id = 'frr_' + sha256Hex(canonicalize({ ...report, report_id: undefined }));
  report.content_hash = report.report_id;
  return deepFreeze(report);
}

function buildUnknowns({ transitions, unitEconomics, margins, ltv, payback, roas, retention }) {
  const u = new Set();
  if (transitions.some(t => t.status !== 'VALID')) u.add('some_transition_rates');
  for (const [k, m] of Object.entries(unitEconomics)) if (!m || m.status === 'UNKNOWN') u.add('unit_economics.' + k);
  if (!margins || margins.gross_margin.status !== 'COMPUTED') u.add('gross_margin');
  if (!margins || margins.contribution_margin.status !== 'COMPUTED') u.add('contribution_margin');
  if (ltv.every(l => l.status === 'UNKNOWN')) u.add('ltv');
  if (!payback || payback.status !== 'COMPUTED') u.add('payback');
  if (!roas || roas.status !== 'COMPUTED') u.add('roas');
  if (!retention || Object.values(retention.rates).every(r => r.status !== 'VALID')) u.add('retention_rates');
  return [...u].sort();
}

module.exports = { SECTION_NAMES, buildReport };
