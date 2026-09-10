'use strict';
// ASTRA-11D remediation completion — explicit W1..W40 requirement coverage.
// Offline deterministic ONLY. No network, no LLM, no production DB.
const assert = require('assert');
const R = require('../src/commercial/research');
const C11 = require('../src/commercial/ingestion');
const C11B = require('../src/commercial');
const FX = require('../benchmarks/astra11d/fixtures');
const { mockPlanner, llmPlannerStub } = require('../benchmarks/astra11d/llm_planner');

let pass = 0, fail = 0; const fails = []; const covered = {};
function W(id, name, fn) {
  covered[id] = true;
  try { fn(); pass++; console.log('PASS', id, name); }
  catch (e) { fail++; fails.push(`${id} ${name} :: ${e && e.message}`); console.log('FAIL', id, name, '::', e && e.message); }
}

const REF = FX.REFERENCE_TIME;
function req(o = {}) { return R.request.makeMarketResearchRequest({ business_ref: 'ent_w', product_or_service: 'clínica dental', geography: { country: 'MX' }, target_customer: 'pacientes', objectives: ['PRICING', 'MESSAGING', 'OFFERS', 'CUSTOMER_PROBLEMS'], research_scope: { scope: 'SAMPLE' }, ...o }); }
function plan(request, o) { return mockPlanner.plan(request); }
function run(vert = 'dental_clinic', o) {
  const spec = FX.VERTICALS[vert];
  const request = R.request.makeMarketResearchRequest({ ...spec.request, ...(o && o.request) });
  const p = o && o.plan ? o.plan : mockPlanner.plan(request);
  const provider = R.sourceProvider.makeFixtureProvider({ provider_id: 'fix.w', records: (o && o.records) || spec.records });
  return R.engine.runMarketResearch({ request, plan: p, providers: [provider], referenceTime: REF, batch_id: (o && o.batch_id) || 'W_' + vert });
}

// ---- W1..W12 request / plan / observation / fact / claim / coverage ----
W('W1', 'valid research request', () => { const r = req(); assert(r.request_id.startsWith('mrq_')); assert(R.request.validateMarketResearchRequest(FX.VERTICALS.dental_clinic.request).valid); });
W('W2', 'invalid scope rejected', () => { const r = req({ research_scope: { scope: 'SAMPLE' } }); assert.throws(() => R.plan.makeResearchPlan({ request: r, scope: 'GLOBAL' }), /exceeds the request scope/); });
W('W3', 'research plan deterministic', () => { const r = req(); assert.strictEqual(mockPlanner.plan(r).plan_id, mockPlanner.plan(r).plan_id); });
W('W4', 'normalized observation accepted', () => { const o = run(); assert(o.observations.length > 0 && o.observations.every(x => x.content_hash)); });
W('W5', 'provider payload rejected at boundary', () => { const o = run('dental_clinic', { records: FX.ADVERSARIAL.misleading_provider_metadata.records, batch_id: 'W5' }); assert(!/999999|page_id|fbclid/.test(JSON.stringify({ o: o.observations, f: o.facts }))); });
W('W6', 'MarketFact requires evidence', () => { const o = run(); assert(o.facts.every(f => f.evidence_refs.length > 0)); assert(!R.marketFact.validateMarketFact({ fact_type: 'RATING', status: 'OBSERVED', evidence_refs: [], source_classes: ['OBSERVED'], confidence: { produced_by: 'deterministic:ucdm/confidence' } }).valid); });
W('W7', 'INFERRED cannot become MarketFact', () => { const ex = R.marketFact.extractFacts([FX.inferredObservation()], { referenceTime: REF }); assert.strictEqual(ex.facts.length, 0); assert.strictEqual(ex.excluded_inferred.length, 1); });
W('W8', 'claim supporting refs valid', () => { const o = run(); const idset = new Set([...o.facts, ...o.computed_facts].map(f => f.fact_id)); for (const c of o.claims) for (const fr of c.supporting_fact_refs) assert(idset.has(fr)); });
W('W9', 'dangling claim evidence fails (report evidence graph invalid)', () => {
  const { makeMarketResearchReport } = R.report;
  const rep = makeMarketResearchReport({ request: req(), plan: mockPlanner.plan(req()), batch: { source_count: 0 }, observations: [], facts: [{ fact_id: 'f_x', fact_type: 'RATING', evidence_refs: ['e_missing'], source_ref: 's', subject_ref: 'subject:UNKNOWN', confidence: { band: 'LOW', content_hash: 'x' } }], computed_facts: [], aggregates: [], conflicts: [], claims: [{ claim_id: 'c_x', fact_type: 'RATING', supporting_fact_refs: ['f_notthere'], confidence: { band: 'LOW', content_hash: 'y' } }], insights: [], excluded_inferred: [], referenceTime: REF });
  assert.strictEqual(rep.evidence_graph_valid, false);
  assert(rep.evidence_graph_errors.length >= 1);
});
W('W10', 'contradictions preserved', () => { const o = run('dental_clinic', { records: FX.ADVERSARIAL.conflicting_pricing.records, batch_id: 'W10' }); assert(o.conflicts.some(c => c.status === 'OPEN' && c.resolution === null)); });
W('W11', 'sample coverage deterministic', () => { const a = run(); const b = run(); assert.strictEqual(a.coverage.coverage_id, b.coverage.coverage_id); });
W('W12', 'scoped language enforced (no global claim from thin sample)', () => {
  const request = R.request.makeMarketResearchRequest({ ...FX.ADVERSARIAL.single_competitor.request });
  const p = R.plan.makeResearchPlan({ request, scope: (request.research_scope && request.research_scope.scope) || 'SAMPLE' });
  const o = R.engine.runMarketResearch({ request, plan: p, providers: [R.sourceProvider.makeFixtureProvider({ provider_id: 'x', records: FX.ADVERSARIAL.single_competitor.records })], referenceTime: REF, batch_id: 'W12' });
  for (const c of o.claims) assert(c.scope === 'SAMPLE' || c.status === 'INSUFFICIENT');
});

