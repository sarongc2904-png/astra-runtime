# COMMERCIAL_ENTITY_CATALOG — ASTRA-11B

Generated from `astra/src/commercial/schema/entities.js` (schema_version `ucdm-1.0.0`). 39 canonical, provider-neutral entities.

Field kinds: **scalar** (plain value) · **prov** (must be a ProvenanceValue or UNKNOWN) · **metric** (canonical numeric — OBSERVED/USER_PROVIDED/COMPUTED only) · **enum** · **ref** / **ref_list** (entity or evidence-ref ids) · **stage_config** (configurable per-business stage list) · **list**.

## MARKET

### Business
- **kind:** OPERATIONAL_STATE  ·  **natural key:** `business_slug`

| field | kind | req | enum / note |
|---|---|---|---|
| `business_slug` | scalar | Y |  |
| `name` | scalar | Y |  |
| `description` | prov |  |  |
| `model_type` | enum |  | `B2B | B2C | B2B2C | MARKETPLACE | UNKNOWN` |
| `stage` | enum |  | `IDEA | EARLY | GROWTH | SCALE | MATURE | UNKNOWN` |
| `primary_geo` | prov |  |  |
| `currency` | scalar |  | ISO 4217; operational config, not a metric |

### Market
- **kind:** ANALYTICAL_SNAPSHOT  ·  **natural key:** `business_ref, market_slug`

| field | kind | req | enum / note |
|---|---|---|---|
| `business_ref` | ref | Y |  |
| `market_slug` | scalar | Y |  |
| `category` | prov | Y |  |
| `trends` | list |  |  |
| `constraints` | list |  |  |
| `tam_note` | prov |  | narrative only; any $ here is annotation, not canonical |
| `tam_value` | metric |  | canonical size — OBSERVED/USER_PROVIDED/COMPUTED only |

### MarketObservation
- **kind:** ANALYTICAL_SNAPSHOT  ·  **natural key:** `market_ref, observation_slug`

| field | kind | req | enum / note |
|---|---|---|---|
| `market_ref` | ref | Y |  |
| `observation_slug` | scalar | Y |  |
| `statement` | prov | Y |  |
| `observation_type` | enum |  | `TREND | REGULATION | DEMAND_SIGNAL | PRICING_SIGNAL | COMPETITIVE_MOVE | OTHER` |
| `magnitude` | metric |  |  |
| `evidence_refs` | ref_list | Y |  |

### Competitor
- **kind:** ANALYTICAL_SNAPSHOT  ·  **natural key:** `market_ref, competitor_slug`

| field | kind | req | enum / note |
|---|---|---|---|
| `market_ref` | ref | Y |  |
| `competitor_slug` | scalar | Y |  |
| `name` | scalar | Y |  |
| `positioning` | prov |  |  |
| `strengths` | list |  |  |
| `weaknesses` | list |  |  |
| `pricing_note` | prov |  |  |
| `price_points` | metric |  |  |
| `evidence_refs` | ref_list | Y | competitor facts are EXTERNAL_RESEARCH / USER_PROVIDED only |

## CUSTOMER

### Segment
- **kind:** ANALYTICAL_SNAPSHOT  ·  **natural key:** `business_ref, segment_slug`

| field | kind | req | enum / note |
|---|---|---|---|
| `business_ref` | ref | Y |  |
| `segment_slug` | scalar | Y |  |
| `name` | scalar | Y |  |
| `axis` | prov |  | INFERRED axis proposal is fine; the partition rule is deterministic |
| `rule` | scalar | Y | deterministic predicate spec |
| `size` | metric |  |  |
| `metrics` | scalar |  |  |

### Persona
- **kind:** ANALYTICAL_SNAPSHOT  ·  **natural key:** `business_ref, persona_slug`

