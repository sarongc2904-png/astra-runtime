'use strict';
// ASTRA-11J — Funnel + Revenue Intelligence Engine. Explicit W1..W80 + compatibility/security.
// Offline deterministic ONLY. No network, no LLM, no production DB.
const assert = require('assert');
const fs = require('fs'); const path = require('path');
const FR = require('../src/commercial/funnel_revenue');
const FX = require('../benchmarks/astra11j/fixtures');

let pass = 0, fail = 0; const fails = []; const covered = {};
function W(id, name, fn) { covered[id] = true; try { fn(); pass++; console.log('PASS', id, name); } catch (e) { fail++; fails.push(`${id} ${name} :: ${e && e.message}`); console.log('FAIL', id, name, '::', e && e.message); } }
const REF = FX.REFERENCE_TIME;
const run = (bi) => FR.engine.runFunnelRevenue({ businessInput: bi, referenceTime: REF });
const dental = () => run(FX.VERTICALS.dental);
const A = FX.ADVERSARIAL;

// ---------- funnel model + observations (W1..W8) ----------
W('W1', 'custom funnel supported', () => {
  const o = run({ funnel: { funnel_kind: 'CUSTOM', stages: [{ stage: 'CUSTOM', custom_key: 'DM', label: 'DM sent' }, { stage: 'CUSTOM', custom_key: 'REPLY' }, { stage: 'PURCHASE' }] }, observations: [FX.obs('DM', 100, 'e1'), FX.obs('REPLY', 30, 'e2'), FX.obs('PURCHASE', 6, 'e3')] });
  assert(o.funnel.funnel_kind === 'CUSTOM' && o.transitions.filter(t => t.status === 'VALID').length === 2);
});
W('W2', 'no mandatory universal funnel', () => {
  const o = run({ funnel: { funnel_kind: 'CUSTOM', stages: ['LEAD', 'PURCHASE'] }, observations: [FX.obs('LEAD', 50, 'e1'), FX.obs('PURCHASE', 5, 'e2')] });
  assert(o.funnel.in_scope_stages.length === 2 && FR.funnelModel.validateFunnel(o.funnel).valid);
});
W('W3', 'stage taxonomy controlled; unknown stage keeps its key', () => {
  const o = run({ funnel: { funnel_kind: 'CUSTOM', stages: ['LEAD', 'MAGIC_STAGE', 'PURCHASE'] }, observations: [FX.obs('LEAD', 10, 'e1'), FX.obs('MAGIC_STAGE', 5, 'e2'), FX.obs('PURCHASE', 1, 'e3')] });
  assert(o.funnel.stages.find(s => s.custom_key === 'MAGIC_STAGE') && o.transitions.some(t => t.from_stage === 'MAGIC_STAGE' || t.to_stage === 'MAGIC_STAGE'));
});
W('W4', 'valid conversion calculation', () => {
  const o = dental();
  const t = o.transitions.find(x => x.from_stage === 'CONVERSATION');
  assert(t.status === 'VALID' && Math.abs(t.conversion_rate - (o.observations.find(x => x.stage_key === 'QUALIFIED').count / o.observations.find(x => x.stage_key === 'CONVERSATION').count)) < 1e-9);
});
W('W5', 'invalid denominator (zero) -> INVALID_DENOMINATOR, no rate', () => {
  const o = run(A.zero_denominator);
  const t = o.transitions.find(x => x.from_stage === 'CONVERSATION');
  assert(t.status === 'INVALID_DENOMINATOR' && t.conversion_rate === null);
});
W('W6', 'missing count -> MISSING_COUNT, no rate', () => {
  const o = run(A.missing_denominator);
  assert(o.transitions.some(t => t.status === 'MISSING_COUNT' && t.conversion_rate === null));
});
W('W7', 'time-window mismatch -> SCOPE_MISMATCH(period)', () => {
  const o = run(A.mismatched_time_periods);
  assert(o.transitions.some(t => t.status === 'SCOPE_MISMATCH' && (t.scope_mismatches || []).some(m => m.field === 'period')));
});
W('W8', 'cohort mismatch -> SCOPE_MISMATCH(cohort)', () => {
  const o = run(A.cohort_mismatch);
  assert(o.transitions.some(t => t.status === 'SCOPE_MISMATCH' && (t.scope_mismatches || []).some(m => m.field === 'cohort')));
});

