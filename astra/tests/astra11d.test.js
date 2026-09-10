'use strict';
// ASTRA-11D — Market Research Engine. Offline deterministic tests ONLY.
// No network, no LLM, no production database. Node built-ins + assert.
const assert = require('assert');
const R = require('../src/commercial/research');
const C11 = require('../src/commercial/ingestion');
const { makeMarketResearchRequest, validateMarketResearchRequest, RESEARCH_OBJECTIVES, UNKNOWN } = R.request;
const { makeResearchPlan, enforceAuthorizedScope, SCOPE_RANK } = R.plan;
const { makeFixtureProvider, makeLiveProviderStub } = R.sourceProvider;
const { extractFacts, makeComputedFact, validateMarketFact, FACT_STATUS } = R.marketFact;
const { detectConflicts } = R.conflict;
const { aggregate } = R.aggregate;
const { formClaims, validateClaim, CLAIM_STATUS } = R.marketClaim;
const { deriveInsights } = R.insight;
const { runMarketResearch } = R.engine;

let pass = 0, fail = 0; const fails = [];
const tests = [];
function t(n, fn) { tests.push({ n, fn }); }

const REF = '2026-09-09T00:00:00Z';
function req(over = {}) {
  return makeMarketResearchRequest({
    business_ref: 'ent_biz1', product_or_service: 'clínica dental',
    geography: { country: 'MX' }, objectives: ['PRICING', 'MESSAGING', 'CUSTOMER_PROBLEMS'],
    research_scope: { scope: 'SAMPLE' }, ...over,
  });
}
function plan(request, over = {}) {
  return makeResearchPlan({
    request,
    evidence_needed: [
      { for_objective: 'PRICING', fact_types: ['COMPETITOR_PRICE'], min_facts: 2, min_distinct_sources: 2 },
      { for_objective: 'MESSAGING', fact_types: ['ADVERTISED_PROMISE'], min_facts: 2, min_distinct_sources: 2 },
      { for_objective: 'CUSTOMER_PROBLEMS', fact_types: ['REVIEW_STATEMENT', 'REVIEW_COMPLAINT'], min_facts: 1, min_distinct_sources: 1 },
    ], ...over,
  });
}
const compA = () => makeFixtureProvider({ provider_id: 'fix.a', records: [
  { provider_hint: 'meta_ads', source_id: 'adA', source_category: 'ADVERTISEMENT', ad_creative_body: 'Blanqueamiento en una cita', first_seen: '2026-08-01T00:00:00Z', evidence_ref: 'ev_adA', ad_id: '1' },
  { provider_hint: 'meta_ads', source_id: 'adB', source_category: 'ADVERTISEMENT', ad_creative_body: 'Financiamiento a 12 meses', first_seen: '2026-08-02T00:00:00Z', evidence_ref: 'ev_adB', ad_id: '2' },
  { provider_hint: 'payments', source_id: 'pxA', source_category: 'TRANSACTION', amount_minor: 99900, currency: 'MXN', created_at: '2026-08-03T00:00:00Z', evidence_ref: 'ev_pxA' },
  { provider_hint: 'payments', source_id: 'pxB', source_category: 'TRANSACTION', amount_minor: 100500, currency: 'MXN', created_at: '2026-08-04T00:00:00Z', evidence_ref: 'ev_pxB' },
  { provider_hint: 'google_reviews', source_id: 'rvA', source_category: 'REVIEW', review_text: 'Nunca respondieron mi mensaje sobre precio', rating: 2, created_at: '2026-08-05T00:00:00Z', evidence_ref: 'ev_rvA' },
] });
const dirConflict = () => makeFixtureProvider({ provider_id: 'fix.dir', records: [
  { provider_hint: 'payments', source_id: 'pxDir', source_category: 'TRANSACTION', amount_minor: 149900, currency: 'MXN', created_at: '2026-08-06T00:00:00Z', evidence_ref: 'ev_pxDir' },
] });

// ===== A: MarketResearchRequest =====
t('A: request requires business_ref/product/objectives; UNKNOWN category valid', () => {
  assert(!validateMarketResearchRequest({}).valid);
  const r = req({ category: UNKNOWN, geography: UNKNOWN, target_customer: UNKNOWN });
  assert.strictEqual(r.category, 'UNKNOWN');
  assert(r.request_id.startsWith('mrq_'));
  assert.throws(() => makeMarketResearchRequest({ business_ref: 'b', product_or_service: 'p', objectives: ['NONSENSE'] }), /unknown objective/);
  assert(RESEARCH_OBJECTIVES.includes('COMPETITOR_LANDSCAPE'));
});