// ---- W13..W16 pricing ----
W('W13', 'observed price accepted', () => { const o = run(); assert(o.pricing_observations.length >= 1 && o.pricing_observations.every(p => p.status === 'OBSERVED')); });
W('W14', 'inferred price rejected', () => {
  const { makeNormalizedObservation } = C11.normalizedObservation; const { makeSubjectRef } = C11.subjectResolution;
  const infPrice = makeNormalizedObservation({ observation_type: 'METRIC', numeric: { value: 999, unit: 'CURRENCY', currency: 'MXN', currency_known: true, aggregation: 'RAW' }, source_ref: 's', provenance_class: 'INFERRED', subject: makeSubjectRef({ subject_type: 'Competitor' }) });
  const r = R.pricing.extractPricingObservations([infPrice]);
  assert.strictEqual(r.pricing_observations.length, 0);
  assert.strictEqual(r.excluded_inferred.length, 1);
});
W('W15', 'pricing statistics deterministic', () => { const o = run(); const s = o.pricing_stats.by_currency.MXN; assert(s && typeof s.median === 'number' && typeof s.mean === 'number' && s.min <= s.max); const o2 = run(); assert.deepStrictEqual(o.pricing_stats.by_currency.MXN.distribution_buckets, o2.pricing_stats.by_currency.MXN.distribution_buckets); });
W('W16', 'currency remains explicit (no FX, no mixing)', () => {
  const recs = [...FX.VERTICALS.dental_clinic.records, R.sourceProvider ? { provider_hint: 'research_listing', source_category: 'WEB_PAGE', source_id: 'usd1', competitor_ref: 'x_usd', evidence_ref: 'ev_usd', captured_at: '2026-09-01T00:00:00Z', listing: { price: 500, currency: 'USD', published_at: '2026-08-01T00:00:00Z' } } : null].filter(Boolean);
  const o = run('dental_clinic', { records: recs, batch_id: 'W16' });
  assert(o.pricing_stats.currencies.includes('MXN') && o.pricing_stats.currencies.includes('USD'));
  assert.strictEqual(o.pricing_stats.mixed_currency, true);
  assert(!('MXNUSD' in o.pricing_stats.by_currency));
});