// ---------- scope + drop-off + volume/efficiency (W9..W16) ----------
W('W9', 'segment mismatch -> SCOPE_MISMATCH(segment)', () => {
  const b = FX.clone(FX.bookingBase('ws')); b.observations[1].segment = 'A'; b.observations[2].segment = 'B';
  const o = run(b);
  assert(o.transitions.some(t => t.status === 'SCOPE_MISMATCH' && (t.scope_mismatches || []).some(m => m.field === 'segment')));
});
W('W10', 'channel mismatch -> SCOPE_MISMATCH(channel)', () => {
  const o = run(A.mixed_channels);
  assert(o.transitions.some(t => t.status === 'SCOPE_MISMATCH' && (t.scope_mismatches || []).some(m => m.field === 'channel')));
});
W('W11', 'drop-off calculation', () => {
  const o = dental();
  const t = o.transitions.find(x => x.status === 'VALID');
  assert(t.drop_off_count === t.upstream_count - t.downstream_count && Math.abs(t.drop_off_rate - (1 - t.conversion_rate)) < 1e-9);
});
W('W12', 'drop-off is not causality', () => {
  const o = dental();
  for (const t of o.transitions) assert(t.causal_claim !== true);
  assert(/NOT a causal statement|not a causal/i.test(o.transitions.find(t => t.status === 'VALID').note));
});
W('W13', 'volume vs conversion distinction (summary separates them)', () => {
  const o = dental();
  assert(o.summary.volume && o.summary.efficiency && /volume.*efficiency/i.test(o.summary.volume_vs_efficiency_note));
});
W('W14', 'low outcome can be a volume problem (small volume, strong rates)', () => {
  const o = run(A.small_volume_extreme_rate);
  assert(o.summary.top_of_funnel_volume <= 10);
  assert(o.report.sections.volume_vs_efficiency.note);
});
W('W15', 'mixed currency -> SCOPE_MISMATCH(currency)', () => {
  const o = run(A.mixed_currencies);
  assert(o.transitions.some(t => (t.scope_mismatches || []).some(m => m.field === 'currency')));
});
W('W16', 'duplicate observations deduped + flagged', () => {
  const o = run(A.duplicate_observations);
  assert(o.dataConflicts.some(c => c.dimension === 'DUPLICATE_OBSERVATIONS'));
});