// ===== B: ResearchPlan + scope enforcement =====
t('B: plan cannot pursue an objective the request did not authorize', () => {
  const r = req({ objectives: ['PRICING'] });
  assert.throws(() => makeResearchPlan({ request: r, evidence_needed: [{ for_objective: 'TRENDS', fact_types: [], min_facts: 2, min_distinct_sources: 2 }] }), /not in the request/);
});
t('B: plan scope cannot exceed request scope', () => {
  const r = req({ research_scope: { scope: 'SAMPLE' } });
  assert.throws(() => makeResearchPlan({ request: r, scope: 'GLOBAL' }), /exceeds the request scope/);
});
t('B: enforceAuthorizedScope rejects added objective / widened scope / sub-minimum thresholds', () => {
  const r = req();
  const good = plan(r);
  assert(enforceAuthorizedScope(good, r).authorized);
  const bad = { ...good, objectives: [...good.objectives, 'PRICING', 'TRENDS'], scope: 'CATEGORY', evidence_needed: [{ for_objective: 'PRICING', fact_types: [], min_facts: 0, min_distinct_sources: 0 }] };
  const g = enforceAuthorizedScope(bad, r);
  assert(!g.authorized);
  assert(g.violations.some(v => /TRENDS/.test(v)) && g.violations.some(v => /widened scope/.test(v)) && g.violations.some(v => /sub-minimum/.test(v)));
});

// ===== C: evidence collection boundary =====
t('C: LIVE providers are not authorized; engine throws on a LIVE provider', () => {
  const r = req(); const p = plan(r);
  assert.throws(() => makeLiveProviderStub('x').collect(), /not authorized/);
  assert.throws(() => runMarketResearch({ request: r, plan: p, providers: [makeLiveProviderStub('live')], referenceTime: REF, batch_id: 'BC' }), /LIVE/);
});
t('C: 11D consumes ASTRA-11C observations — provider payloads still pass through 11C ingestion', () => {
  const r = req(); const p = plan(r);
  const out = runMarketResearch({ request: r, plan: p, providers: [compA()], referenceTime: REF, batch_id: 'BC2' });
  assert(out.observations.length >= 1);
  for (const o of out.observations) assert(!/ad_id|page_id|"1"|"2"/.test(JSON.stringify({ v: o.verbatim, s: o.structured_values, t: o.observation_type })));
  assert(out.ingestion && out.ingestion.batch);
});

// ===== D: MarketFact =====
t('D: MarketFacts are OBSERVED or COMPUTED only', () => {
  const r = req(); const p = plan(r);
  const out = runMarketResearch({ request: r, plan: p, providers: [compA()], referenceTime: REF, batch_id: 'BD' });
  assert(out.facts.length > 0);
  for (const f of out.facts) { assert(FACT_STATUS.includes(f.status)); assert.strictEqual(f.status, 'OBSERVED'); assert(validateMarketFact(f).valid); }
  for (const f of out.computed_facts) { assert.strictEqual(f.status, 'COMPUTED'); assert.strictEqual(f.produced_by, 'deterministic:ucdm/research'); }
});
t('D: an INFERRED observation never becomes a MarketFact (model knowledge != market evidence)', () => {
  const { makeNormalizedObservation } = C11.normalizedObservation;
  const { makeSubjectRef } = C11.subjectResolution;
  const inf = makeNormalizedObservation({ observation_type: 'TEXT', content: { text: 'el mercado crecerá 20%', normalized_text: 'el mercado crecerá 20%' }, source_ref: 'note1', provenance_class: 'INFERRED', subject: makeSubjectRef({ subject_type: 'Market' }) });
  const ex = extractFacts([inf], { referenceTime: REF });
  assert.strictEqual(ex.facts.length, 0);
  assert.strictEqual(ex.excluded_inferred.length, 1);
  assert(/INFERRED/.test(ex.excluded_inferred[0].reason));
});
t('D: a hand-built fact drawing on INFERRED material fails validateMarketFact', () => {
  const bad = { fact_type: 'COMPETITOR_PRICE', status: 'OBSERVED', evidence_refs: ['e1'], source_classes: ['INFERRED'], confidence: { produced_by: 'deterministic:ucdm/confidence' } };
  assert(!validateMarketFact(bad).valid);
});