| field | kind | req | enum / note |
|---|---|---|---|
| `business_ref` | ref | Y |  |
| `persona_slug` | scalar | Y |  |
| `name` | scalar | Y |  |
| `narrative` | prov |  |  |
| `current_situation` | prov |  |  |
| `desired_situation` | prov |  |  |
| `functional_pains` | list |  |  |
| `emotional_pains` | list |  |  |
| `desired_outcomes` | list |  |  |
| `fears` | list |  |  |
| `objections` | list |  |  |
| `triggers` | list |  |  |
| `alternatives` | list |  |  |
| `decision_criteria` | list |  |  |
| `awareness` | enum |  | `UNAWARE | PROBLEM_AWARE | SOLUTION_AWARE | PRODUCT_AWARE | MOST_AWARE | UNKNOWN` |
| `channels` | list |  |  |
| `language` | prov |  |  |
| `urgency` | enum |  | `LOW | MEDIUM | HIGH | UNKNOWN` |
| `ability_to_pay` | prov |  | firmographic/financial facts stay USER_PROVIDED or UNKNOWN |
| `linked_jobs` | ref_list |  |  |
| `voc_refs` | ref_list |  |  |

### ICP
- **kind:** ANALYTICAL_SNAPSHOT  ·  **natural key:** `business_ref, icp_slug`

| field | kind | req | enum / note |
|---|---|---|---|
| `business_ref` | ref | Y |  |
| `icp_slug` | scalar | Y |  |
| `industry` | prov |  |  |
| `company_size` | prov |  |  |
| `revenue_range` | prov |  |  |
| `location` | prov |  |  |
| `maturity` | prov |  |  |
| `budget` | prov |  |  |
| `urgency` | enum |  | `LOW | MEDIUM | HIGH | UNKNOWN` |
| `fit_criteria` | list |  |  |
| `disqualification_criteria` | list |  |  |

### VoiceOfCustomerObservation
- **kind:** ANALYTICAL_SNAPSHOT  ·  **natural key:** `business_ref, voc_slug`

| field | kind | req | enum / note |
|---|---|---|---|
| `business_ref` | ref | Y |  |
| `voc_slug` | scalar | Y |  |
| `exact_phrase` | prov | Y | verbatim customer language; OBSERVED, quote-backed |
| `aspect` | enum | Y | `PAIN | DESIRE | FEAR | OBJECTION | TRIGGER | ALTERNATIVE | DECISION_CRITERION | REASON_TO_BUY | REASON_NOT_TO_BUY | UNKNOWN` |
| `normalized_theme` | prov |  |  |
| `cluster_ref` | ref |  |  |
| `frequency_bucket` | metric |  | COMPUTED count of citing evidence items — never LLM |
| `evidence_refs` | ref_list | Y |  |

### JTBD
- **kind:** ANALYTICAL_SNAPSHOT  ·  **natural key:** `business_ref, job_slug`

| field | kind | req | enum / note |
|---|---|---|---|
| `business_ref` | ref | Y |  |
| `job_slug` | scalar | Y |  |
| `situation` | prov | Y |  |
| `motivation` | prov |  |  |
| `desired_outcome` | prov | Y |  |
| `functional_job` | prov |  |  |
| `emotional_job` | prov |  |  |
| `social_job` | prov |  |  |
| `push` | prov |  |  |
| `pull` | prov |  |  |
| `anxiety` | prov |  |  |
| `habit` | prov |  |  |
| `linked_voc` | ref_list |  |  |

### CustomerJourney
- **kind:** ANALYTICAL_SNAPSHOT  ·  **natural key:** `business_ref, journey_slug`

| field | kind | req | enum / note |
|---|---|---|---|
| `business_ref` | ref | Y |  |
| `journey_slug` | scalar | Y |  |
| `persona_ref` | ref |  |  |
| `stages` | stage_config | Y | configurable per business; default library: awareness/consideration/decision/onboarding/retention/advocacy |

### CustomerJourneyStage
- **kind:** ANALYTICAL_SNAPSHOT  ·  **natural key:** `journey_ref, stage_name`

