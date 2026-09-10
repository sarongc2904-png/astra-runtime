'use strict';
// [ASTRA-11D] MarketResearchReport (spec: MARKET RESEARCH REPORT step).
// Reproducible container: identical inputs -> identical report content_hash.
// No LLM, no web, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

// coverageByObjective(plan, facts, claims) -> deterministic per-objective coverage
function coverageByObjective(plan, facts, claims) {
  const out = {};
  for (const e of (plan.evidence_needed || [])) {
    const obj = e.for_objective;
    const relFacts = facts.filter(f => (e.fact_types || []).length === 0 || (e.fact_types || []).includes(f.fact_type));
    const relClaims = claims.filter(c => (e.fact_types || []).length === 0 || (e.fact_types || []).includes(c.fact_type));
    const distinctSources = new Set(relFacts.map(f => f.source_ref).filter(Boolean)).size;
    out[obj] = {
      fact_count: relFacts.length,
      distinct_sources: distinctSources,
      required_facts: e.min_facts,
      required_sources: e.min_distinct_sources,
      met: relFacts.length >= e.min_facts && distinctSources >= e.min_distinct_sources,
      supported_claims: relClaims.filter(c => c.status === 'SUPPORTED' || c.status === 'PARTIALLY_SUPPORTED').length,
      insufficient_claims: relClaims.filter(c => c.status === 'INSUFFICIENT').length,
    };
  }
  return out;
}

function makeMarketResearchReport({ request, plan, batch, observations, facts, computed_facts, aggregates, conflicts, claims, insights, excluded_inferred, referenceTime }) {
  const allFacts = [...facts, ...(computed_facts || [])];
  const coverage = coverageByObjective(plan, facts, claims);
  const objectivesMet = Object.values(coverage).filter(c => c.met).length;

  const confBands = {};
  for (const c of claims) confBands[c.confidence.band] = (confBands[c.confidence.band] || 0) + 1;

  const report = {
    schema_version: 'ucdm-research-1.0.0',
    downstream_schema_versions: request.downstream_schema_versions,
    request_id: request.request_id,
    plan_id: plan.plan_id,
    reference_time: referenceTime || null,
    scope: plan.scope,
    generated_by: 'deterministic:ucdm/research',
    counts: {
      sources: batch ? batch.source_count : 0,
      observations: observations.length,
      observed_facts: facts.length,
      computed_facts: (computed_facts || []).length,
      aggregates: aggregates.length,
      conflicts_open: conflicts.filter(c => c.status === 'OPEN').length,
      claims: claims.length,
      claims_supported: claims.filter(c => c.status === 'SUPPORTED').length,
      claims_partial: claims.filter(c => c.status === 'PARTIALLY_SUPPORTED').length,
      claims_conflicted: claims.filter(c => c.status === 'CONFLICTED').length,
      claims_insufficient: claims.filter(c => c.status === 'INSUFFICIENT').length,
      insights: insights.length,
      excluded_inferred: (excluded_inferred || []).length,
    },
    coverage_by_objective: coverage,
    objectives_met: objectivesMet,
    objectives_total: plan.objectives.length,
    confidence_band_histogram: confBands,
    // hashes of the constituent sets — order-independent, reproducible
    observation_hashes: observations.map(o => o.content_hash).sort(),
    fact_ids: allFacts.map(f => f.fact_id).sort(),
    conflict_ids: conflicts.map(c => c.conflict_id).sort(),
    claim_ids: claims.map(c => c.claim_id).sort(),
    insight_ids: insights.map(i => i.insight_id).sort(),
    excluded_inferred_refs: (excluded_inferred || []).map(e => e.observation_hash || e.content_hash).sort(),
    caveats: [
      'MarketFacts are OBSERVED/COMPUTED only — model knowledge is never a market fact.',
      'Claims broader than SAMPLE scope require corroboration; thin evidence is downgraded, not asserted.',
      'Open conflicts are surfaced, never auto-resolved.',
      'No ASTRA-11D output may feed production routing or autonomous action.',
    ],
  };

  // [ASTRA-11D remediation §11] Full section representation. Each section is either
  // populated or explicitly UNKNOWN — a missing section is never silently omitted.
  const x = arguments[0] || {};
  const sec = (val) => (val == null || (Array.isArray(val) && val.length === 0) || (typeof val === 'object' && !Array.isArray(val) && Object.keys(val).length === 0)) ? { status: 'UNKNOWN' } : val;
  report.sections = {
    executive_overview: sec(x.completion ? { research_status: x.completion.status, reason_codes: x.completion.reason_codes, scope: plan.scope, objectives_met: `${objectivesMet}/${plan.objectives.length}` } : null),
    research_scope: { scope: plan.scope, objectives: plan.objectives, requested_scope: (request.research_scope && request.research_scope.scope) || 'SAMPLE' },
    evidence_coverage: sec(x.coverage || null),
    category: { requested: request.category, observed: (x.coverage && x.coverage.category_coverage) || { status: 'UNKNOWN' } },
    market_observations: sec((facts || []).filter(f => ['PRODUCT_CATEGORY', 'RATING', 'LOCATION_SERVED'].includes(f.fact_type)).map(f => f.fact_id).sort()),
    customer_problem_signals: sec((x.customer_signals || []).map(s => ({ signal_type: s.signal_type, verbatim_hash: s.verbatim_hash, evidence_refs: s.evidence_refs }))),
    competitor_landscape: sec(x.coverage ? { competitor_count: x.coverage.competitor_count } : null),
    pricing_landscape: sec(x.pricing_stats || null),
    offer_landscape: sec(x.offer_frequencies || null),
    messaging_landscape: sec(x.message_frequencies || null),
    demand_signals: sec(x.demand_set || null),
    market_sophistication: sec(x.sophistication || null),
    conflicts: sec(conflicts.map(c => c.conflict_id).sort()),
    gaps: sec((x.gap_candidates || []).map(g => g.gap_id).sort()),
    opportunities: sec((x.opportunities || []).map(o => o.opportunity_id).sort()),
    unknowns: buildUnknowns(x, plan),
    research_limitations: sec(x.completion ? x.completion.reason_codes : null),
    evidence_appendix: buildEvidenceAppendix(allFacts, x),
  };
  report.section_names = Object.keys(report.sections);

  // [ASTRA-11D remediation W32] deterministic evidence-graph validity: every claim's
  // supporting facts resolve to facts in the report, and every fact's evidence_refs
  // appear in the appendix.
  const factIdSet = new Set(allFacts.map(f => f.fact_id));
  const appendixRefs = new Set(report.sections.evidence_appendix.entries ? report.sections.evidence_appendix.entries.map(e => e.evidence_ref) : []);
  const graphErrors = [];
  for (const c of claims) for (const fr of c.supporting_fact_refs) if (!factIdSet.has(fr)) graphErrors.push(`claim ${c.claim_id} -> missing fact ${fr}`);
  for (const f of facts) for (const er of f.evidence_refs) if (!appendixRefs.has(er)) graphErrors.push(`fact ${f.fact_id} -> evidence ${er} not in appendix`);
  report.evidence_graph_valid = graphErrors.length === 0;
  report.evidence_graph_errors = graphErrors.sort();

  if (x.completion) report.research_completion = x.completion.status;

  report.report_id = 'mrr_' + sha256Hex(canonicalize({ ...report, report_id: undefined }));
  report.content_hash = report.report_id;
  return deepFreeze(report);
}