// ---------- attribution + cost + unit economics (W17..W28) ----------
W('W17', 'attribution not inferred (no multi-touch fabrication)', () => { const o = dental(); assert(o.attribution.multi_touch_model === 'NOT_FABRICATED' && o.attribution.causal === false && FR.attribution.validateAttribution(o.attribution).valid); });
W('W18', 'source-reported attribution preserved', () => { const o = dental(); assert(o.attribution.basis === 'SOURCE_REPORTED'); });
W('W19', 'unrecognised attribution -> UNKNOWN', () => { const o = run(A.attribution_ambiguity); assert(o.attribution.basis === 'UNKNOWN'); });
W('W20', 'CPL / CPA / CAC are separated', () => {
  const o = dental();
  assert(o.unitEconomics.CPL.metric === 'CPL' && o.unitEconomics.CPA.metric === 'CPA' && o.unitEconomics.CAC.metric === 'CAC');
  assert(new Set([o.unitEconomics.CPL.metric_id, o.unitEconomics.CPA.metric_id, o.unitEconomics.CAC.metric_id]).size === 3);
});
W('W21', 'incomplete CAC coverage -> COMPUTED_PARTIAL / lower bound', () => {
  const o = run(A.ad_spend_no_sales_cost);
  assert(o.unitEconomics.CAC.status === 'COMPUTED_PARTIAL' && o.unitEconomics.CAC.is_lower_bound === true && o.unitEconomics.CAC.cost_coverage.missing_required.includes('SALES_COST'));
});
W('W22', 'CAC does not silently default to ad spend / customers when sales cost declared', () => {
  const o = run(A.ad_spend_no_sales_cost);
  assert(!FR.unitEconomics.validateUnitEconomic({ ...o.unitEconomics.CAC, status: 'COMPUTED' }).valid || o.unitEconomics.CAC.status !== 'COMPUTED');
});
W('W23', 'cost declares status; none invented', () => { const o = dental(); for (const c of o.costs) assert(FR.cost.COST_STATUS.includes(c.status) && c.status !== 'COMPUTED'); });
W('W24', 'missing cost data -> MISSING_COST_DATA', () => {
  const b = FX.clone(FX.bookingBase('wc')); b.costs = [];
  assert(run(b).completion.reason_codes.includes('MISSING_COST_DATA'));
});
W('W25', 'CPA respects its configured cost types', () => {
  const b = FX.clone(FX.bookingBase('wcpa')); b.cpa_cost_types = ['MEDIA_SPEND', 'SALES_COST'];
  const o = run(b);
  assert(o.unitEconomics.CPA.status === 'COMPUTED' && o.unitEconomics.CPA.numerator === 'MEDIA_SPEND+SALES_COST');
});
W('W26', 'CPL uses media spend / valid leads only', () => {
  const o = dental();
  assert(o.unitEconomics.CPL.numerator === 'MEDIA_SPEND' && o.unitEconomics.CPL.denominator === 'valid_leads');
});
W('W27', 'zero customers -> CAC UNKNOWN', () => {
  const b = FX.clone(FX.bookingBase('wz')); b.new_customers = 0; b.observations = b.observations.filter(o => o.stage !== 'SOLD');
  assert(run(b).unitEconomics.CAC.status === 'UNKNOWN');
});
W('W28', 'revenue basis preserved (each revenue observation keeps its type)', () => {
  const o = run(FX.VERTICALS.subscription);
  const types = new Set(o.revenues.map(r => r.revenue_type));
  assert(types.has('RECURRING') && types.has('EXPANSION'));
});

// ---------- revenue + margin (W29..W38) ----------
W('W29', 'gross/net revenue distinction; net not silently derived', () => {
  const o = run(A.gross_presented_as_net);
  assert(!o.revenues.some(r => r.revenue_type === 'NET' && r.source_class === 'COMPUTED' && !r.derivation));
});
W('W30', 'net revenue derived ONLY with components', () => {
  const b = FX.clone(FX.bookingBase('wn')); b.net_revenue_components = { gross: 240000, refund: 10000, discount: 5000, tax: 20000, currency: 'MXN' };
  const o = run(b);
  const net = o.revenues.find(r => r.revenue_type === 'NET' && r.source_class === 'COMPUTED');
  assert(net && net.amount === 205000 && net.derivation.formula === 'gross - refund - discount - tax');
});
W('W31', 'net revenue UNKNOWN when a declared component is missing', () => {
  const d = FR.revenue.deriveNetRevenue({ gross: 240000, refund_applicable: true });
  assert(d.status === 'UNKNOWN' && d.reason === 'MISSING_REFUND');
});
W('W32', 'AOV uses order count', () => { const o = dental(); assert(o.aovArpuArpa.AOV.status === 'COMPUTED' && o.aovArpuArpa.AOV.denominator === 'order_count'); });
W('W33', 'ARPU uses user count; not substituted for AOV', () => { const o = dental(); assert(o.aovArpuArpa.ARPU.denominator === 'user_count' && o.aovArpuArpa.ARPU.value !== undefined); });
W('W34', 'ARPA uses account count', () => { const o = run(FX.VERTICALS.subscription); assert(o.aovArpuArpa.ARPA.status === 'COMPUTED' && o.aovArpuArpa.ARPA.denominator === 'account_count'); });
W('W35', 'AOV/ARPU UNKNOWN without denominator', () => {
  const o = run(A.revenue_without_customer_count);
  assert(o.aovArpuArpa.ARPU.status === 'UNKNOWN' && o.aovArpuArpa.AOV.status === 'UNKNOWN');
});
W('W36', 'gross vs contribution margin distinguished', () => { const o = dental(); assert(o.margins.distinct === true && 'gross_margin' in o.margins && 'contribution_margin' in o.margins && FR.margin.validateMargins(o.margins).valid); });
W('W37', 'no invented costs: contribution margin UNKNOWN without a supplied variable cost', () => {
  const o = run(A.missing_variable_cost);
  assert(o.margins.contribution_margin.status === 'UNKNOWN');
});
W('W38', 'gross margin UNKNOWN without a supplied COGS', () => {
  const b = FX.clone(FX.bookingBase('wgm')); delete b.margin_inputs.cogs;
  assert(run(b).margins.gross_margin.status === 'UNKNOWN');
});