| field | kind | req | enum / note |
|---|---|---|---|
| `journey_ref` | ref | Y |  |
| `stage_name` | scalar | Y |  |
| `order_index` | scalar | Y | integer position |
| `customer_goal` | prov |  |  |
| `customer_question` | prov |  |  |
| `emotion` | prov |  |  |
| `barrier` | prov |  |  |
| `trigger` | prov |  |  |
| `touchpoint` | prov |  |  |
| `company_objective` | prov |  |  |
| `message` | prov |  |  |
| `cta` | prov |  |  |
| `metric_ref` | ref |  |  |
| `failure_mode` | prov |  |  |
| `opportunity` | prov |  |  |

## STRATEGY

### Positioning
- **kind:** ANALYTICAL_SNAPSHOT  ·  **natural key:** `business_ref, positioning_slug`

| field | kind | req | enum / note |
|---|---|---|---|
| `business_ref` | ref | Y |  |
| `positioning_slug` | scalar | Y |  |
| `frame` | prov | Y |  |
| `alternative` | prov |  |  |
| `differentiator` | prov | Y |  |
| `proof_points` | list |  | each element: {claim(prov), proof_ref}; unproven -> POR_VALIDAR |
| `target_segment_ref` | ref |  |  |

### Offer
- **kind:** ANALYTICAL_SNAPSHOT  ·  **natural key:** `business_ref, offer_slug`

| field | kind | req | enum / note |
|---|---|---|---|
| `business_ref` | ref | Y |  |
| `offer_slug` | scalar | Y |  |
| `core` | prov | Y |  |
| `value_stack` | list |  |  |
| `mechanism` | prov |  |  |
| `risk_reversal` | prov |  |  |
| `bonuses` | list |  |  |
| `price_framing` | prov |  |  |
| `price` | metric |  | USER_PROVIDED only |
| `margin` | metric |  | USER_PROVIDED/COMPUTED only |
| `capacity` | metric |  |  |
| `product_ref` | ref |  |  |

### Product
- **kind:** OPERATIONAL_STATE  ·  **natural key:** `business_ref, product_slug`

| field | kind | req | enum / note |
|---|---|---|---|
| `business_ref` | ref | Y |  |
| `product_slug` | scalar | Y |  |
| `name` | scalar | Y |  |
| `kind` | enum |  | `PHYSICAL | DIGITAL | SERVICE | SUBSCRIPTION | COURSE | OTHER | UNKNOWN` |
| `list_price` | metric |  |  |
| `currency` | scalar |  |  |
| `fulfillment_note` | prov |  |  |

## ACQUISITION

### Channel
- **kind:** OPERATIONAL_STATE  ·  **natural key:** `business_ref, channel_slug`

| field | kind | req | enum / note |
|---|---|---|---|
| `business_ref` | ref | Y |  |
| `channel_slug` | scalar | Y |  |
| `name` | scalar | Y |  |
| `channel_class` | enum |  | `PAID_SOCIAL | PAID_SEARCH | ORGANIC_SOCIAL | SEO | EMAIL | REFERRAL | DIRECT | MESSAGING | EVENTS | OTHER | UNKNOWN` |

### Campaign
- **kind:** OPERATIONAL_STATE  ·  **natural key:** `business_ref, campaign_slug`

| field | kind | req | enum / note |
|---|---|---|---|
| `business_ref` | ref | Y |  |
| `campaign_slug` | scalar | Y |  |
| `name` | scalar | Y |  |
| `channel_ref` | ref | Y |  |
| `objective` | enum |  | `AWARENESS | TRAFFIC | LEADS | CONVERSIONS | SALES | RETENTION | OTHER | UNKNOWN` |
| `offer_ref` | ref |  |  |
| `start_at` | scalar |  |  |
| `end_at` | scalar |  |  |
| `spend` | metric |  |  |
| `status` | enum |  | `DRAFT | ACTIVE | PAUSED | ENDED | UNKNOWN` |

