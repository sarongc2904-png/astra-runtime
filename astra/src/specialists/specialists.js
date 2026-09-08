'use strict';
// Thin vertical-slice specialists for the 8 MARKETING_CAMPAIGN_360 execution nodes.
// Deterministic, evidence-grounded, contract-compliant. No LLM generation (no fabrication).
// Each returns a SPECIALIST_OUTPUT; recommendations are method-derived (INFERENCE), findings cite evidence.
const B = require('./base_specialist');

function biz(input) { return (input.task_brief && input.task_brief.business_type) || 'the business'; }

function market_context(input) {
  return B.makeOutput(input, { specialist_type: 'MARKET_CONTEXT_SPECIALIST',
    decisions: [{ decision: 'Frame market context from evidence-backed research/growth methods', rationale: 'method + retrieved evidence', method_used: input.selected_methods.primary_method }],
    assumptions: [{ assumption: 'Local service market with competitive paid-acquisition landscape', source_class: 'INFERENCE' }],
    downstream_payload: { market_context: { business_type: biz(input), positioning_focus: 'differentiated local service', evidence_count: (input.knowledge_evidence || []).length } } });
}
function icp(input) {
  return B.makeOutput(input, { specialist_type: 'ICP_SPECIALIST',
    decisions: [{ decision: 'Define ICP dimensions (pains/desires/objections) grounded in audience-insight evidence', rationale: 'method primary_jobs', method_used: input.selected_methods.primary_method }],
    assumptions: [{ assumption: 'Primary ICP = local consumers seeking the service; concrete demographics require USER_PROVIDED_FACTS', source_class: 'INFERENCE' }],
    downstream_payload: { icp: { dimensions: ['pains', 'desires', 'objections', 'buying_triggers'], needs_user_facts: ['exact demographics', 'price sensitivity', 'geography'] } } });
}
function offer(input) {
  return B.makeOutput(input, { specialist_type: 'OFFER_SPECIALIST',
    decisions: [{ decision: 'Construct offer with value stack + risk reversal per offer-design method', rationale: 'method primary_jobs + evidence', method_used: input.selected_methods.primary_method }],
    assumptions: [{ assumption: 'Price band and margin are USER_PROVIDED_FACTS (not inferred)', source_class: 'INFERENCE' }],
    downstream_payload: { offer: { components: ['core_offer', 'guarantee/risk_reversal', 'bonuses', 'price_framing'], requires_user_facts: ['price', 'margin', 'capacity'] } } });
}
function funnel(input) {
  return B.makeOutput(input, { specialist_type: 'FUNNEL_SPECIALIST',
    decisions: [{ decision: 'Design acquisition→conversion funnel sequence', rationale: 'funnel method + offer/icp upstream', method_used: input.selected_methods.primary_method }],
    assumptions: [{ assumption: 'Lead capture flows to a WhatsApp conversion step for a local high-consideration service', source_class: 'INFERENCE' }],
    downstream_payload: { funnel: { stages: ['awareness(ad)', 'lead_capture', 'whatsapp_qualification', 'appointment', 'close', 'follow_up'] } } });
}
function creative_strategy(input) {
  return B.makeOutput(input, { specialist_type: 'CREATIVE_STRATEGY_SPECIALIST',
    decisions: [{ decision: 'Derive angles/hooks from a single-minded proposition', rationale: 'creative method + SMP evidence', method_used: input.selected_methods.primary_method }],
    assumptions: [{ assumption: 'Angles must be validated against ICP pains before spend', source_class: 'INFERENCE' }],
    downstream_payload: { creative_strategy: { angles: ['problem/solution', 'before/after (claims require substantiation)', 'trust/safety', 'convenience/speed'], sample_copy_directions: ['lead with the single-minded benefit', 'address top objection', 'clear CTA to WhatsApp'], note: 'copy directions are structural; concrete claims need USER_PROVIDED_FACTS' } } });
}
function meta_ads(input) {
  const method = input.selected_methods.primary_method_object;
  return B.makeOutput(input, { specialist_type: 'META_ADS_SPECIALIST',
    decisions: [{ decision: 'Strategic Meta Ads plan bound to METHOD_META_ADS', rationale: 'forced evidence-backed binding', method_used: 'METHOD_META_ADS' }],
    assumptions: [{ assumption: 'Lead-generation objective for local acquisition; exact budget is USER_PROVIDED_FACTS', source_class: 'INFERENCE' }],
    current_research_required: B.currentResearchFromMethod(method),
    downstream_payload: { ads_plan: {
      campaign_objective: 'lead generation / acquisition (strategic level)',
      audience_approach: 'local radius + interest/behavior seed; broad testing per method',
      structure: 'campaign -> a few ad sets by angle/audience -> multiple creatives',
      creative_testing_approach: 'test angles from creative_strategy; iterate on winners',
      qualification_considerations: 'qualify leads downstream in WhatsApp, not in-ad',
      measurement_considerations: 'CPL, lead->appointment rate, appointment->sale rate',
      limitations: (method && method.limitations) || ['coverage=MODERATE'],
      current_research_required: ['CAPI setup', 'Advantage+ current behavior', 'current attribution mechanics', 'current UI/interface setup'] } } });
}
function whatsapp_sales(input) {
  const method = input.selected_methods.primary_method_object;
  return B.makeOutput(input, { specialist_type: 'WHATSAPP_SALES_SPECIALIST',
    decisions: [{ decision: 'WhatsApp conversion flow bound to METHOD_WHATSAPP_SALES', rationale: 'forced evidence-backed binding', method_used: 'METHOD_WHATSAPP_SALES' }],
    assumptions: [{ assumption: 'Inbound leads arrive from the ad/funnel; agent handles chat', source_class: 'INFERENCE' }],
    current_research_required: B.currentResearchFromMethod(method),
    downstream_payload: { whatsapp_flow: {
      qualification_logic: ['confirm intent/service', 'confirm location/eligibility', 'confirm budget/urgency band'],
      diagnostic_questions: ['what result do you want?', 'have you tried it before?', 'timeframe?'],
      appointment_closing_flow: ['propose two time slots', 'confirm booking', 'send reminder'],
      objection_handling: ['price -> reframe to value/guarantee', 'trust -> proof/safety', 'timing -> scarcity/next step'],
      follow_up: ['same-day recap', 'day-2 nudge', 'day-5 value message'],
      recovery_logic: ['reactivate no-shows with new slot', 'win-back cold leads with offer reminder'],
      limitations: (method && method.limitations) || ['coverage=MODERATE'],
      current_research_required: ['provider-independent WhatsApp API operations', 'current WhatsApp policy', 'multi-channel CRM integration specifics'] } } });
}
function measurement_cro(input) {
  return B.makeOutput(input, { specialist_type: 'MEASUREMENT_CRO_SPECIALIST',
    decisions: [{ decision: 'Define measurement plan and optimization triggers', rationale: 'CRO method + funnel', method_used: input.selected_methods.primary_method }],
    assumptions: [{ assumption: 'Benchmarks left POR DEFINIR until real data exists (no invented numbers)', source_class: 'INFERENCE' }],
    downstream_payload: { measurement: {
      primary_outcome: 'booked appointments that convert to paid clients',
      leading_indicators: ['CPL', 'lead volume', 'qualification rate'],
      conversion_metrics: ['lead->appointment', 'appointment->show', 'show->sale'],
      funnel_diagnostics: ['drop-off by stage'],
      measurement_cadence: 'daily spend/CPL check; weekly funnel review',
      optimization_triggers: ['CPL above target -> revisit creative/audience', 'low qualification -> tighten targeting/offer'],
      note: 'target values POR DEFINIR — no benchmark numbers invented without evidence' } } });
}

// ASTRA-08B: thin registration of the evidence-bounded Creative Director specialist.
// The Creative Director is a standalone orchestration layer (src/creative/); this exposes it under
// the specialist contract so the router can dispatch a CREATIVE_DIRECTOR work unit. Read-only over
// Agent V1; never generates images. Input.task_brief (+ optional constraints/commands/adapter) → package.
function creative_director(input, opts = {}) {
  const CD = require('../creative/creative_director');
  const brief = Object.assign({ task_id: input.task_id }, input.task_brief || {},
    { constraints: input.constraints, commands: (input.constraints && input.constraints.creative_commands) || input.creative_commands });
  return CD.run(brief, {
    mode: (input.output_requirements && input.output_requirements.creative_mode) || opts.mode,
    variant_count: input.output_requirements && input.output_requirements.variant_count,
    adapter: opts.adapter, user_facts: opts.user_facts, commands: brief.commands,
  });
}

module.exports = { market_context, icp, offer, funnel, creative_strategy, meta_ads, whatsapp_sales, measurement_cro, creative_director };