// ---------- break-even + LTV + payback (W39..W50) ----------
W('W39', 'break-even only with valid inputs', () => { const o = dental(); assert(o.breakEven.status === 'COMPUTED' && o.breakEven.break_even_roas != null && FR.breakEven.validateBreakEven(o.breakEven).valid); });
W('W40', 'break-even UNKNOWN without contribution-margin ratio', () => {
  const o = run(A.fake_break_even_temptation);
  assert(o.breakEven.status === 'UNKNOWN');
});
W('W41', 'break-even ROAS = 1 / contribution-margin ratio', () => {
  const b = FX.clone(FX.bookingBase('wbe')); b.margin_inputs.contribution_margin_ratio = 0.5; b.first_order_revenue = 1000;
  const o = run(b);
  assert(Math.abs(o.breakEven.break_even_roas - 2) < 1e-6);
});
W('W42', 'LTV methodology explicit (observed vs modelled)', () => {
  const o = run(FX.VERTICALS.subscription);
  const obs = o.ltv.find(l => l.methodology === 'OBSERVED_COHORT_LTV');
  const mod = o.ltv.find(l => l.methodology === 'MODELLED_LTV');
  assert(obs && obs.status === 'OBSERVED' && mod && mod.status === 'MODELLED' && mod.is_modelled === true);
});
W('W43', 'modelled LTV labelled modelled, not observed', () => {
  const o = run(FX.VERTICALS.subscription);
  for (const l of o.ltv) assert(FR.ltv.validateLTV(l).valid);
});
W('W44', 'no silent ARPU/churn LTV formula (needs authorization)', () => {
  const o = run(A.fake_ltv_temptation);
  assert(o.ltv.every(l => l.methodology !== 'MODELLED_LTV' || l.status === 'UNKNOWN'));
});
W('W45', 'observed cohort LTV is a floor over its window', () => {
  const o = run(FX.VERTICALS.dental);
  const l = o.ltv.find(x => x.methodology === 'OBSERVED_COHORT_LTV');
  assert(l && /floor/.test(l.note));
});
W('W46', 'payback basis required (contribution-margin cadence)', () => {
  const o = dental();
  assert(o.payback.status === 'COMPUTED' && o.payback.monthly_contribution_margin != null && FR.payback.validatePayback(o.payback).valid);
});
W('W47', 'payback UNKNOWN when CAC is a lower bound', () => {
  const b = FX.clone(FX.bookingBase('wpb')); b.costs = [FX.cost('MEDIA_SPEND', 20000, 'x')]; b.declared_acquisition_cost_types = ['MEDIA_SPEND', 'SALES_COST']; b.monthly_contribution_margin = 3000;
  const o = run(b);
  assert(o.payback.status === 'UNKNOWN' && /LOWER_BOUND/.test(o.payback.reason));
});
W('W48', 'payback UNKNOWN without a contribution-margin cadence', () => {
  const b = FX.clone(FX.bookingBase('wpc')); delete b.monthly_contribution_margin; delete b.monthly_revenue_per_customer; delete b.margin_inputs.contribution_margin_ratio; delete b.margin_inputs.variable_cost;
  assert(run(b).payback.status === 'UNKNOWN');
});
W('W49', 'ROAS and MER separated', () => {
  const o = dental();
  assert(o.roas.metric === 'ROAS' && o.mer.metric === 'MER' && o.roas.interchangeable_with_the_other === false);
});
W('W50', 'ROAS carries its attribution basis; UNKNOWN without one', () => {
  const o = dental(); assert(o.roas.attribution_basis === 'SOURCE_REPORTED');
  const o2 = run(A.attribution_ambiguity); assert(o2.roas.status === 'UNKNOWN');
});