### Creative
- **kind:** OPERATIONAL_STATE  ·  **natural key:** `campaign_ref, creative_slug`

| field | kind | req | enum / note |
|---|---|---|---|
| `campaign_ref` | ref | Y |  |
| `creative_slug` | scalar | Y |  |
| `format` | enum |  | `IMAGE | VIDEO | CAROUSEL | TEXT | LANDING | EMAIL | OTHER | UNKNOWN` |
| `angle` | prov |  |  |
| `hook` | prov |  |  |
| `body` | prov |  |  |
| `cta` | prov |  |  |
| `asset_ref` | scalar |  |  |

### Lead
- **kind:** OPERATIONAL_STATE  ·  **natural key:** `business_ref, lead_key`

| field | kind | req | enum / note |
|---|---|---|---|
| `business_ref` | ref | Y |  |
| `lead_key` | scalar | Y | stable per-business contact key (hashed identifier) |
| `created_at` | scalar | Y |  |
| `source_channel_ref` | ref |  |  |
| `campaign_ref` | ref |  |  |
| `journey_stage` | scalar |  | a stage NAME from the business journey config |
| `segment_ref` | ref |  |  |
| `qualified` | enum |  | `YES | NO | UNKNOWN` |
| `attributes` | scalar |  |  |

### Conversation
- **kind:** OPERATIONAL_STATE  ·  **natural key:** `lead_ref, conversation_slug`

| field | kind | req | enum / note |
|---|---|---|---|
| `lead_ref` | ref | Y |  |
| `conversation_slug` | scalar | Y |  |
| `medium` | enum |  | `MESSAGING | CALL | EMAIL | IN_PERSON | OTHER | UNKNOWN` |
| `started_at` | scalar | Y |  |
| `ended_at` | scalar |  |  |
| `outcome` | enum |  | `NO_RESPONSE | ENGAGED | QUALIFIED | DISQUALIFIED | BOOKED | LOST | WON | UNKNOWN` |
| `transcript_source_ref` | ref |  | points to a Source in the evidence graph, if captured |

### Appointment
- **kind:** OPERATIONAL_STATE  ·  **natural key:** `lead_ref, appointment_slug`

| field | kind | req | enum / note |
|---|---|---|---|
| `lead_ref` | ref | Y |  |
| `appointment_slug` | scalar | Y |  |
| `scheduled_at` | scalar | Y |  |
| `status` | enum | Y | `SCHEDULED | SHOW | NO_SHOW | RESCHEDULED | CANCELLED | UNKNOWN` |
| `opportunity_ref` | ref |  |  |

### Opportunity
- **kind:** OPERATIONAL_STATE  ·  **natural key:** `business_ref, opportunity_key`

| field | kind | req | enum / note |
|---|---|---|---|
| `business_ref` | ref | Y |  |
| `opportunity_key` | scalar | Y |  |
| `lead_ref` | ref | Y |  |
| `offer_ref` | ref |  |  |
| `stage` | enum | Y | `OPEN | NEGOTIATION | WON | LOST | UNKNOWN` |
| `expected_value` | metric |  |  |
| `created_at` | scalar | Y |  |
| `closed_at` | scalar |  |  |

## REVENUE

### Sale
- **kind:** OPERATIONAL_STATE  ·  **natural key:** `business_ref, sale_key`

| field | kind | req | enum / note |
|---|---|---|---|
| `business_ref` | ref | Y |  |
| `sale_key` | scalar | Y |  |
| `opportunity_ref` | ref |  |  |
| `lead_ref` | ref |  |  |
| `offer_ref` | ref |  |  |
| `product_ref` | ref |  |  |
| `occurred_at` | scalar | Y |  |
| `amount` | metric | Y | OBSERVED/USER_PROVIDED only |
| `currency` | scalar | Y |  |
| `kind` | enum |  | `NEW | RENEWAL | EXPANSION | ONE_TIME | UNKNOWN` |

