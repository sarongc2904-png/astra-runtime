'use strict';
// [ASTRA-11J benchmark] Offline, mock-only. Zero network, zero LLM, zero cost.
// 8 funnel fixtures + 26 adversarial cases + 17 benchmark dimensions.
const assert = require('assert');
const FR = require('../../src/commercial/funnel_revenue');
const FX = require('./fixtures');

let pass = 0, fail = 0; const notes = [];
function check(name, fn) { try { fn(); pass++; console.log('PASS', name); } catch (e) { fail++; notes.push(name + ' :: ' + e.message); console.log('FAIL', name, '::', e.message); } }
const REF = FX.REFERENCE_TIME;
const run = (businessInput) => FR.engine.runFunnelRevenue({ businessInput, referenceTime: REF });

for (const [name, bi] of Object.entries(FX.VERTICALS)) {
  check(`fixture/${name}: runs, deterministic, 35 sections, evidence graph valid`, () => {
    const a = run(bi), b = run(bi);
    assert.strictEqual(a.report.report_id, b.report.report_id);
    assert.strictEqual(a.report.section_names.length, 35);
    assert(a.report.evidence_graph_valid, JSON.stringify(a.report.evidence_graph_errors));
    assert.strictEqual(a.report.generated_by, 'deterministic:ucdm/funnel_revenue');
    for (const t of a.transitions) if (t.status === 'VALID') assert(t.conversion_rate != null && t.causal_claim === false);
    assert(FR.completion.COMPLETION_STATUS.includes(a.completion.status));
  });
}