// ===== E: MarketClaim =====
t('E: claim status reflects evidence; INSUFFICIENT when below plan thresholds', () => {
  const r = req(); const p = plan(r, { evidence_needed: [{ for_objective: 'PRICING', fact_types: ['COMPETITOR_PRICE'], min_facts: 10, min_distinct_sources: 9 }, { for_objective: 'MESSAGING', fact_types: ['ADVERTISED_PROMISE'], min_facts: 2, min_distinct_sources: 2 }, { for_objective: 'CUSTOMER_PROBLEMS', fact_types: ['REVIEW_STATEMENT'], min_facts: 1, min_distinct_sources: 1 }] });
  const out = runMarketResearch({ request: r, plan: p, providers: [compA()], referenceTime: REF, batch_id: 'BE' });
  const priceClaim = out.claims.find(c => c.fact_type === 'COMPETITOR_PRICE');
  assert(priceClaim && priceClaim.status === 'INSUFFICIENT');
  for (const c of out.claims) assert(CLAIM_STATUS.includes(c.status) && validateClaim(c).valid);
});
t('E: no global claim from insufficient local evidence (scope downgraded + warned)', () => {
  const r = req({ objectives: ['MESSAGING'], research_scope: { scope: 'GLOBAL' } });
  const p = makeResearchPlan({ request: r, scope: 'GLOBAL', evidence_needed: [{ for_objective: 'MESSAGING', fact_types: ['ADVERTISED_PROMISE'], min_facts: 2, min_distinct_sources: 2 }] });
  const out = runMarketResearch({ request: r, plan: p, providers: [compA()], referenceTime: REF, batch_id: 'BE2' });
  const claim = out.claims.find(c => c.fact_type === 'ADVERTISED_PROMISE');
  if (claim) {
    assert(SCOPE_RANK[claim.scope] <= SCOPE_RANK.SAMPLE, 'must not stay GLOBAL on a thin sample');
    assert(claim.status !== 'SUPPORTED' || claim.scope === 'SAMPLE');
    if (claim.requested_scope === 'GLOBAL' && claim.scope === 'SAMPLE') assert(claim.warnings.length > 0);
  }
});
t('E: claim statement is deterministic (not LLM) in the core engine', () => {
  const r = req(); const p = plan(r);
  const a = runMarketResearch({ request: r, plan: p, providers: [compA()], referenceTime: REF, batch_id: 'BE3' });
  for (const c of a.claims) assert.strictEqual(c.statement_source, 'deterministic:ucdm/research');
});

// ===== F: conflict detection =====
t('F: contradictory prices from different sources -> OPEN VALUE_CONFLICT, never auto-resolved', () => {
  const r = req(); const p = plan(r);
  const out = runMarketResearch({ request: r, plan: p, providers: [compA(), dirConflict()], referenceTime: REF, batch_id: 'BF' });
  const c = out.conflicts.find(x => x.fact_type === 'COMPETITOR_PRICE');
  assert(c && c.kind === 'VALUE_CONFLICT' && c.status === 'OPEN' && c.resolution === null);
  assert(c.fact_refs.length === 2);
  const priceClaim = out.claims.find(x => x.fact_type === 'COMPETITOR_PRICE');
  assert.strictEqual(priceClaim.status, 'CONFLICTED');
});
t('F: near-equal prices (within tolerance) are NOT a conflict', () => {
  const facts = [
    { fact_id: 'f1', fact_type: 'COMPETITOR_PRICE', subject_ref: 's:X', value: { amount: 1000 }, source_ref: 'a', evidence_refs: ['e1'] },
    { fact_id: 'f2', fact_type: 'COMPETITOR_PRICE', subject_ref: 's:X', value: { amount: 1010 }, source_ref: 'b', evidence_refs: ['e2'] },
  ];
  assert.strictEqual(detectConflicts(facts).conflicts.length, 0);
});

// ===== G: aggregation + COMPUTED roll-ups =====
t('G: aggregation produces deterministic COMPUTED roll-up facts ("N of M")', () => {
  const r = req({ objectives: ['MESSAGING'] });
  const p = makeResearchPlan({ request: r, evidence_needed: [{ for_objective: 'MESSAGING', fact_types: ['ADVERTISED_PROMISE'], min_facts: 1, min_distinct_sources: 1 }] });
  const out = runMarketResearch({ request: r, plan: p, providers: [compA()], referenceTime: REF, batch_id: 'BG' });
  const rollup = out.computed_facts.find(f => f.fact_type === 'ADVERTISED_PROMISE');
  assert(rollup && rollup.value.sample_size >= 2 && typeof rollup.value.fraction === 'number');
  assert.strictEqual(rollup.status, 'COMPUTED');
});