### RevenueEvent
- **kind:** ANALYTICAL_SNAPSHOT  ·  **natural key:** `business_ref, revenue_event_key`

| field | kind | req | enum / note |
|---|---|---|---|
| `business_ref` | ref | Y |  |
| `revenue_event_key` | scalar | Y |  |
| `event_type` | enum | Y | `NEW_MRR | EXPANSION_MRR | CONTRACTION_MRR | CHURNED_MRR | ONE_TIME | REFUND` |
| `amount` | metric | Y |  |
| `currency` | scalar | Y |  |
| `occurred_at` | scalar | Y |  |
| `account_key` | scalar |  |  |
| `sale_ref` | ref |  |  |

### RetentionEvent
- **kind:** ANALYTICAL_SNAPSHOT  ·  **natural key:** `business_ref, retention_event_key`

| field | kind | req | enum / note |
|---|---|---|---|
| `business_ref` | ref | Y |  |
| `retention_event_key` | scalar | Y |  |
| `account_key` | scalar | Y |  |
| `event_type` | enum | Y | `ACTIVATED | RENEWED | CHURNED | REACTIVATED | DOWNGRADED | UPGRADED` |
| `occurred_at` | scalar | Y |  |
| `cohort_period` | scalar |  |  |
| `mrr_delta` | metric |  |  |

### UpsellEvent
- **kind:** ANALYTICAL_SNAPSHOT  ·  **natural key:** `business_ref, upsell_event_key`

| field | kind | req | enum / note |
|---|---|---|---|
| `business_ref` | ref | Y |  |
| `upsell_event_key` | scalar | Y |  |
| `account_key` | scalar | Y |  |
| `from_offer_ref` | ref |  |  |
| `to_offer_ref` | ref | Y |  |
| `occurred_at` | scalar | Y |  |
| `amount` | metric |  |  |
| `trigger` | prov |  |  |

## OPTIMIZATION

### Funnel
- **kind:** ANALYTICAL_SNAPSHOT  ·  **natural key:** `business_ref, funnel_slug`

| field | kind | req | enum / note |
|---|---|---|---|
| `business_ref` | ref | Y |  |
| `funnel_slug` | scalar | Y |  |
| `stages` | stage_config | Y | configurable per business; library: impression/click/landing/lead/conversation/qualified/appointment/show/opportunity/sale/activation/upsell/retention |
| `observation_window` | scalar |  |  |

### FunnelStage
- **kind:** ANALYTICAL_SNAPSHOT  ·  **natural key:** `funnel_ref, stage_name`

| field | kind | req | enum / note |
|---|---|---|---|
| `funnel_ref` | ref | Y |  |
| `stage_name` | scalar | Y |  |
| `order_index` | scalar | Y |  |
| `entered` | metric |  |  |
| `exited` | metric |  |  |
| `event_source_refs` | ref_list |  |  |

### FunnelTransition
- **kind:** ANALYTICAL_SNAPSHOT  ·  **natural key:** `funnel_ref, from_stage, to_stage, observation_window`

| field | kind | req | enum / note |
|---|---|---|---|
| `funnel_ref` | ref | Y |  |
| `from_stage` | scalar | Y |  |
| `to_stage` | scalar | Y |  |
| `observation_window` | scalar | Y |  |
| `entered` | metric | Y |  |
| `exited` | metric | Y |  |
| `conversion_rate` | metric | Y | COMPUTED by funnel_math only — never LLM |
| `dropoff_rate` | metric | Y | COMPUTED by funnel_math only |
| `cost` | metric |  |  |
| `value` | metric |  |  |

### Metric
- **kind:** ANALYTICAL_SNAPSHOT  ·  **natural key:** `business_ref, metric_slug, period`