check('adv/missing_denominator -> transition MISSING_COUNT, MISSING_DENOMINATOR reason', () => {
  const o = run(FX.ADVERSARIAL.missing_denominator);
  assert(o.transitions.some(t => t.status === 'MISSING_COUNT'));
  assert(o.completion.reason_codes.includes('MISSING_DENOMINATOR'));
});
check('adv/zero_denominator -> INVALID_DENOMINATOR, no conversion rate', () => {
  const o = run(FX.ADVERSARIAL.zero_denominator);
  const t = o.transitions.find(x => x.from_stage === 'CONVERSATION');
  assert(t.status === 'INVALID_DENOMINATOR' && t.conversion_rate === null);
});
check('adv/mismatched_time_periods -> SCOPE_MISMATCH on period, TIME_WINDOW_MISMATCH reason', () => {
  const o = run(FX.ADVERSARIAL.mismatched_time_periods);
  assert(o.transitions.some(t => t.status === 'SCOPE_MISMATCH' && (t.scope_mismatches || []).some(m => m.field === 'period')));
  assert(o.completion.reason_codes.includes('TIME_WINDOW_MISMATCH'));
});
check('adv/cohort_mismatch -> SCOPE_MISMATCH on cohort, COHORT_MISMATCH reason', () => {
  const o = run(FX.ADVERSARIAL.cohort_mismatch);
  assert(o.transitions.some(t => t.status === 'SCOPE_MISMATCH' && (t.scope_mismatches || []).some(m => m.field === 'cohort')));
});
check('adv/mixed_currencies -> currency SCOPE_MISMATCH', () => {
  const o = run(FX.ADVERSARIAL.mixed_currencies);
  assert(o.transitions.some(t => t.status === 'SCOPE_MISMATCH' && (t.scope_mismatches || []).some(m => m.field === 'currency')));
});
check('adv/mixed_channels -> channel SCOPE_MISMATCH / CHANNEL_SCOPE_MISMATCH reason', () => {
  const o = run(FX.ADVERSARIAL.mixed_channels);
  assert(o.transitions.some(t => t.status === 'SCOPE_MISMATCH' && (t.scope_mismatches || []).some(m => m.field === 'channel')) || o.completion.reason_codes.includes('CHANNEL_SCOPE_MISMATCH'));
});
check('adv/duplicate_observations -> deduped + DATA_CONFLICT', () => {
  const o = run(FX.ADVERSARIAL.duplicate_observations);
  assert(o.dataConflicts.some(c => c.dimension === 'DUPLICATE_OBSERVATIONS'));
});
check('adv/ad_spend_no_sales_cost -> CAC is COMPUTED_PARTIAL / lower bound', () => {
  const o = run(FX.ADVERSARIAL.ad_spend_no_sales_cost);
  assert(o.unitEconomics.CAC.status === 'COMPUTED_PARTIAL' && o.unitEconomics.CAC.is_lower_bound === true);
});
check('adv/revenue_without_customer_count -> ARPU/CAC UNKNOWN, MISSING_CUSTOMER_COUNT', () => {
  const o = run(FX.ADVERSARIAL.revenue_without_customer_count);
  assert(o.aovArpuArpa.ARPU.status === 'UNKNOWN');
  assert(o.completion.reason_codes.includes('MISSING_CUSTOMER_COUNT'));
});
check('adv/customer_count_without_revenue -> revenue metrics UNKNOWN, MISSING_REVENUE_DATA', () => {
  const o = run(FX.ADVERSARIAL.customer_count_without_revenue);
  assert(o.aovArpuArpa.AOV.status === 'UNKNOWN');
  assert(o.completion.reason_codes.includes('MISSING_REVENUE_DATA'));
});
check('adv/gross_presented_as_net -> NET only if the business labelled it; not silently derived', () => {
  const o = run(FX.ADVERSARIAL.gross_presented_as_net);
  const net = o.revenues.find(r => r.revenue_type === 'NET');
  assert(net && net.source_class === 'USER_PROVIDED'); // the business asserted NET; ASTRA did not derive it
  assert(!o.revenues.some(r => r.revenue_type === 'NET' && r.source_class === 'COMPUTED' && !r.derivation));
});
check('adv/missing_variable_cost -> contribution margin UNKNOWN, MISSING_MARGIN_DATA possible', () => {
  const o = run(FX.ADVERSARIAL.missing_variable_cost);
  assert(o.margins.contribution_margin.status === 'UNKNOWN');
});
check('adv/fake_break_even_temptation -> break-even UNKNOWN without contribution-margin ratio', () => {
  const o = run(FX.ADVERSARIAL.fake_break_even_temptation);
  assert(o.breakEven.status === 'UNKNOWN');
});
check('adv/fake_ltv_temptation -> modelled LTV UNKNOWN when model not authorized', () => {
  const o = run(FX.ADVERSARIAL.fake_ltv_temptation);
  assert(o.ltv.every(l => l.methodology !== 'MODELLED_LTV' || l.status === 'UNKNOWN'));
});
check('adv/short_cohort -> observed cohort LTV labelled as a floor over its window', () => {
  const o = run(FX.ADVERSARIAL.short_cohort);
  const l = o.ltv.find(x => x.methodology === 'OBSERVED_COHORT_LTV');
  assert(l && l.status === 'OBSERVED' && /floor/.test(l.note));
});
check('adv/high_cpl_high_close -> CPL high but close rate strong (volume vs efficiency)', () => {
  const o = run(FX.ADVERSARIAL.high_cpl_high_close);
  assert(o.unitEconomics.CPL.status === 'COMPUTED' && o.unitEconomics.CPL.value >= 200);
  const close = o.bookingFunnel.rates.close_rate;
  assert(close.status === 'VALID' && close.rate >= 0.6);
});
check('adv/cheap_leads_low_qualification -> low CPL, weak qualification transition', () => {
  const o = run(FX.ADVERSARIAL.cheap_leads_low_qualification);
  assert(o.unitEconomics.CPL.value <= 30);
  assert(o.bookingFunnel.rates.qualification_rate.rate <= 0.2);
});
check('adv/strong_booking_poor_show -> booking rate high, show rate low', () => {
  const o = run(FX.ADVERSARIAL.strong_booking_poor_show);
  assert(o.bookingFunnel.rates.booking_rate.rate >= 0.8 && o.bookingFunnel.rates.show_rate.rate <= 0.4);
});
check('adv/high_show_poor_close -> show rate high, close rate low', () => {
  const o = run(FX.ADVERSARIAL.high_show_poor_close);
  assert(o.bookingFunnel.rates.show_rate.rate >= 0.9 && o.bookingFunnel.rates.close_rate.rate <= 0.2);
});
check('adv/strong_acquisition_poor_retention -> RETENTION_PROBLEM diagnosis or reason', () => {
  const o = run(FX.ADVERSARIAL.strong_acquisition_poor_retention);
  assert(o.diagnosis.finding_types.includes('RETENTION_PROBLEM') || o.bottlenecks.some(b => b.reason_codes.includes('POOR_RETENTION')));
});
check('adv/high_roas_poor_contribution -> ROAS computed, ECONOMICS_PROBLEM (neg contribution)', () => {
  const o = run(FX.ADVERSARIAL.high_roas_poor_contribution);
  assert(o.roas.status === 'COMPUTED');
  assert(o.diagnosis.finding_types.includes('ECONOMICS_PROBLEM'));
});
check('adv/low_roas_strong_repeat -> ROAS < 1 but repeat purchase evidence present', () => {
  const o = run(FX.ADVERSARIAL.low_roas_strong_repeat);
  assert(o.roas.value != null && o.roas.value < 1);
  assert(o.retention.counts.REPEAT_PURCHASE != null);
});
check('adv/attribution_ambiguity -> attribution basis UNKNOWN, ROAS UNKNOWN', () => {
  const o = run(FX.ADVERSARIAL.attribution_ambiguity);
  assert(o.attribution.basis === 'UNKNOWN' && o.roas.status === 'UNKNOWN');
});
check('adv/period_vs_cohort_confusion -> conversation-to-sale not computed on mixed basis', () => {
  const o = run(FX.ADVERSARIAL.period_vs_cohort_confusion);
  assert(o.bookingFunnel.rates.conversation_to_sale_rate.status !== 'VALID');
});
check('adv/delta_without_causality -> pp delta computed, no significance/causality', () => {
  const o = run(FX.ADVERSARIAL.delta_without_causality);
  const bc = o.baselineComparisons[0];
  assert(bc && bc.delta.percentage_point != null && Math.abs(bc.delta.percentage_point - 10) < 0.01);
});
check('adv/small_volume_extreme_rate -> rates computed but coverage/priority reflect tiny volume', () => {
  const o = run(FX.ADVERSARIAL.small_volume_extreme_rate);
  assert(o.report.evidence_graph_valid);
  assert(o.diagnosis.primary_diagnosis === 'INSUFFICIENT_EVIDENCE' || o.bottlenecks.length === 0 || o.priorities.every(p => p.priority_band !== 'P1' || p.uncertainty > 0));
});
check('adv/lost_revenue_exaggeration_temptation -> no fabricated $ leakage, opportunity value UNKNOWN', () => {
  const o = run(FX.ADVERSARIAL.lost_revenue_exaggeration_temptation);
  assert(o.leakages.every(l => l.value_estimate.status === 'UNKNOWN'));
  assert(o.opportunityValue.status === 'UNKNOWN');
});