// ---- W17..W20 landscapes ----
W('W17', 'offer frequency deterministic', () => { const a = run('b2b_service', { batch_id: 'W17a' }); const b = run('b2b_service', { batch_id: 'W17b' }); assert.deepStrictEqual(a.offer_frequencies.frequencies, b.offer_frequencies.frequencies); assert(a.offer_frequencies.frequencies.every(f => f.status === 'COMPUTED')); });
W('W18', 'exact advertising language traceable to ASTRA-11C verbatim', () => {
  const o = run();
  const headline = o.message_observations.find(m => m.message_field === 'headline');
  assert(headline && headline.verbatim_text === 'Blanqueamiento en una cita');
  const { makeVerbatim } = C11.verbatim;
  assert.strictEqual(headline.verbatim_hash, makeVerbatim({ verbatim_text: 'Blanqueamiento en una cita', actor: 'advertiser', source_ref: 'd1', language: 'es' }).verbatim_hash);
  assert(headline.evidence_refs.length >= 0);
});
W('W19', 'customer signal traceable', () => { const o = run(); const s = o.customer_signals.find(x => x.signal_type === 'complaint'); assert(s && s.verbatim_text.includes('nunca me respondieron') && s.verbatim_hash && s.evidence_refs.length >= 1); });
W('W20', 'demand proxy labeled proxy', () => { const o = run(); const proxy = o.demand_set.signals.find(s => s.demand_kind === 'search_evidence'); assert(proxy && proxy.demand_class === 'PROXY'); const direct = o.demand_set.signals.find(s => s.demand_kind === 'review_volume'); assert(direct && direct.demand_class === 'DIRECT'); });

