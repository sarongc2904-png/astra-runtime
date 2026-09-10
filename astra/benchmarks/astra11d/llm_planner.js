'use strict';
// [ASTRA-11D benchmark] Research planner contract.
// The CORE engine is deterministic and does not need an LLM. This file holds:
//  - a deterministic `mockPlanner` (the only planner runnable in this gate)
//  - `enforceAuthorizedScope` (re-export) — the deterministic gate any experimental
//    LLM-authored plan MUST pass before the engine will accept it
//  - `llmPlannerStub` — the shape of a future LLM planner; it THROWS if invoked, because
//    a real provider call needs a separate human authorization + ceilings + isolation.
// No LLM call happens here. No network.
const { makeResearchPlan, enforceAuthorizedScope } = require('../../src/commercial/research/plan');

// mockPlanner.plan(request) -> a deterministic ResearchPlan built only from the request.
const mockPlanner = Object.freeze({
  planner_id: 'mock.deterministic',
  uses_llm: false,
  plan(request) {
    return makeResearchPlan({
      request,
      evidence_needed: request.objectives.map(o => ({
        for_objective: o,
        fact_types: FACT_TYPES_FOR_OBJECTIVE[o] || [],
        min_facts: 2,
        min_distinct_sources: 2,
      })),
      min_evidence_coverage: 0.6,
      stopping_criteria: { max_sources: 50, coverage_target: 0.8, max_conflicts_unresolved: 999 },
    });
  },
});

const FACT_TYPES_FOR_OBJECTIVE = {
  PRICING: ['COMPETITOR_PRICE'],
  MESSAGING: ['ADVERTISED_PROMISE', 'PUBLISHED_CLAIM', 'OBSERVED_CTA'],
  OFFERS: ['OFFER_COMPONENT', 'OBSERVED_GUARANTEE'],
  CUSTOMER_PROBLEMS: ['REVIEW_COMPLAINT', 'REVIEW_DESIRE', 'REVIEW_STATEMENT'],
  COMPETITOR_LANDSCAPE: ['LOCATION_SERVED', 'PRODUCT_CATEGORY'],
  DEMAND_SIGNALS: ['REVIEW_COUNT', 'RATING'],
  MARKET_OVERVIEW: ['RATING', 'PRODUCT_CATEGORY'],
};

// The future LLM planner slot. Intentionally inert in this gate.
const llmPlannerStub = Object.freeze({
  planner_id: 'llm.experimental',
  uses_llm: true,
  plan() {
    throw new Error('[ASTRA-11D] the experimental LLM research planner is not enabled — it needs a separate human authorization with request/cost ceilings and secret redaction, modelled on astra/benchmarks/astra10ah. Use mockPlanner.');
  },
  // If, under a future authorization, a real LLM produces a candidate plan object, it MUST
  // pass this deterministic gate before the engine will run it.
  acceptCandidate(candidatePlanObject, request) {
    const gate = enforceAuthorizedScope(candidatePlanObject, request);
    if (!gate.authorized) throw new Error(`[ASTRA-11D] LLM plan rejected — scope violations: ${gate.violations.join(' | ')}`);
    return candidatePlanObject;
  },
});

module.exports = { mockPlanner, llmPlannerStub, enforceAuthorizedScope, FACT_TYPES_FOR_OBJECTIVE };
