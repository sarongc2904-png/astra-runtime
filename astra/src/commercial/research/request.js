'use strict';
// [ASTRA-11D] MarketResearchRequest (spec section A). Provider-neutral. UNKNOWN stays valid.
// Deterministic. No LLM, no web, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const { UNKNOWN, isUnknown } = require('../provenance/provenance');

const RESEARCH_SCHEMA_VERSION = 'ucdm-research-1.0.0';
const UCDM_SCHEMA_VERSION = require('../schema/entities').SCHEMA_VERSION;   // ucdm-1.0.0
const INGEST_SCHEMA_VERSION = require('../ingestion/raw_source').INGEST_SCHEMA_VERSION; // ucdm-ingest-1.0.0

const RESEARCH_OBJECTIVES = Object.freeze([
  'MARKET_OVERVIEW', 'CUSTOMER_PROBLEMS', 'COMPETITOR_LANDSCAPE', 'PRICING', 'OFFERS',
  'MESSAGING', 'DEMAND_SIGNALS', 'TRENDS', 'CATEGORY_SOPHISTICATION', 'MARKET_GAPS',
  'PURCHASE_BARRIERS', 'ALTERNATIVES',
]);

const REQUEST_FIELDS = new Set([
  'business_ref', 'product_or_service', 'category', 'geography', 'target_customer',
  'research_questions', 'objectives', 'research_scope', 'time_window', 'language', 'locale', 'constraints',
]);
const REQUIRED = ['business_ref', 'product_or_service', 'objectives'];

function validateMarketResearchRequest(input) {
  const errors = [];
  if (!input || typeof input !== 'object') return { valid: false, errors: ['request must be an object'] };
  for (const k of Object.keys(input)) if (!REQUEST_FIELDS.has(k)) errors.push(`unknown request field "${k}" (fail closed)`);
  for (const k of REQUIRED) if (input[k] == null || (Array.isArray(input[k]) && input[k].length === 0)) errors.push(`missing required field "${k}"`);
  const objs = input.objectives || [];
  if (!Array.isArray(objs) || objs.length === 0) errors.push('objectives must be a non-empty array');
  for (const o of objs) if (o !== 'UNKNOWN' && !RESEARCH_OBJECTIVES.includes(o)) errors.push(`unknown objective "${o}"`);
  if (input.research_questions != null && !Array.isArray(input.research_questions)) errors.push('research_questions must be an array');
  if (input.time_window != null) {
    const w = input.time_window;
    if (typeof w !== 'object' || (w.start != null && Number.isNaN(Date.parse(w.start))) || (w.end != null && Number.isNaN(Date.parse(w.end)))) errors.push('invalid time_window');
  }
  return { valid: errors.length === 0, errors };
}

function makeMarketResearchRequest(input) {
  const v = validateMarketResearchRequest(input);
  if (!v.valid) throw new Error(`[ASTRA-11D] invalid MarketResearchRequest: ${v.errors.join(' | ')}`);
  const req = {
    schema_version: RESEARCH_SCHEMA_VERSION,
    downstream_schema_versions: { ucdm: UCDM_SCHEMA_VERSION, ingest: INGEST_SCHEMA_VERSION },
    business_ref: String(input.business_ref),
    product_or_service: String(input.product_or_service),
    category: input.category != null ? (isUnknown(input.category) ? 'UNKNOWN' : String(input.category)) : 'UNKNOWN',
    geography: input.geography != null ? (isUnknown(input.geography) ? 'UNKNOWN' : input.geography) : 'UNKNOWN',
    target_customer: input.target_customer != null ? (isUnknown(input.target_customer) ? 'UNKNOWN' : String(input.target_customer)) : 'UNKNOWN',
    research_questions: Array.isArray(input.research_questions) ? input.research_questions.map(String) : [],
    objectives: [...input.objectives],
    research_scope: input.research_scope != null ? input.research_scope : { scope: 'SAMPLE' }, // SAMPLE | LOCAL | CATEGORY | GLOBAL
    time_window: input.time_window != null ? input.time_window : null,
    language: input.language != null ? String(input.language) : null,
    locale: input.locale != null ? String(input.locale) : null,
    constraints: input.constraints != null ? input.constraints : {},
  };
  req.request_id = 'mrq_' + sha256Hex(canonicalize({ ...req, request_id: undefined }));
  return deepFreeze(req);
}

module.exports = { RESEARCH_SCHEMA_VERSION, RESEARCH_OBJECTIVES, makeMarketResearchRequest, validateMarketResearchRequest, UNKNOWN };
