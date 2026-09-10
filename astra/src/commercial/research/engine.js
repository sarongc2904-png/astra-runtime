'use strict';
// [ASTRA-11D] Market Research Engine — the deterministic pipeline orchestrator.
//   REQUEST -> PLAN -> EVIDENCE COLLECTION -> ASTRA-11C INGESTION -> NORMALIZED OBSERVATIONS
//   -> MARKET FACT EXTRACTION -> EVIDENCE AGGREGATION -> CLAIM FORMATION -> CONFLICT DETECTION
//   -> MARKET INSIGHTS -> CONFIDENCE -> MARKET RESEARCH REPORT
// Fully deterministic. NO LLM, NO web, NO I/O. Reproducible from identical inputs.
// No ASTRA-11D output may feed production routing or autonomous action.
const { ingest } = require('../ingestion/pipeline');
const { extractFacts, validateMarketFact } = require('./market_fact');
const { detectConflicts } = require('./conflict');
const { aggregate } = require('./aggregate');
const { formClaims, validateClaim } = require('./market_claim');
const { deriveInsights } = require('./insight');
const { makeMarketResearchReport } = require('./report');
const { compositeAdapter } = require('./research_source_adapter');
const { computeCoverage } = require('./coverage');
const { extractPricingObservations, computePricingStats, validatePricingObservation } = require('./pricing');
const L = require('./landscapes');
const { assessSophistication } = require('./sophistication');
const { deriveGapCandidates, validateGapCandidate, deriveOpportunities, validateOpportunity } = require('./gap_opportunity');
const { assessCompletion } = require('./completion');