// ===== H: confidence =====
t('H: every fact/aggregate/claim carries a deterministic ConfidenceAssessment', () => {
  const r = req(); const p = plan(r);
  const out = runMarketResearch({ request: r, plan: p, providers: [compA()], referenceTime: REF, batch_id: 'BH' });
  for (const f of out.facts) assert.strictEqual(f.confidence.produced_by, 'deterministic:ucdm/confidence');
  for (const a of out.aggregates) assert(['VERY_LOW', 'LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH'].includes(a.confidence.band));
  const c2 = runMarketResearch({ request: r, plan: p, providers: [compA()], referenceTime: REF, batch_id: 'BH' });
  assert.strictEqual(out.facts[0].confidence.content_hash, c2.facts[0].confidence.content_hash);
});

// ===== I: report =====
t('I: MarketResearchReport is reproducible and carries the no-autonomy caveat', () => {
  const r = req(); const p = plan(r);
  const a = runMarketResearch({ request: r, plan: p, providers: [compA(), dirConflict()], referenceTime: REF, batch_id: 'BI' });
  const b = runMarketResearch({ request: r, plan: p, providers: [dirConflict(), compA()], referenceTime: REF, batch_id: 'BI' });
  assert.strictEqual(a.report.report_id, b.report.report_id, 'report must be order-independent');
  assert(a.report.caveats.some(c => /production routing or autonomous action/.test(c)));
  assert.strictEqual(a.report.generated_by, 'deterministic:ucdm/research');
  assert(a.report.counts.conflicts_open >= 1);
  assert(typeof a.report.coverage_by_objective.PRICING.met === 'boolean');
});

// ===== insights =====
t('insights: derived from SUPPORTED/PARTIAL claims, tied to authorized objectives, never a recommendation', () => {
  const r = req(); const p = plan(r);
  const out = runMarketResearch({ request: r, plan: p, providers: [compA()], referenceTime: REF, batch_id: 'BINS' });
  for (const i of out.insights) {
    assert.strictEqual(i.is_recommendation, false);
    assert(r.objectives.includes(i.objective) || i.objective === 'MARKET_OVERVIEW');
    assert(i.claim_refs.length >= 1);
    assert.strictEqual(i.statement_source, 'deterministic:ucdm/research');
  }
});

// ===== engine determinism / no-clock =====
t('engine: referenceTime required (no implicit clock); whole run reproducible', () => {
  const r = req(); const p = plan(r);
  assert.throws(() => runMarketResearch({ request: r, plan: p, providers: [compA()], batch_id: 'X' }), /referenceTime is required/);
  const a = runMarketResearch({ request: r, plan: p, providers: [compA()], referenceTime: REF, batch_id: 'BR' });
  const b = runMarketResearch({ request: r, plan: p, providers: [compA()], referenceTime: REF, batch_id: 'BR' });
  assert.strictEqual(JSON.stringify(a.facts.map(f => f.fact_id)), JSON.stringify(b.facts.map(f => f.fact_id)));
  assert.strictEqual(a.report.report_id, b.report.report_id);
});

t('engine: schema versions surfaced; ucdm-research-1.0.0 on top of ucdm-1.0.0 / ucdm-ingest-1.0.0', () => {
  assert.strictEqual(R.RESEARCH_SCHEMA_VERSION, 'ucdm-research-1.0.0');
  assert.strictEqual(R.UCDM_SCHEMA_VERSION, 'ucdm-1.0.0');
  assert.strictEqual(R.INGEST_SCHEMA_VERSION, 'ucdm-ingest-1.0.0');
  const r = req(); const p = plan(r);
  const out = runMarketResearch({ request: r, plan: p, providers: [compA()], referenceTime: REF, batch_id: 'BS' });
  assert.strictEqual(out.report.downstream_schema_versions.ucdm, 'ucdm-1.0.0');
});

t('engine: no output object is a recommendation or an action directive', () => {
  const r = req(); const p = plan(r);
  const out = runMarketResearch({ request: r, plan: p, providers: [compA(), dirConflict()], referenceTime: REF, batch_id: 'BA' });
  const blob = JSON.stringify({ claims: out.claims, insights: out.insights, report: out.report });
  assert(!/"recommendation"|"action"|"execute"|"autonomous"/.test(blob.replace(/autonomous action/g, '')));
});

(async () => {
  for (const { n, fn } of tests) {
    try { await fn(); pass++; console.log('PASS', n); }
    catch (e) { fail++; fails.push(n + ' :: ' + (e && e.message)); console.log('FAIL', n, '::', e && e.message); }
  }
  console.log(`\nASTRA11D_TEST_RESULT pass=${pass} fail=${fail}`);
  if (fail) { console.log('FAILURES:\n' + fails.join('\n')); process.exit(1); }
})();
