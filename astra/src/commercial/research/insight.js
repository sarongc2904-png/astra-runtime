'use strict';
// [ASTRA-11D] MarketInsight (spec: MARKET INSIGHTS step). An insight promotes a SUPPORTED /
// PARTIALLY_SUPPORTED claim to a named finding tied to a research objective, still fully
// evidence-bound. It is NOT a strategic recommendation (that is a later ASTRA phase).
// The insight statement is templated deterministically (no LLM in the core engine).
// No LLM, no web, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

// Which objective a fact_type informs (deterministic map).
const FACT_TYPE_OBJECTIVE = {
  COMPETITOR_PRICE: 'PRICING', ADVERTISED_PROMISE: 'MESSAGING', PUBLISHED_CLAIM: 'MESSAGING',
  OFFER_COMPONENT: 'OFFERS', OBSERVED_GUARANTEE: 'OFFERS', OBSERVED_CTA: 'MESSAGING',
  REVIEW_COMPLAINT: 'CUSTOMER_PROBLEMS', REVIEW_DESIRE: 'CUSTOMER_PROBLEMS', REVIEW_STATEMENT: 'CUSTOMER_PROBLEMS',
  RATING: 'MARKET_OVERVIEW', REVIEW_COUNT: 'DEMAND_SIGNALS',
  LOCATION_SERVED: 'COMPETITOR_LANDSCAPE', PRODUCT_CATEGORY: 'MARKET_OVERVIEW',
};

// deriveInsights({ claims, request }) -> insights[]
function deriveInsights({ claims, request }) {
  const reqObj = new Set((request && request.objectives) || []);
  const insights = [];
  for (const c of claims) {
    if (c.status === 'INSUFFICIENT') continue;
    const objective = FACT_TYPE_OBJECTIVE[c.fact_type] || 'MARKET_OVERVIEW';
    if (reqObj.size && !reqObj.has(objective) && !reqObj.has('MARKET_OVERVIEW')) continue; // only report on authorized objectives

    const qualifier = c.status === 'CONFLICTED' ? 'Evidence conflicts: ' : c.status === 'PARTIALLY_SUPPORTED' ? 'Partially supported: ' : '';
    const body = {
      schema_version: 'ucdm-research-1.0.0',
      objective,
      statement: `${qualifier}${c.statement}`,
      statement_source: 'deterministic:ucdm/research',
      claim_refs: [c.claim_id],
      supporting_fact_refs: [...c.supporting_fact_refs],
      conflict_refs: [...c.conflict_refs],
      scope: c.scope,
      confidence: c.confidence,
      confidence_band: c.confidence.band,
      status: c.status,
      is_recommendation: false, // ASTRA-11D never emits a recommendation
    };
    body.insight_id = 'min_' + sha256Hex(canonicalize({ ...body, insight_id: undefined, confidence: c.confidence.content_hash }));
    insights.push(deepFreeze(body));
  }
  return insights;
}

module.exports = { FACT_TYPE_OBJECTIVE, deriveInsights };