// runMarketResearch({ request, plan, providers, referenceTime, batch_id, adapter?, ingestLedger? })
function runMarketResearch(opts) {
  const { request, plan, providers, referenceTime, batch_id } = opts;
  if (!request || !request.request_id) throw new Error('[ASTRA-11D] runMarketResearch: a valid MarketResearchRequest is required');
  if (!plan || plan.request_id !== request.request_id) throw new Error('[ASTRA-11D] runMarketResearch: plan must match the request');
  if (!referenceTime) throw new Error('[ASTRA-11D] runMarketResearch: referenceTime is required (no implicit clock)');
  if (!batch_id) throw new Error('[ASTRA-11D] runMarketResearch: batch_id is required');
  if (!Array.isArray(providers) || providers.length === 0) throw new Error('[ASTRA-11D] runMarketResearch: at least one ResearchSourceProvider is required');

  // ---- EVIDENCE COLLECTION: providers -> raw provider-shaped payloads ----
  const rawInputs = [];
  for (const p of providers) {
    if (p.provider_kind === 'LIVE') throw new Error(`[ASTRA-11D] provider "${p.provider_id}" is LIVE — not authorized in this gate`);
    for (const row of p.collect(plan, { referenceTime })) rawInputs.push({ ...row, _provider_id: p.provider_id });
  }

  // ---- ASTRA-11C INGESTION -> NORMALIZED OBSERVATIONS ----
  const ing = ingest({
    rawInputs: rawInputs.map(r => { const { _provider_id, ...rest } = r; return rest; }),
    adapter: opts.adapter || compositeAdapter(), referenceTime, batch_id: `${batch_id}::ingest`, ledger: opts.ingestLedger,
  });
  const observations = ing.observations;
  const envelopesBySource = {};
  for (const e of ing.envelopes) envelopesBySource[e.source_id] = e;

  // ---- MARKET FACT EXTRACTION (OBSERVED/USER_PROVIDED observations only; INFERRED excluded) ----
  const geo = request.geography && request.geography !== 'UNKNOWN' ? request.geography : 'UNKNOWN';
  const { facts, excluded_inferred, skipped } = extractFacts(observations, { referenceTime, geography: geo });
  for (const f of facts) { const v = validateMarketFact(f); if (!v.valid) throw new Error(`[ASTRA-11D] extracted an invalid MarketFact: ${v.errors.join(' | ')}`); }

  // ---- CONFLICT DETECTION ----
  const { conflicts, conflicted_fact_ids } = detectConflicts(facts);

  // ---- EVIDENCE AGGREGATION (+ COMPUTED roll-up facts) ----
  const { aggregates, computed_facts } = aggregate(facts, { referenceTime, conflictedFactIds: conflicted_fact_ids });
  for (const f of computed_facts) { const v = validateMarketFact(f); if (!v.valid) throw new Error(`[ASTRA-11D] invalid COMPUTED MarketFact: ${v.errors.join(' | ')}`); }

  // ---- CLAIM FORMATION (deterministic status + scope gate) ----
  const claims = formClaims({ aggregates, computedFacts: computed_facts, conflicts, plan });
  for (const c of claims) { const v = validateClaim(c); if (!v.valid) throw new Error(`[ASTRA-11D] invalid MarketClaim: ${v.errors.join(' | ')}`); }

  // ---- MARKET INSIGHTS (evidence-bound; never a recommendation) ----
  const insights = deriveInsights({ claims, request });

  // ===== [ASTRA-11D remediation] additional deterministic analysis passes =====
  const coverage = computeCoverage({ observations, facts, dedupe: ing.dedupe, envelopesBySource, request, plan, referenceTime });

  const { pricing_observations, excluded_inferred: pricing_excluded_inferred } = extractPricingObservations(observations);
  for (const p of pricing_observations) { const v = validatePricingObservation(p); if (!v.valid) throw new Error(`[ASTRA-11D] invalid PricingObservation: ${v.errors.join(' | ')}`); }
  const pricing_stats = computePricingStats(pricing_observations, { referenceTime });

  const offer_items = L.extractOfferComponents(observations);
  const offer_frequencies = L.computeComponentFrequencies(offer_items, coverage.competitor_count);
  const message_observations = L.extractMessageObservations(observations);
  const message_frequencies = L.computeMessageFrequencies(message_observations);
  const customer_signals = L.extractCustomerSignals(observations);
  const demand_set = L.extractDemandSignals(observations, { envelopesBySource, referenceTime });

  const sophistication = assessSophistication({
    messageFrequencies: message_frequencies, competitorCount: coverage.competitor_count,
    evidenceRefs: [...new Set(message_observations.flatMap(m => m.evidence_refs))], referenceTime,
  });

  const gap_candidates = deriveGapCandidates({ offerFrequencies: offer_frequencies, messageFrequencies: message_frequencies, pricingStats: pricing_stats, customerSignals: customer_signals, competitorCount: coverage.competitor_count });
  for (const g of gap_candidates) { const v = validateGapCandidate(g); if (!v.valid) throw new Error(`[ASTRA-11D] invalid MarketGapCandidate: ${v.errors.join(' | ')}`); }
  const opportunities = deriveOpportunities({ gapCandidates: gap_candidates, claims, request });
  for (const o of opportunities) { const v = validateOpportunity(o); if (!v.valid) throw new Error(`[ASTRA-11D] invalid MarketOpportunity: ${v.errors.join(' | ')}`); }

  const completion = assessCompletion({ coverage, pricingStats: pricing_stats, customerSignals: customer_signals, conflicts, ingestion: ing, plan, request });

  // ---- MARKET RESEARCH REPORT (full 18-section representation) ----
  const report = makeMarketResearchReport({
    request, plan, batch: ing.batch, observations,
    facts, computed_facts, aggregates, conflicts, claims, insights,
    excluded_inferred: [...excluded_inferred, ...pricing_excluded_inferred], referenceTime,
    coverage, pricing_stats, pricing_observations, offer_frequencies, message_frequencies, message_observations,
    customer_signals, demand_set, sophistication, gap_candidates, opportunities, completion,
  });

  return {
    report,
    request, plan,
    ingestion: ing,
    observations,
    facts, computed_facts, aggregates, conflicts, claims, insights,
    coverage, pricing_observations, pricing_stats, offer_items, offer_frequencies,
    message_observations, message_frequencies, customer_signals, demand_set,
    sophistication, gap_candidates, opportunities, completion,
    excluded_inferred: [...excluded_inferred, ...pricing_excluded_inferred], skipped,
    provenance_note: 'ASTRA-11D deterministic pipeline. MarketFacts are OBSERVED/COMPUTED only. No LLM. No production routing. No autonomous action.',
  };
}

module.exports = { runMarketResearch };