| field | kind | req | enum / note |
|---|---|---|---|
| `business_ref` | ref | Y |  |
| `metric_slug` | scalar | Y |  |
| `name` | scalar | Y |  |
| `period` | scalar | Y |  |
| `value` | metric | Y |  |
| `unit` | scalar |  |  |
| `definition_ref` | scalar |  | names the deterministic formula that produced it |
| `target` | metric |  |  |
| `baseline` | metric |  |  |

### Insight
- **kind:** ANALYTICAL_SNAPSHOT  ·  **natural key:** `business_ref, insight_slug`

| field | kind | req | enum / note |
|---|---|---|---|
| `business_ref` | ref | Y |  |
| `insight_slug` | scalar | Y |  |
| `kind` | enum | Y | `BOTTLENECK | OPPORTUNITY | RISK | PATTERN | ANOMALY | OTHER` |
| `statement` | prov | Y | narrative may be INFERRED; supporting numbers must be metric refs |
| `metric_refs` | ref_list | Y |  |
| `diagnosis` | prov |  |  |
| `evidence_refs` | ref_list | Y |  |
| `confidence` | scalar |  | a ConfidenceAssessment (deterministic) — see confidence.js |
| `severity` | enum |  | `LOW | MEDIUM | HIGH | CRITICAL | UNKNOWN` |

### Recommendation
- **kind:** ANALYTICAL_SNAPSHOT  ·  **natural key:** `business_ref, recommendation_slug`

| field | kind | req | enum / note |
|---|---|---|---|
| `business_ref` | ref | Y |  |
| `recommendation_slug` | scalar | Y |  |
| `problem` | prov | Y |  |
| `severity` | enum | Y | `LOW | MEDIUM | HIGH | CRITICAL | UNKNOWN` |
| `diagnosis` | prov |  |  |
| `insight_refs` | ref_list | Y |  |
| `evidence_refs` | ref_list | Y |  |
| `recommendation_text` | prov | Y | LLM-authored text allowed; refs + priority inputs validated deterministically |
| `expected_mechanism` | prov |  |  |
| `confidence` | scalar | Y | ConfidenceAssessment (deterministic) |
| `impact` | enum | Y | `LOW | MEDIUM | HIGH | UNKNOWN` |
| `effort` | enum | Y | `LOW | MEDIUM | HIGH | UNKNOWN` |
| `priority` | metric |  | COMPUTED from impact/effort/confidence — never LLM |
| `proposed_experiment_ref` | ref |  |  |
| `status` | enum | Y | `PROPOSED | ACCEPTED | IN_PROGRESS | DONE | REJECTED | SUPERSEDED` |

## EXPERIMENTATION

### Experiment
- **kind:** OPERATIONAL_STATE  ·  **natural key:** `business_ref, experiment_slug`

| field | kind | req | enum / note |
|---|---|---|---|
| `business_ref` | ref | Y |  |
| `experiment_slug` | scalar | Y |  |
| `problem` | prov | Y |  |
| `hypothesis` | prov | Y |  |
| `segment_ref` | ref |  |  |
| `variable` | scalar | Y |  |
| `baseline` | metric |  |  |
| `target` | metric |  |  |
| `primary_metric` | scalar | Y |  |
| `secondary_metrics` | list |  |  |
| `start_at` | scalar |  |  |
| `end_at` | scalar |  |  |
| `state` | enum | Y | `PROPOSED | APPROVED | RUNNING | COMPLETED` |
| `decision` | enum |  | `KEEP | ITERATE | REJECT | INCONCLUSIVE` |
| `result_ref` | ref |  |  |
| `learning_ref` | ref |  |  |
| `evidence_refs` | ref_list |  |  |

### ExperimentResult
- **kind:** ANALYTICAL_SNAPSHOT  ·  **natural key:** `experiment_ref`