function buildUnknowns(x, plan) {
  const u = [];
  if (!x.pricing_stats || Object.keys(x.pricing_stats.by_currency || {}).length === 0) u.push('pricing_landscape');
  if (!x.customer_signals || x.customer_signals.length === 0) u.push('customer_problem_signals');
  if (!x.sophistication || x.sophistication.stage === 'UNKNOWN') u.push('market_sophistication');
  if (!x.demand_set || x.demand_set.signals.length === 0) u.push('demand_signals');
  if (!x.offer_frequencies || x.offer_frequencies.frequencies.length === 0) u.push('offer_landscape');
  return u.sort();
}

function buildEvidenceAppendix(allFacts, x) {
  const entries = [];
  const seen = new Set();
  const add = (evidence_ref, source_ref) => { const k = `${evidence_ref}::${source_ref}`; if (evidence_ref && !seen.has(k)) { seen.add(k); entries.push({ evidence_ref, source_ref: source_ref || null }); } };
  for (const f of allFacts) for (const er of (f.evidence_refs || [])) add(er, f.source_ref);
  for (const s of (x.customer_signals || [])) for (const er of s.evidence_refs) add(er, s.source_ref);
  for (const m of (x.message_observations || [])) for (const er of m.evidence_refs) add(er, m.source_ref);
  for (const p of (x.pricing_observations || [])) for (const er of p.evidence_refs) add(er, p.source_ref);
  entries.sort((a, b) => (a.evidence_ref < b.evidence_ref ? -1 : a.evidence_ref > b.evidence_ref ? 1 : 0));
  return { count: entries.length, entries };
}

module.exports = { makeMarketResearchReport, coverageByObjective, buildEvidenceAppendix };