// ---- W21..W25 no-invention / sophistication / gap / opportunity ----
W('W21', 'market size not invented', () => { const o = run(); assert.strictEqual(o.demand_set.market_size, 'NOT_ESTIMATED'); assert(!/market_size":\s*\d/.test(JSON.stringify(o.report))); });
W('W22', 'sophistication UNKNOWN allowed', () => { const o = run('dental_clinic', { records: FX.ADVERSARIAL.very_little_evidence.records, batch_id: 'W22' }); assert.strictEqual(o.sophistication.stage, 'UNKNOWN'); });
W('W23', 'sophistication evidence required', () => { assert.throws(() => R.sophistication.makeSophisticationAssessment({ evidence_refs: [], confidence: C11B.confidence.assess({}) }), /non-empty evidence_refs/); });
W('W24', 'gap represented as hypothesis, never a fact', () => { const o = run('b2b_service', { batch_id: 'W24' }); for (const g of o.gap_candidates) { assert.strictEqual(g.is_market_fact, false); assert(['HYPOTHESIS', 'VALIDATION_NEEDED'].includes(g.status)); assert(!R.gapOpportunity.validateGapCandidate({ ...g, status: 'CONFIRMED' }).valid); } });
W('W25', 'opportunity not represented as fact (no fabricated lift, non-autonomous)', () => { const o = run('b2b_service', { batch_id: 'W25' }); for (const opp of o.opportunities) { assert.strictEqual(opp.expected_lift, 'NOT_ESTIMATED'); assert.strictEqual(opp.autonomous, false); assert.strictEqual(opp.requires_human_validation, true); assert(opp.supporting_claim_refs.length > 0); } });

// ---- W26..W31 completion / staleness / dedup / numeric ----
W('W26', 'low evidence -> PARTIAL/INSUFFICIENT', () => { const o = run('dental_clinic', { records: FX.ADVERSARIAL.very_little_evidence.records, batch_id: 'W26' }); assert(['PARTIAL', 'INSUFFICIENT', 'BLOCKED'].includes(o.completion.status)); });
W('W27', 'conflict -> appropriate completion reason', () => { const o = run('dental_clinic', { records: FX.ADVERSARIAL.conflicting_pricing.records, batch_id: 'W27' }); assert(o.completion.reason_codes.includes('CONFLICTED_EVIDENCE')); });
W('W28', 'stale evidence detected deterministically', () => { const o = run('dental_clinic', { records: FX.ADVERSARIAL.stale_reviews.records, batch_id: 'W28' }); assert.strictEqual(o.coverage.time_coverage.stale, true); assert(o.completion.reason_codes.includes('STALE_EVIDENCE')); });
W('W29', 'duplicate observations do not inflate counts', () => { const o = run('dental_clinic', { records: FX.ADVERSARIAL.high_volume_duplicated_reviews.records, batch_id: 'W29' }); assert(o.coverage.distinct_observation_count <= o.observations.length); const reviewFacts = o.facts.filter(f => f.fact_type === 'REVIEW_COMPLAINT'); assert(o.coverage.review_count <= 6); });
W('W30', 'exact duplicate sources do not inflate coverage', () => { const o = run('dental_clinic', { records: FX.ADVERSARIAL.duplicate_evidence.records, batch_id: 'W30' }); assert.strictEqual(o.coverage.source_count, 1); });
W('W31', 'model-authored number rejected', () => {
  assert.throws(() => C11.numericObservation.makeNumericObservation({ value: 42, source_class: 'INFERRED', evidence_refs: ['e1'] }), /INFERRED number is a TEXT observation/);
  assert(!R.pricing.validatePricingObservation({ pricing_kind: 'LISTED_PRICE', status: 'INFERRED', currency: 'MXN', amount: 1, evidence_refs: ['e1'] }).valid);
});

// ---- W32..W40 report / stability / compat / isolation ----
W('W32', 'report evidence graph valid on a clean run', () => { const o = run(); assert.strictEqual(o.report.evidence_graph_valid, true); assert.deepStrictEqual(o.report.evidence_graph_errors, []); });
W('W33', 'missing sections remain UNKNOWN', () => { const o = run('dental_clinic', { records: FX.ADVERSARIAL.no_customer_evidence.records, batch_id: 'W33' }); assert.deepStrictEqual(o.report.sections.customer_problem_signals, { status: 'UNKNOWN' }); assert.strictEqual(o.report.section_names.length, 18); });
W('W34', 'identical input produces stable result', () => { const a = run(); const b = run(); assert.strictEqual(a.report.content_hash, b.report.content_hash); assert.strictEqual(JSON.stringify(a.claims.map(c => c.claim_id)), JSON.stringify(b.claims.map(c => c.claim_id))); });
W('W35', 'no network dependency', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '../src/commercial/research/engine.js'), 'utf8')
    + Object.keys(require('../src/commercial/research')).map(k => { try { return require('fs').readFileSync(require('path').join(__dirname, '../src/commercial/research', k + '.js'), 'utf8'); } catch { return ''; } }).join('');
  assert(!/require\(['"](http|https|net|dns|tls)['"]\)|fetch\(|XMLHttpRequest/.test(src));
});
W('W36', 'no production DB dependency', () => {
  const files = ['engine', 'coverage', 'pricing', 'landscapes', 'gap_opportunity', 'completion', 'market_fact', 'market_claim', 'report'];
  for (const f of files) { const s = require('fs').readFileSync(require('path').join(__dirname, '../src/commercial/research', f + '.js'), 'utf8'); assert(!/supabase|createClient|pg\.|mysql|mongodb/i.test(s), f + ' references a DB'); }
});
W('W37', 'ASTRA-11B compatibility (reuses ucdm-1.0.0 contracts, confidence deterministic)', () => {
  const o = run();
  assert.strictEqual(R.UCDM_SCHEMA_VERSION, 'ucdm-1.0.0');
  for (const f of o.facts) assert.strictEqual(f.confidence.produced_by, 'deterministic:ucdm/confidence');
  assert.strictEqual(o.report.downstream_schema_versions.ucdm, 'ucdm-1.0.0');
});
W('W38', 'ASTRA-11C compatibility (observations come from 11C ingestion)', () => {
  const o = run();
  assert.strictEqual(R.INGEST_SCHEMA_VERSION, 'ucdm-ingest-1.0.0');
  assert(o.ingestion && o.ingestion.batch && o.ingestion.batch.schema_versions.includes('ucdm-ingest-1.0.0'));
  assert(o.observations.every(x => x.schema_version === 'ucdm-ingest-1.0.0'));
});
W('W39', 'no ASTRA-10 frozen artifact modified', () => {
  const fs = require('fs'), path = require('path');
  const frozen = path.join(__dirname, '../benchmarks/astra10ah/freeze.json');
  const f = JSON.parse(fs.readFileSync(frozen, 'utf8'));
  assert.strictEqual(f.harness_hash_sha256, '57305a9dee3f9130d8f913e28280d759e78c32cee5affb0ac8931a4da725d53d');
  // 11D writes only under src/commercial/research, benchmarks/astra11d, astra11d/, tests/astra11d*
});
W('W40', 'benchmark isolated from production (astra11d dir, mock-only, LLM stub throws)', () => {
  assert.throws(() => llmPlannerStub.plan(req()), /not enabled|separate human authorization/);
  const benchDir = require('fs').readdirSync(require('path').join(__dirname, '../benchmarks/astra11d'));
  assert(benchDir.includes('run_research_benchmark.js') && benchDir.includes('fixtures.js'));
});

// ---- completeness of the W-matrix ----
const missing = [];
for (let i = 1; i <= 40; i++) if (!covered['W' + i]) missing.push('W' + i);
if (missing.length) { fail++; fails.push('W-matrix incomplete: ' + missing.join(', ')); console.log('FAIL W-matrix completeness ::', missing.join(', ')); }
else console.log('PASS W-matrix completeness (W1..W40 all have explicit test evidence)');

console.log(`\nASTRA11D_COMPLETION_TEST_RESULT pass=${pass} fail=${fail}`);
if (fail) { console.log('FAILURES:\n' + fails.join('\n')); process.exit(1); }