| field | kind | req | enum / note |
|---|---|---|---|
| `experiment_ref` | ref | Y |  |
| `lift` | metric | Y | COMPUTED |
| `p_value` | metric |  |  |
| `confidence_interval` | scalar |  |  |
| `sample_size` | metric | Y |  |
| `decision` | enum | Y | `KEEP | ITERATE | REJECT | INCONCLUSIVE` |
| `computed_by` | scalar | Y | must be a deterministic:* producer |

## BUSINESS_MEMORY

### BusinessLearning
- **kind:** ANALYTICAL_SNAPSHOT  ·  **natural key:** `business_ref, learning_slug`

| field | kind | req | enum / note |
|---|---|---|---|
| `business_ref` | ref | Y |  |
| `learning_slug` | scalar | Y |  |
| `what_was_tried` | prov | Y |  |
| `why` | prov | Y |  |
| `context` | scalar | Y | {segment, offer, creative_or_message, where, when} |
| `result` | prov | Y |  |
| `learning` | prov | Y |  |
| `experiment_ref` | ref | Y |  |
| `evidence_refs` | ref_list | Y |  |
| `confidence` | scalar | Y | ConfidenceAssessment (deterministic) |
| `supersedes` | ref |  |  |

## PROVENANCE

### Source
- **kind:** ANALYTICAL_SNAPSHOT  ·  **natural key:** `source_id`

| field | kind | req | enum / note |
|---|---|---|---|
| `source_id` | scalar | Y |  |
| `source_type` | scalar | Y |  |
| `system` | scalar |  | free label; NEVER a coupled provider type |
| `uri_or_label` | scalar |  |  |
| `source_timestamp` | scalar |  |  |
| `ingested_at` | scalar | Y |  |
| `observation_period` | scalar |  |  |
| `content_hash` | scalar | Y |  |

### Evidence
- **kind:** ANALYTICAL_SNAPSHOT  ·  **natural key:** `evidence_id`

| field | kind | req | enum / note |
|---|---|---|---|
| `evidence_id` | scalar | Y |  |
| `source_id` | ref | Y |  |
| `kind` | enum |  | `EXCERPT | ROW | AGGREGATE | SCREENSHOT_NOTE | QUOTE | OTHER` |
| `locator` | scalar |  |  |
| `extracted` | scalar |  |  |

### EvidenceReference
- **kind:** ANALYTICAL_SNAPSHOT  ·  **natural key:** `ref_id`

| field | kind | req | enum / note |
|---|---|---|---|
| `ref_id` | scalar | Y |  |
| `source_id` | ref | Y |  |
| `evidence_id` | ref |  |  |
| `locator` | scalar |  |  |
| `quote` | scalar |  |  |

### Provenance
- **kind:** ANALYTICAL_SNAPSHOT  ·  **natural key:** `provenance_id`

| field | kind | req | enum / note |
|---|---|---|---|
| `provenance_id` | scalar | Y |  |
| `source_class` | enum | Y | `OBSERVED | COMPUTED | INFERRED | USER_PROVIDED` |
| `evidence_refs` | ref_list | Y |  |
| `transform` | scalar |  |  |
| `transform_version` | scalar |  |  |
| `as_of` | scalar |  |  |
| `observed_period` | scalar |  |  |
| `ingested_at` | scalar |  |  |
| `freshness_days` | scalar |  |  |
| `content_hash` | scalar | Y |  |

### ConfidenceAssessment
- **kind:** ANALYTICAL_SNAPSHOT  ·  **natural key:** `assessment_id`

| field | kind | req | enum / note |
|---|---|---|---|
| `assessment_id` | scalar | Y |  |
| `score` | metric | Y | COMPUTED by deterministic:ucdm/confidence |
| `band` | enum | Y | `VERY_LOW | LOW | MEDIUM | HIGH | VERY_HIGH` |
| `reason_codes` | list | Y |  |
| `signals` | scalar | Y |  |
| `weights_version` | scalar | Y |  |
| `llm_explanation` | scalar |  | OPTIONAL prose; never an input to the score |