// ---------- funnels + retention (W51..W62) ----------
W('W51', 'booking funnel: qualification rate', () => { const o = dental(); assert(o.bookingFunnel.rates.qualification_rate.status === 'VALID'); });
W('W52', 'booking funnel: booking rate', () => { const o = dental(); assert(o.bookingFunnel.rates.booking_rate.status === 'VALID'); });
W('W53', 'booking funnel: show rate', () => { const o = run(A.strong_booking_poor_show); assert(o.bookingFunnel.rates.show_rate.rate <= 0.4); });
W('W54', 'booking funnel: close rate', () => { const o = run(A.high_show_poor_close); assert(o.bookingFunnel.rates.close_rate.rate <= 0.2); });
W('W55', 'booking funnel: conversation-to-sale rate', () => { const o = dental(); assert(o.bookingFunnel.rates.conversation_to_sale_rate.status === 'VALID'); });
W('W56', 'ecommerce funnel supported', () => { const o = run(FX.VERTICALS.ecommerce); assert(o.commerceFunnel && o.commerceFunnel.shape === 'ECOMMERCE' && o.commerceFunnel.applicable); });
W('W57', 'webinar funnel supported', () => { const o = run(FX.VERTICALS.subscription); assert(o.commerceFunnel && o.commerceFunnel.shape === 'WEBINAR'); });
W('W58', 'sales pipeline: win rate + custom states + cycle + reasons', () => {
  const o = run(FX.VERTICALS.b2b_service);
  assert(o.salesPipeline.rates.win_rate && o.salesPipeline.cycle_duration.days === 45 && Object.keys(o.salesPipeline.win_loss_reasons).length >= 1);
});
W('W59', 'retention cohort basis preserved', () => { const o = run(FX.VERTICALS.subscription); assert(o.retention.cohort_basis_preserved === true); });
W('W60', 'expansion revenue represented with cohort basis', () => { const o = run(FX.VERTICALS.subscription); assert(o.retention.expansion_revenue.amount != null && o.retention.expansion_revenue.cohort_basis); });
W('W61', 'no churn probability invented', () => { const o = run(FX.VERTICALS.subscription); assert(o.retention.churn_probability === null && FR.retention.validateRetention(o.retention).valid); });
W('W62', 'strong acquisition / poor retention surfaced', () => {
  const o = run(A.strong_acquisition_poor_retention);
  assert(o.diagnosis.finding_types.includes('RETENTION_PROBLEM') || o.bottlenecks.some(b => b.reason_codes.includes('POOR_RETENTION')));
});

