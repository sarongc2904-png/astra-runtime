'use strict';
// [ASTRA-11B] Canonical, PROVIDER-NEUTRAL commercial entity registry (ASTRA-11B section A + K).
// Declarative field specs consumed by validation/validate_entity.js. No provider-specific
// canonical entity exists here (no MetaCampaign, no WhatsAppLead, no StripeCharge). External
// systems map INTO these via adapters in a later gate.
// Pure data. No I/O, no LLM, no network.

const SCHEMA_VERSION = 'ucdm-1.0.0';

// ---- field-spec helpers ------------------------------------------------------
// kind:
//   'scalar'      plain value (text/number/bool/object/list) — provenance optional
//   'provenanced' MUST be a ProvenanceValue (or UNKNOWN when unknownable)
//   'metric'      MUST be a ProvenanceValue AND pass the numeric-integrity guard (canonical metric)
//   'enum'        value ∈ `values` (or UNKNOWN when unknownable)
//   'ref'         a string id referencing another entity/evidence ref
//   'ref_list'    array of ref ids
//   'stage_config' array of stage descriptors: configurable per business, non-empty, unique names
//   'list'        array; `item` optionally names an enum set each element must belong to
const S = (kind, opts = {}) => Object.freeze({ kind, required: !!opts.required, unknownable: opts.unknownable !== false, values: opts.values || null, item: opts.item || null, note: opts.note || null });
const scalar = o => S('scalar', o);
const prov = o => S('provenanced', o);
const metric = o => S('metric', o);
const enom = (values, o = {}) => S('enum', { ...o, values });
const ref = o => S('ref', o);
const refList = o => S('ref_list', o);
const stageConfig = o => S('stage_config', o);
const list = o => S('list', o);

// Provenance sub-field sets reused by several customer-intelligence entities (section G).
const VOC_ASPECTS = ['pain', 'desire', 'fear', 'objection', 'trigger', 'alternative', 'decision_criterion', 'reason_to_buy', 'reason_not_to_buy'];
const AWARENESS = ['UNAWARE', 'PROBLEM_AWARE', 'SOLUTION_AWARE', 'PRODUCT_AWARE', 'MOST_AWARE', 'UNKNOWN'];
const SOPHISTICATION = ['STAGE_1', 'STAGE_2', 'STAGE_3', 'STAGE_4', 'STAGE_5', 'UNKNOWN'];
const JOURNEY_STAGE_DEFAULT = ['awareness', 'consideration', 'decision', 'onboarding', 'retention', 'advocacy'];
const FUNNEL_STAGE_LIBRARY = ['impression', 'click', 'landing', 'lead', 'conversation', 'qualified', 'appointment', 'show', 'opportunity', 'sale', 'activation', 'upsell', 'retention'];