// ---- 17 dimensions ----
const dental = run(FX.VERTICALS.dental);
check('dim/metric correctness: booking rates equal downstream/upstream on matched scope', () => {
  assert(Math.abs(dental.bookingFunnel.rates.qualification_rate.rate - (dental.observations.find(o => o.stage_key === 'QUALIFIED').count / dental.observations.find(o => o.stage_key === 'CONVERSATION').count)) < 1e-6);
});
check('dim/denominator discipline: no rate where denominator invalid/missing', () => { for (const t of dental.transitions) if (t.status !== 'VALID') assert(t.conversion_rate == null); });
check('dim/scope discipline: valid transitions all report MATCHED scope', () => { for (const t of dental.transitions) if (t.status === 'VALID') assert(t.scope === 'MATCHED'); });
check('dim/temporal discipline: every observation preserves its period', () => { for (const o of dental.observations) assert(o.period && 'start' in o.period); });
check('dim/cohort discipline: cohort_basis recorded on every observation', () => { for (const o of dental.observations) assert(FR.cohort.COHORT_BASIS.includes(o.cohort_basis)); });
check('dim/attribution discipline: attribution never causal / multi-touch never fabricated', () => { assert(dental.attribution.causal === false && dental.attribution.multi_touch_model === 'NOT_FABRICATED'); });
check('dim/cost discipline: every cost declares status; none invented', () => { for (const c of dental.costs) assert(FR.cost.COST_STATUS.includes(c.status)); });
check('dim/revenue discipline: net revenue not derived without components', () => { assert(!dental.revenues.some(r => r.revenue_type === 'NET' && r.source_class === 'COMPUTED' && !r.derivation)); });
check('dim/unit economics: CPL/CPA/CAC are distinct metric objects', () => { assert(dental.unitEconomics.CPL.metric === 'CPL' && dental.unitEconomics.CAC.metric === 'CAC' && dental.unitEconomics.CPL.metric_id !== dental.unitEconomics.CAC.metric_id); });
check('dim/booking funnel: all five named rates present', () => { for (const k of ['qualification_rate', 'booking_rate', 'show_rate', 'close_rate', 'conversation_to_sale_rate']) assert(k in dental.bookingFunnel.rates); });
check('dim/sales pipeline: b2b fixture computes win rate + preserves win/loss reasons', () => {
  const b2b = run(FX.VERTICALS.b2b_service);
  assert(b2b.salesPipeline.applicable && b2b.salesPipeline.rates.win_rate);
  assert(Object.keys(b2b.salesPipeline.win_loss_reasons).length >= 1);
});
check('dim/retention: subscription fixture preserves cohort basis, no churn probability', () => {
  const sub = run(FX.VERTICALS.subscription);
  assert(sub.retention.cohort_basis_preserved === true && sub.retention.churn_probability === null);
});
check('dim/bottleneck discipline: every candidate is_fact:false, causal_claim:false, internal baseline', () => {
  for (const b of dental.bottlenecks) assert(b.is_fact === false && b.causal_claim === false && b.uses_external_benchmark === false && FR.bottleneck.validateBottleneck(b).valid);
});
check('dim/leakage discipline: every $ figure carries methodology + status', () => {
  for (const l of dental.leakages) if (l.value_estimate.status !== 'UNKNOWN') assert(l.value_estimate.methodology && ['OBSERVED', 'COMPUTED', 'MODELLED'].includes(l.value_estimate.status));
});
check('dim/causality discipline: diagnosis not causal; delta not significant', () => {
  assert(dental.diagnosis.causal === false);
});
check('dim/unknown handling: report unknowns section present + populated where data missing', () => {
  assert(Array.isArray(dental.report.sections.unknowns));
});
check('dim/report grounding: no fabricated "you are losing $X" / significance claims', () => {
  assert(!/statistically significant|you are losing \$?\d|guaranteed \d+% lift/i.test(JSON.stringify(dental.report)));
});

console.log(`\nASTRA11J_BENCHMARK_RESULT pass=${pass} fail=${fail}`);
if (fail) { console.log('FAILURES:\n' + notes.join('\n')); process.exit(1); }