// ---------- bottleneck + baseline + delta + leakage (W63..W74) ----------
W('W63', 'bottleneck analytical only (is_fact:false, causal_claim:false)', () => { const o = dental(); for (const b of o.bottlenecks) assert(b.is_fact === false && b.causal_claim === false); });
W('W64', 'no causality invention in bottleneck / diagnosis', () => { const o = dental(); assert(o.diagnosis.causal === false); for (const b of o.bottlenecks) assert(FR.bottleneck.validateBottleneck(b).valid); });
W('W65', 'bottleneck vs INTERNAL baseline only; no external benchmark', () => { const o = dental(); for (const b of o.bottlenecks) assert(b.uses_external_benchmark === false && ['INTERNAL_MEDIAN_OF_VALID_TRANSITIONS', 'USER_PROVIDED_BASELINE', 'NONE'].includes(b.baseline.basis)); });
W('W66', 'internal baseline validation before declaring change', () => {
  const b = FX.clone(FX.bookingBase('wbl'));
  b.baseline_comparisons = [{ current: 0.5, baseline: 0.3, kind: 'CHANNEL', is_rate: true, currentObs: FX.obs('X', 10, 'e', { channel: 'paid_social' }), baselineObs: FX.obs('X', 10, 'e', { channel: 'referral' }) }];
  const o = run(b);
  assert(o.baselineComparisons[0].change_declared === false && !o.baselineComparisons[0].comparability.comparable);
});
W('W67', 'absolute vs relative vs percentage-point delta correct', () => {
  const d = FR.delta.computeDelta(0.1, 0.15, { is_rate: true });
  assert(Math.abs(d.absolute_delta - 0.05) < 1e-9 && Math.abs(d.relative_delta - 0.5) < 1e-9 && Math.abs(d.percentage_point_delta - 5) < 1e-9);
});
W('W68', 'no statistical-significance claim', () => {
  const d = FR.delta.computeDelta(0.1, 0.15, { is_rate: true });
  assert(d.statistical_significance === 'NOT_ASSESSED' && d.causal === false && FR.delta.validateDelta(d).valid);
});
W('W69', 'delta without causality (baseline comparison)', () => {
  const o = run(A.delta_without_causality);
  assert(o.baselineComparisons[0].delta.percentage_point != null);
});
W('W70', 'leakage methodology explicit', () => {
  const b = FX.clone(FX.bookingBase('wlk')); b.leakage_value_assumptions = { NO_SHOWS: { value_per_unit: 1500, currency: 'MXN', status: 'MODELLED', input_refs: ['a'] } };
  const o = run(b);
  const l = o.leakages.find(x => x.leakage_source === 'NO_SHOWS');
  assert(l && l.value_estimate.status === 'MODELLED' && l.value_estimate.methodology && l.value_estimate.assumptions);
});
W('W71', 'no fabricated lost-revenue claim (UNKNOWN without value assumption)', () => {
  const o = run(A.lost_revenue_exaggeration_temptation);
  assert(o.leakages.every(l => l.value_estimate.status === 'UNKNOWN') && o.opportunityValue.status === 'UNKNOWN');
});
W('W72', 'opportunity value carries methodology + assumptions + status', () => {
  const b = FX.clone(FX.bookingBase('wov')); b.leakage_value_assumptions = { NO_SHOWS: { value_per_unit: 1500, currency: 'MXN', status: 'MODELLED', input_refs: ['a'] }, QUALIFICATION_LOSS: { value_per_unit: 800, currency: 'MXN', status: 'MODELLED', input_refs: ['b'] } };
  const o = run(b);
  assert(o.opportunityValue.status === 'MODELLED' && o.opportunityValue.methodology && Array.isArray(o.opportunityValue.assumptions) && FR.revenueLeakage.validateOpportunityValue(o.opportunityValue).valid);
});
W('W73', 'mixed-currency opportunity value not summed', () => {
  const b = FX.clone(FX.bookingBase('wmc')); b.leakage_value_assumptions = { NO_SHOWS: { value_per_unit: 1500, currency: 'MXN', status: 'MODELLED', input_refs: ['a'] }, QUALIFICATION_LOSS: { value_per_unit: 50, currency: 'USD', status: 'MODELLED', input_refs: ['b'] } };
  const o = run(b);
  assert(o.opportunityValue.mixed_currency === true && o.opportunityValue.total === null);
});
W('W74', 'refund leakage is OBSERVED when supplied', () => {
  const b = FX.clone(FX.bookingBase('wrf')); b.refunds = { amount: 12000, currency: 'MXN', evidence_refs: ['e_rf'] };
  const o = run(b);
  assert(o.leakages.some(l => l.leakage_source === 'REFUNDS' && l.value_estimate.status === 'OBSERVED'));
});

// ---------- diagnosis + priority + completion + report (W75..W80) ----------
W('W75', 'diagnosis types (volume/conversion/economics/retention/data-quality/mixed/insufficient)', () => {
  assert(FR.diagnosis.DIAGNOSIS_TYPES.length === 7);
  const o = run(A.high_roas_poor_contribution);
  assert(o.diagnosis.finding_types.includes('ECONOMICS_PROBLEM'));
});
W('W76', 'diagnosis grounded + non-causal', () => { const o = dental(); assert(FR.diagnosis.validateDiagnosis(o.diagnosis).valid && o.diagnosis.causal === false && o.diagnosis.is_recommendation === false); });
W('W77', 'priority non-autonomous', () => { const o = dental(); for (const p of o.priorities) assert(p.is_analytical === true && p.triggers_action === false && p.autonomous === false && FR.priority.validatePriority(p).valid); });
W('W78', 'deterministic completion', () => {
  const a = dental(), b = dental();
  assert.strictEqual(a.completion.completion_id, b.completion.completion_id);
  assert.strictEqual(a.completion.generated_by, 'deterministic:ucdm/funnel_revenue/completion');
});
W('W79', 'valid evidence graph + 35 sections + stable hashes', () => {
  const a = dental(), b = dental();
  assert(a.report.evidence_graph_valid, JSON.stringify(a.report.evidence_graph_errors));
  assert.strictEqual(a.report.section_names.length, 35);
  assert.strictEqual(a.report.report_id, b.report.report_id);
});
W('W80', 'no production routing / autonomous action', () => {
  const o = dental();
  assert(o.report.caveats.some(c => /production routing or autonomous action/.test(c)));
  assert(o.provenance_note.includes('No production routing') && o.provenance_note.includes('No autonomous action'));
  for (const p of o.priorities) assert(p.triggers_action === false);
});