// ---- entity registry -------------------------------------------------------
const ENTITIES = {

  // ========================= MARKET =========================
  Business: {
    domain: 'MARKET', kind: 'OPERATIONAL_STATE', natural_key: ['business_slug'],
    fields: {
      business_slug: scalar({ required: true }),
      name: scalar({ required: true }),
      description: prov({}),
      model_type: enom(['B2B', 'B2C', 'B2B2C', 'MARKETPLACE', 'UNKNOWN']),
      stage: enom(['IDEA', 'EARLY', 'GROWTH', 'SCALE', 'MATURE', 'UNKNOWN']),
      primary_geo: prov({}),
      currency: scalar({ note: 'ISO 4217; operational config, not a metric' }),
    },
  },
  Market: {
    domain: 'MARKET', kind: 'ANALYTICAL_SNAPSHOT', natural_key: ['business_ref', 'market_slug'],
    fields: {
      business_ref: ref({ required: true }), market_slug: scalar({ required: true }),
      category: prov({ required: true }),
      trends: list({}), constraints: list({}),
      tam_note: prov({ note: 'narrative only; any $ here is annotation, not canonical' }),
      tam_value: metric({ note: 'canonical size — OBSERVED/USER_PROVIDED/COMPUTED only' }),
    },
  },
  MarketObservation: {
    domain: 'MARKET', kind: 'ANALYTICAL_SNAPSHOT', natural_key: ['market_ref', 'observation_slug'],
    fields: {
      market_ref: ref({ required: true }), observation_slug: scalar({ required: true }),
      statement: prov({ required: true }),
      observation_type: enom(['TREND', 'REGULATION', 'DEMAND_SIGNAL', 'PRICING_SIGNAL', 'COMPETITIVE_MOVE', 'OTHER']),
      magnitude: metric({}), evidence_refs: refList({ required: true }),
    },
  },
  Competitor: {
    domain: 'MARKET', kind: 'ANALYTICAL_SNAPSHOT', natural_key: ['market_ref', 'competitor_slug'],
    fields: {
      market_ref: ref({ required: true }), competitor_slug: scalar({ required: true }),
      name: scalar({ required: true }),
      positioning: prov({}), strengths: list({}), weaknesses: list({}),
      pricing_note: prov({}), price_points: metric({}),
      evidence_refs: refList({ required: true, note: 'competitor facts are EXTERNAL_RESEARCH / USER_PROVIDED only' }),
    },
  },

  // ========================= CUSTOMER =========================
  Segment: {
    domain: 'CUSTOMER', kind: 'ANALYTICAL_SNAPSHOT', natural_key: ['business_ref', 'segment_slug'],
    fields: {
      business_ref: ref({ required: true }), segment_slug: scalar({ required: true }),
      name: scalar({ required: true }),
      axis: prov({ note: 'INFERRED axis proposal is fine; the partition rule is deterministic' }),
      rule: scalar({ required: true, note: 'deterministic predicate spec' }),
      size: metric({}), metrics: scalar({}),
    },
  },
  Persona: {
    domain: 'CUSTOMER', kind: 'ANALYTICAL_SNAPSHOT', natural_key: ['business_ref', 'persona_slug'],
    fields: {
      business_ref: ref({ required: true }), persona_slug: scalar({ required: true }),
      name: scalar({ required: true }),
      narrative: prov({}),
      current_situation: prov({}), desired_situation: prov({}),
      functional_pains: list({}), emotional_pains: list({}),
      desired_outcomes: list({}), fears: list({}), objections: list({}), triggers: list({}),
      alternatives: list({}), decision_criteria: list({}),
      awareness: enom(AWARENESS), channels: list({}), language: prov({}),
      urgency: enom(['LOW', 'MEDIUM', 'HIGH', 'UNKNOWN']),
      ability_to_pay: prov({ note: 'firmographic/financial facts stay USER_PROVIDED or UNKNOWN' }),
      linked_jobs: refList({}), voc_refs: refList({}),
    },
  },
  ICP: {
    domain: 'CUSTOMER', kind: 'ANALYTICAL_SNAPSHOT', natural_key: ['business_ref', 'icp_slug'],
    fields: {
      business_ref: ref({ required: true }), icp_slug: scalar({ required: true }),
      industry: prov({}), company_size: prov({}), revenue_range: prov({}),
      location: prov({}), maturity: prov({}), budget: prov({}),
      urgency: enom(['LOW', 'MEDIUM', 'HIGH', 'UNKNOWN']),
      fit_criteria: list({}), disqualification_criteria: list({}),
    },
  },
  VoiceOfCustomerObservation: {
    domain: 'CUSTOMER', kind: 'ANALYTICAL_SNAPSHOT', natural_key: ['business_ref', 'voc_slug'],
    fields: {
      business_ref: ref({ required: true }), voc_slug: scalar({ required: true }),
      exact_phrase: prov({ required: true, note: 'verbatim customer language; OBSERVED, quote-backed' }),
      aspect: enom(VOC_ASPECTS.map(a => a.toUpperCase()).concat(['UNKNOWN']), { required: true }),
      normalized_theme: prov({}),
      cluster_ref: ref({}),
      frequency_bucket: metric({ note: 'COMPUTED count of citing evidence items — never LLM' }),
      evidence_refs: refList({ required: true }),
    },
  },
  JTBD: {
    domain: 'CUSTOMER', kind: 'ANALYTICAL_SNAPSHOT', natural_key: ['business_ref', 'job_slug'],
    fields: {
      business_ref: ref({ required: true }), job_slug: scalar({ required: true }),
      situation: prov({ required: true }), motivation: prov({}), desired_outcome: prov({ required: true }),
      functional_job: prov({}), emotional_job: prov({}), social_job: prov({}),
      push: prov({}), pull: prov({}), anxiety: prov({}), habit: prov({}),
      linked_voc: refList({}),
    },
  },
  CustomerJourney: {
    domain: 'CUSTOMER', kind: 'ANALYTICAL_SNAPSHOT', natural_key: ['business_ref', 'journey_slug'],
    fields: {
      business_ref: ref({ required: true }), journey_slug: scalar({ required: true }),
      persona_ref: ref({}),
      stages: stageConfig({ required: true, note: `configurable per business; default library: ${JOURNEY_STAGE_DEFAULT.join('/')}` }),
    },
  },
  CustomerJourneyStage: {
    domain: 'CUSTOMER', kind: 'ANALYTICAL_SNAPSHOT', natural_key: ['journey_ref', 'stage_name'],
    fields: {
      journey_ref: ref({ required: true }), stage_name: scalar({ required: true }),
      order_index: scalar({ required: true, note: 'integer position' }),
      customer_goal: prov({}), customer_question: prov({}), emotion: prov({}), barrier: prov({}), trigger: prov({}),
      touchpoint: prov({}), company_objective: prov({}), message: prov({}), cta: prov({}),
      metric_ref: ref({}), failure_mode: prov({}), opportunity: prov({}),
    },
  },

  // ========================= STRATEGY =========================
  Positioning: {
    domain: 'STRATEGY', kind: 'ANALYTICAL_SNAPSHOT', natural_key: ['business_ref', 'positioning_slug'],
    fields: {
      business_ref: ref({ required: true }), positioning_slug: scalar({ required: true }),
      frame: prov({ required: true }), alternative: prov({}), differentiator: prov({ required: true }),
      proof_points: list({ note: 'each element: {claim(prov), proof_ref}; unproven -> POR_VALIDAR' }),
      target_segment_ref: ref({}),
    },
  },
  Offer: {
    domain: 'STRATEGY', kind: 'ANALYTICAL_SNAPSHOT', natural_key: ['business_ref', 'offer_slug'],
    fields: {
      business_ref: ref({ required: true }), offer_slug: scalar({ required: true }),
      core: prov({ required: true }), value_stack: list({}), mechanism: prov({}),
      risk_reversal: prov({}), bonuses: list({}), price_framing: prov({}),
      price: metric({ note: 'USER_PROVIDED only' }), margin: metric({ note: 'USER_PROVIDED/COMPUTED only' }),
      capacity: metric({}), product_ref: ref({}),
    },
  },
  Product: {
    domain: 'STRATEGY', kind: 'OPERATIONAL_STATE', natural_key: ['business_ref', 'product_slug'],
    fields: {
      business_ref: ref({ required: true }), product_slug: scalar({ required: true }),
      name: scalar({ required: true }), kind: enom(['PHYSICAL', 'DIGITAL', 'SERVICE', 'SUBSCRIPTION', 'COURSE', 'OTHER', 'UNKNOWN']),
      list_price: metric({}), currency: scalar({}), fulfillment_note: prov({}),
    },
  },

  // ========================= ACQUISITION =========================
  Channel: {
    domain: 'ACQUISITION', kind: 'OPERATIONAL_STATE', natural_key: ['business_ref', 'channel_slug'],
    fields: {
      business_ref: ref({ required: true }), channel_slug: scalar({ required: true }),
      name: scalar({ required: true }),
      channel_class: enom(['PAID_SOCIAL', 'PAID_SEARCH', 'ORGANIC_SOCIAL', 'SEO', 'EMAIL', 'REFERRAL', 'DIRECT', 'MESSAGING', 'EVENTS', 'OTHER', 'UNKNOWN'], { note: 'class only — NOT a provider name' }),
    },
  },
  Campaign: {
    domain: 'ACQUISITION', kind: 'OPERATIONAL_STATE', natural_key: ['business_ref', 'campaign_slug'],
    fields: {
      business_ref: ref({ required: true }), campaign_slug: scalar({ required: true }),
      name: scalar({ required: true }), channel_ref: ref({ required: true }),
      objective: enom(['AWARENESS', 'TRAFFIC', 'LEADS', 'CONVERSIONS', 'SALES', 'RETENTION', 'OTHER', 'UNKNOWN']),
      offer_ref: ref({}), start_at: scalar({}), end_at: scalar({}),
      spend: metric({}), status: enom(['DRAFT', 'ACTIVE', 'PAUSED', 'ENDED', 'UNKNOWN']),
    },
  },
  Creative: {
    domain: 'ACQUISITION', kind: 'OPERATIONAL_STATE', natural_key: ['campaign_ref', 'creative_slug'],
    fields: {
      campaign_ref: ref({ required: true }), creative_slug: scalar({ required: true }),
      format: enom(['IMAGE', 'VIDEO', 'CAROUSEL', 'TEXT', 'LANDING', 'EMAIL', 'OTHER', 'UNKNOWN']),
      angle: prov({}), hook: prov({}), body: prov({}), cta: prov({}),
      asset_ref: scalar({}),
    },
  },
  Lead: {
    domain: 'ACQUISITION', kind: 'OPERATIONAL_STATE', natural_key: ['business_ref', 'lead_key'],
    fields: {
      business_ref: ref({ required: true }), lead_key: scalar({ required: true, note: 'stable per-business contact key (hashed identifier)' }),
      created_at: scalar({ required: true }),
      source_channel_ref: ref({}), campaign_ref: ref({}),
      journey_stage: scalar({ note: 'a stage NAME from the business journey config' }),
      segment_ref: ref({}), qualified: enom(['YES', 'NO', 'UNKNOWN']),
      attributes: scalar({}),
    },
  },
  Conversation: {
    domain: 'ACQUISITION', kind: 'OPERATIONAL_STATE', natural_key: ['lead_ref', 'conversation_slug'],
    fields: {
      lead_ref: ref({ required: true }), conversation_slug: scalar({ required: true }),
      medium: enom(['MESSAGING', 'CALL', 'EMAIL', 'IN_PERSON', 'OTHER', 'UNKNOWN'], { note: 'medium class, not a provider' }),
      started_at: scalar({ required: true }), ended_at: scalar({}),
      outcome: enom(['NO_RESPONSE', 'ENGAGED', 'QUALIFIED', 'DISQUALIFIED', 'BOOKED', 'LOST', 'WON', 'UNKNOWN']),
      transcript_source_ref: ref({ note: 'points to a Source in the evidence graph, if captured' }),
    },
  },
  Appointment: {
    domain: 'ACQUISITION', kind: 'OPERATIONAL_STATE', natural_key: ['lead_ref', 'appointment_slug'],
    fields: {
      lead_ref: ref({ required: true }), appointment_slug: scalar({ required: true }),
      scheduled_at: scalar({ required: true }), status: enom(['SCHEDULED', 'SHOW', 'NO_SHOW', 'RESCHEDULED', 'CANCELLED', 'UNKNOWN'], { required: true }),
      opportunity_ref: ref({}),
    },
  },
  Opportunity: {
    domain: 'ACQUISITION', kind: 'OPERATIONAL_STATE', natural_key: ['business_ref', 'opportunity_key'],
    fields: {
      business_ref: ref({ required: true }), opportunity_key: scalar({ required: true }),
      lead_ref: ref({ required: true }), offer_ref: ref({}),
      stage: enom(['OPEN', 'NEGOTIATION', 'WON', 'LOST', 'UNKNOWN'], { required: true }),
      expected_value: metric({}), created_at: scalar({ required: true }), closed_at: scalar({}),
    },
  },

  // ========================= REVENUE =========================
  Sale: {
    domain: 'REVENUE', kind: 'OPERATIONAL_STATE', natural_key: ['business_ref', 'sale_key'],
    fields: {
      business_ref: ref({ required: true }), sale_key: scalar({ required: true }),
      opportunity_ref: ref({}), lead_ref: ref({}), offer_ref: ref({}), product_ref: ref({}),
      occurred_at: scalar({ required: true }),
      amount: metric({ required: true, note: 'OBSERVED/USER_PROVIDED only' }), currency: scalar({ required: true }),
      kind: enom(['NEW', 'RENEWAL', 'EXPANSION', 'ONE_TIME', 'UNKNOWN']),
    },
  },
  RevenueEvent: {
    domain: 'REVENUE', kind: 'ANALYTICAL_SNAPSHOT', natural_key: ['business_ref', 'revenue_event_key'],
    fields: {
      business_ref: ref({ required: true }), revenue_event_key: scalar({ required: true }),
      event_type: enom(['NEW_MRR', 'EXPANSION_MRR', 'CONTRACTION_MRR', 'CHURNED_MRR', 'ONE_TIME', 'REFUND'], { required: true }),
      amount: metric({ required: true }), currency: scalar({ required: true }),
      occurred_at: scalar({ required: true }), account_key: scalar({}), sale_ref: ref({}),
    },
  },
  RetentionEvent: {
    domain: 'REVENUE', kind: 'ANALYTICAL_SNAPSHOT', natural_key: ['business_ref', 'retention_event_key'],
    fields: {
      business_ref: ref({ required: true }), retention_event_key: scalar({ required: true }),
      account_key: scalar({ required: true }),
      event_type: enom(['ACTIVATED', 'RENEWED', 'CHURNED', 'REACTIVATED', 'DOWNGRADED', 'UPGRADED'], { required: true }),
      occurred_at: scalar({ required: true }), cohort_period: scalar({}), mrr_delta: metric({}),
    },
  },
  UpsellEvent: {
    domain: 'REVENUE', kind: 'ANALYTICAL_SNAPSHOT', natural_key: ['business_ref', 'upsell_event_key'],
    fields: {
      business_ref: ref({ required: true }), upsell_event_key: scalar({ required: true }),
      account_key: scalar({ required: true }), from_offer_ref: ref({}), to_offer_ref: ref({ required: true }),
      occurred_at: scalar({ required: true }), amount: metric({}), trigger: prov({}),
    },
  },

  // ========================= OPTIMIZATION =========================
  Funnel: {
    domain: 'OPTIMIZATION', kind: 'ANALYTICAL_SNAPSHOT', natural_key: ['business_ref', 'funnel_slug'],
    fields: {
      business_ref: ref({ required: true }), funnel_slug: scalar({ required: true }),
      stages: stageConfig({ required: true, note: `configurable per business; library: ${FUNNEL_STAGE_LIBRARY.join('/')}` }),
      observation_window: scalar({}),
    },
  },
  FunnelStage: {
    domain: 'OPTIMIZATION', kind: 'ANALYTICAL_SNAPSHOT', natural_key: ['funnel_ref', 'stage_name'],
    fields: {
      funnel_ref: ref({ required: true }), stage_name: scalar({ required: true }),
      order_index: scalar({ required: true }),
      entered: metric({}), exited: metric({}), event_source_refs: refList({}),
    },
  },
  FunnelTransition: {
    domain: 'OPTIMIZATION', kind: 'ANALYTICAL_SNAPSHOT', natural_key: ['funnel_ref', 'from_stage', 'to_stage', 'observation_window'],
    fields: {
      funnel_ref: ref({ required: true }),
      from_stage: scalar({ required: true }), to_stage: scalar({ required: true }),
      observation_window: scalar({ required: true }),
      entered: metric({ required: true }), exited: metric({ required: true }),
      conversion_rate: metric({ required: true, note: 'COMPUTED by funnel_math only — never LLM' }),
      dropoff_rate: metric({ required: true, note: 'COMPUTED by funnel_math only' }),
      cost: metric({}), value: metric({}),
    },
  },
  Metric: {
    domain: 'OPTIMIZATION', kind: 'ANALYTICAL_SNAPSHOT', natural_key: ['business_ref', 'metric_slug', 'period'],
    fields: {
      business_ref: ref({ required: true }), metric_slug: scalar({ required: true }),
      name: scalar({ required: true }), period: scalar({ required: true }),
      value: metric({ required: true }), unit: scalar({}),
      definition_ref: scalar({ note: 'names the deterministic formula that produced it' }),
      target: metric({}), baseline: metric({}),
    },
  },
  Insight: {
    domain: 'OPTIMIZATION', kind: 'ANALYTICAL_SNAPSHOT', natural_key: ['business_ref', 'insight_slug'],
    fields: {
      business_ref: ref({ required: true }), insight_slug: scalar({ required: true }),
      kind: enom(['BOTTLENECK', 'OPPORTUNITY', 'RISK', 'PATTERN', 'ANOMALY', 'OTHER'], { required: true }),
      statement: prov({ required: true, note: 'narrative may be INFERRED; supporting numbers must be metric refs' }),
      metric_refs: refList({ required: true }),
      diagnosis: prov({}), evidence_refs: refList({ required: true }),
      confidence: scalar({ note: 'a ConfidenceAssessment (deterministic) — see confidence.js' }),
      severity: enom(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'UNKNOWN']),
    },
  },
  Recommendation: {
    domain: 'OPTIMIZATION', kind: 'ANALYTICAL_SNAPSHOT', natural_key: ['business_ref', 'recommendation_slug'],
    fields: {
      business_ref: ref({ required: true }), recommendation_slug: scalar({ required: true }),
      problem: prov({ required: true }), severity: enom(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'UNKNOWN'], { required: true }),
      diagnosis: prov({}), insight_refs: refList({ required: true }), evidence_refs: refList({ required: true }),
      recommendation_text: prov({ required: true, note: 'LLM-authored text allowed; refs + priority inputs validated deterministically' }),
      expected_mechanism: prov({}),
      confidence: scalar({ required: true, note: 'ConfidenceAssessment (deterministic)' }),
      impact: enom(['LOW', 'MEDIUM', 'HIGH', 'UNKNOWN'], { required: true }),
      effort: enom(['LOW', 'MEDIUM', 'HIGH', 'UNKNOWN'], { required: true }),
      priority: metric({ note: 'COMPUTED from impact/effort/confidence — never LLM' }),
      proposed_experiment_ref: ref({}),
      status: enom(['PROPOSED', 'ACCEPTED', 'IN_PROGRESS', 'DONE', 'REJECTED', 'SUPERSEDED'], { required: true }),
    },
  },

  // ========================= EXPERIMENTATION =========================
  Experiment: {
    domain: 'EXPERIMENTATION', kind: 'OPERATIONAL_STATE', natural_key: ['business_ref', 'experiment_slug'],
    fields: {
      business_ref: ref({ required: true }), experiment_slug: scalar({ required: true }),
      problem: prov({ required: true }), hypothesis: prov({ required: true }),
      segment_ref: ref({}), variable: scalar({ required: true }),
      baseline: metric({}), target: metric({}),
      primary_metric: scalar({ required: true }), secondary_metrics: list({}),
      start_at: scalar({}), end_at: scalar({}),
      state: enom(['PROPOSED', 'APPROVED', 'RUNNING', 'COMPLETED'], { required: true }),
      decision: enom(['KEEP', 'ITERATE', 'REJECT', 'INCONCLUSIVE']),
      result_ref: ref({}), learning_ref: ref({}), evidence_refs: refList({}),
    },
  },
  ExperimentResult: {
    domain: 'EXPERIMENTATION', kind: 'ANALYTICAL_SNAPSHOT', natural_key: ['experiment_ref'],
    fields: {
      experiment_ref: ref({ required: true }),
      lift: metric({ required: true, note: 'COMPUTED' }), p_value: metric({}), confidence_interval: scalar({}),
      sample_size: metric({ required: true }),
      decision: enom(['KEEP', 'ITERATE', 'REJECT', 'INCONCLUSIVE'], { required: true }),
      computed_by: scalar({ required: true, note: 'must be a deterministic:* producer' }),
    },
  },

  // ========================= BUSINESS MEMORY =========================
  BusinessLearning: {
    domain: 'BUSINESS_MEMORY', kind: 'ANALYTICAL_SNAPSHOT', natural_key: ['business_ref', 'learning_slug'],
    fields: {
      business_ref: ref({ required: true }), learning_slug: scalar({ required: true }),
      what_was_tried: prov({ required: true }), why: prov({ required: true }),
      context: scalar({ required: true, note: '{segment, offer, creative_or_message, where, when}' }),
      result: prov({ required: true }), learning: prov({ required: true }),
      experiment_ref: ref({ required: true }), evidence_refs: refList({ required: true }),
      confidence: scalar({ required: true, note: 'ConfidenceAssessment (deterministic)' }),
      supersedes: ref({}),
    },
  },

  // ========================= PROVENANCE (cross-cutting) =========================
  Source: {
    domain: 'PROVENANCE', kind: 'ANALYTICAL_SNAPSHOT', natural_key: ['source_id'],
    fields: {
      source_id: scalar({ required: true }), source_type: scalar({ required: true }),
      system: scalar({ note: 'free label; NEVER a coupled provider type' }),
      uri_or_label: scalar({}), source_timestamp: scalar({}), ingested_at: scalar({ required: true }),
      observation_period: scalar({}), content_hash: scalar({ required: true }),
    },
  },
  Evidence: {
    domain: 'PROVENANCE', kind: 'ANALYTICAL_SNAPSHOT', natural_key: ['evidence_id'],
    fields: {
      evidence_id: scalar({ required: true }), source_id: ref({ required: true }),
      kind: enom(['EXCERPT', 'ROW', 'AGGREGATE', 'SCREENSHOT_NOTE', 'QUOTE', 'OTHER']),
      locator: scalar({}), extracted: scalar({}),
    },
  },
  EvidenceReference: {
    domain: 'PROVENANCE', kind: 'ANALYTICAL_SNAPSHOT', natural_key: ['ref_id'],
    fields: {
      ref_id: scalar({ required: true }), source_id: ref({ required: true }),
      evidence_id: ref({}), locator: scalar({}), quote: scalar({}),
    },
  },
  Provenance: {
    domain: 'PROVENANCE', kind: 'ANALYTICAL_SNAPSHOT', natural_key: ['provenance_id'],
    fields: {
      provenance_id: scalar({ required: true }),
      source_class: enom(['OBSERVED', 'COMPUTED', 'INFERRED', 'USER_PROVIDED'], { required: true }),
      evidence_refs: refList({ required: true }), transform: scalar({}), transform_version: scalar({}),
      as_of: scalar({}), observed_period: scalar({}), ingested_at: scalar({}),
      freshness_days: scalar({}), content_hash: scalar({ required: true }),
    },
  },
  ConfidenceAssessment: {
    domain: 'PROVENANCE', kind: 'ANALYTICAL_SNAPSHOT', natural_key: ['assessment_id'],
    fields: {
      assessment_id: scalar({ required: true }),
      score: metric({ required: true, note: 'COMPUTED by deterministic:ucdm/confidence' }),
      band: enom(['VERY_LOW', 'LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH'], { required: true }),
      reason_codes: list({ required: true }), signals: scalar({ required: true }),
      weights_version: scalar({ required: true }),
      llm_explanation: scalar({ note: 'OPTIONAL prose; never an input to the score' }),
    },
  },
};

// Registry lint: no canonical entity may carry a provider-coupled field name. Runs at load.
const PROVIDER_COUPLED = /^(meta|facebook|instagram|whatsapp|stripe|ga4|google_analytics|hubspot|salesforce|shopify|mailchimp|klaviyo|zapier)[_-]/i;
for (const [name, def] of Object.entries(ENTITIES)) {
  for (const fld of Object.keys(def.fields)) {
    if (PROVIDER_COUPLED.test(fld)) throw new Error(`[ASTRA-11B] entities.js lint: ${name}.${fld} is provider-coupled — core model must stay provider-neutral`);
  }
  def.name = name;
}

module.exports = {
  SCHEMA_VERSION, ENTITIES,
  VOC_ASPECTS, AWARENESS, SOPHISTICATION, JOURNEY_STAGE_DEFAULT, FUNNEL_STAGE_LIBRARY, PROVIDER_COUPLED,
  entityNames: () => Object.keys(ENTITIES),
};