// ---------- compatibility / security ----------
W('C1', 'ASTRA-11B compatibility', () => { const o = dental(); const SC = require('../src/commercial/provenance/provenance').SOURCE_CLASSES; for (const c of o.costs) assert(SC.includes(c.source_class)); assert.strictEqual(FR.UCDM_SCHEMA_VERSION, require('../src/commercial/schema/entities').SCHEMA_VERSION); });
W('C2', 'ASTRA-11C compatibility (canonicalization reuse)', () => { const a = dental(), b = dental(); assert.strictEqual(a.report.content_hash, b.report.content_hash); });
W('C3', 'ASTRA-11F compatibility (schema version constant)', () => { assert.strictEqual(FR.VOC_SCHEMA_VERSION, 'ucdm-voc-1.0.0'); });
W('C4', 'ASTRA-11H compatibility (schema version constant)', () => { assert.strictEqual(FR.JOURNEY_SCHEMA_VERSION, 'ucdm-journey-1.0.0'); });
W('C5', 'ASTRA-11I compatibility (schema version constant)', () => { assert.strictEqual(FR.POSITIONING_OFFER_SCHEMA_VERSION, 'ucdm-positioning-offer-1.0.0'); });
W('C6', 'no network dependency', () => {
  let src = '';
  for (const f of fs.readdirSync(path.join(__dirname, '../src/commercial/funnel_revenue'))) src += fs.readFileSync(path.join(__dirname, '../src/commercial/funnel_revenue', f), 'utf8');
  assert(!/require\(['"](http|https|net|dns|tls|dgram)['"]\)|fetch\(|XMLHttpRequest|WebSocket/.test(src));
});
W('C7', 'no production DB dependency', () => {
  for (const f of fs.readdirSync(path.join(__dirname, '../src/commercial/funnel_revenue'))) {
    const s = fs.readFileSync(path.join(__dirname, '../src/commercial/funnel_revenue', f), 'utf8');
    assert(!/supabase|createClient|\bpg\b|mysql|mongodb|@vercel|kv\.set/i.test(s));
  }
});
W('C8', 'ASTRA-10 freeze unchanged + benchmark isolation', () => {
  const fr = JSON.parse(fs.readFileSync(path.join(__dirname, '../benchmarks/astra10ah/freeze.json'), 'utf8'));
  assert.strictEqual(fr.harness_hash_sha256, '57305a9dee3f9130d8f913e28280d759e78c32cee5affb0ac8931a4da725d53d');
  const bsrc = fs.readFileSync(path.join(__dirname, '../benchmarks/astra11j/run_funnel_revenue_benchmark.js'), 'utf8');
  assert(!/writeFileSync|writeFile\(|appendFile/.test(bsrc) && /ASTRA11J_BENCHMARK_RESULT/.test(bsrc));
});

// ---------- W-matrix completeness ----------
const allW = [];
for (let i = 1; i <= 80; i++) allW.push('W' + i);
for (let i = 1; i <= 8; i++) allW.push('C' + i);
const missing = allW.filter(id => !covered[id]);
if (missing.length) { console.log('FAIL W-matrix completeness :: missing', missing.join(',')); fail++; }
else console.log('PASS W-matrix completeness (W1..W80 + C1..C8 all have explicit test evidence)');

console.log(`\nASTRA11J_TEST_RESULT pass=${pass} fail=${fail}`);
if (fail) { console.log('FAILURES:\n' + fails.join('\n')); process.exit(1); }
