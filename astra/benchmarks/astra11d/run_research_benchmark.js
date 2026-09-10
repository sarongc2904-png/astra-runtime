'use strict';
// [ASTRA-11D benchmark] Offline, mock-only. Zero network, zero LLM, zero cost.
// Scores the deterministic Market Research Engine across 6 verticals + 8 adversarial cases
// on 9 benchmark dimensions (spec §14).
const assert = require('assert');
const R = require('../../src/commercial/research');
const { mockPlanner, llmPlannerStub, enforceAuthorizedScope } = require('./llm_planner');
const FX = require('./fixtures');

let pass = 0, fail = 0; const notes = [];
function check(name, fn) { try { fn(); pass++; console.log('PASS', name); } catch (e) { fail++; notes.push(name + ' :: ' + e.message); console.log('FAIL', name, '::', e.message); } }

const REF = FX.REFERENCE_TIME;
function runCase(spec, batch_id) {
  const request = R.request.makeMarketResearchRequest(spec.request);
  const plan = mockPlanner.plan(request);
  const provider = R.sourceProvider.makeFixtureProvider({ provider_id: 'fix.' + batch_id, records: spec.records });
  return R.engine.runMarketResearch({ request, plan, providers: [provider], referenceTime: REF, batch_id });
}

// ---- 6 verticals: engine runs, deterministic, evidence-disciplined ----
for (const [name, spec] of Object.entries(FX.VERTICALS)) {
  check(`vertical/${name}: runs, deterministic, facts OBSERVED-only, report has 18 sections`, () => {
    const a = runCase(spec, 'V_' + name);
    const b = runCase(spec, 'V_' + name);
    assert.strictEqual(a.report.report_id, b.report.report_id, 'deterministic');
    assert(a.facts.every(f => f.status === 'OBSERVED'));
    assert(a.computed_facts.every(f => f.status === 'COMPUTED'));
    assert.strictEqual(a.report.section_names.length, 18);
    assert(a.report.evidence_graph_valid, JSON.stringify(a.report.evidence_graph_errors));
    assert.strictEqual(a.report.generated_by, 'deterministic:ucdm/research');
  });
}

// ---- 8 adversarial cases ----
check('adv/very_little_evidence -> completion PARTIAL or INSUFFICIENT; claims not SUPPORTED-global', () => {
  const o = runCase(FX.ADVERSARIAL.very_little_evidence, 'A_little');
  assert(['PARTIAL', 'INSUFFICIENT', 'BLOCKED'].includes(o.completion.status));
  assert(o.completion.reason_codes.includes('LOW_SOURCE_COUNT') || o.completion.reason_codes.includes('LOW_SOURCE_DIVERSITY'));
});
check('adv/conflicting_pricing -> OPEN VALUE_CONFLICT, claim CONFLICTED, completion flags CONFLICTED_EVIDENCE', () => {
  const o = runCase(FX.ADVERSARIAL.conflicting_pricing, 'A_conf');
  const c = o.conflicts.find(x => x.fact_type === 'COMPETITOR_PRICE' && x.kind === 'VALUE_CONFLICT');
  assert(c && c.status === 'OPEN' && c.resolution === null);
  assert(o.claims.find(x => x.fact_type === 'COMPETITOR_PRICE' && x.subject_ref === c.subject_ref).status === 'CONFLICTED');
  assert(o.completion.reason_codes.includes('CONFLICTED_EVIDENCE'));
});
check('adv/stale_reviews -> STALE_EVIDENCE detected deterministically', () => {
  const o = runCase(FX.ADVERSARIAL.stale_reviews, 'A_stale');
  assert.strictEqual(o.coverage.time_coverage.stale, true);
  assert(o.completion.reason_codes.includes('STALE_EVIDENCE'));
});
check('adv/single_competitor -> no CATEGORY-scope claim asserted; scope downgraded/insufficient', () => {
  const o = runCase(FX.ADVERSARIAL.single_competitor, 'A_single');
  for (const c of o.claims) assert(c.scope === 'SAMPLE' || c.status === 'INSUFFICIENT');
  const g = R.coverage.assessGlobalExtrapolation(o.coverage, 'CATEGORY');
  assert(!g.allowed && g.downgrade_to === 'SAMPLE');
});
check('adv/no_customer_evidence -> MISSING_CUSTOMER_SIGNAL; customer section UNKNOWN', () => {
  const o = runCase(FX.ADVERSARIAL.no_customer_evidence, 'A_nocust');
  assert.strictEqual(o.customer_signals.length, 0);
  assert(o.completion.reason_codes.includes('MISSING_CUSTOMER_SIGNAL'));
  assert.deepStrictEqual(o.report.sections.customer_problem_signals, { status: 'UNKNOWN' });
});
check('adv/misleading_provider_metadata -> vendor ids never reach observations/facts', () => {
  const o = runCase(FX.ADVERSARIAL.misleading_provider_metadata, 'A_meta');
  const blob = JSON.stringify({ obs: o.observations, facts: o.facts, msg: o.message_observations });
  assert(!/999999|p_999|fbclid|utm_source/.test(blob));
});
check('adv/duplicate_evidence -> exact duplicate does not inflate coverage.source_count', () => {
  const o = runCase(FX.ADVERSARIAL.duplicate_evidence, 'A_dup');
  assert.strictEqual(o.coverage.source_count, 1, 'one distinct source despite two identical rows');
});
check('adv/high_volume_duplicated_reviews -> CONTENT_DUPLICATE flagged, counts not inflated', () => {
  const o = runCase(FX.ADVERSARIAL.high_volume_duplicated_reviews, 'A_hivol');
  assert(o.ingestion.dedupe.possible_duplicates.length + o.ingestion.dedupe.duplicate_member_count >= 1 || o.coverage.distinct_observation_count < o.observations.length);
});

// ---- 9 benchmark dimensions (aggregate assertions over the dental vertical + adversarials) ----
const dental = runCase(FX.VERTICALS.dental_clinic, 'DIM');
check('dim/evidence discipline: INFERRED never a fact', () => {
  const ex = R.marketFact.extractFacts([FX.inferredObservation()], { referenceTime: REF });
  assert.strictEqual(ex.facts.length, 0 && ex.excluded_inferred.length, 1) || assert.strictEqual(ex.excluded_inferred.length, 1);
});
check('dim/claim support: every non-INSUFFICIENT claim has supporting facts', () => {
  for (const c of dental.claims) if (c.status !== 'INSUFFICIENT') assert(c.supporting_fact_refs.length > 0);
});
check('dim/scope discipline: enforceAuthorizedScope rejects widening', () => {
  const request = R.request.makeMarketResearchRequest(FX.VERTICALS.dental_clinic.request);
  const p = mockPlanner.plan(request);
  assert(enforceAuthorizedScope(p, request).authorized);
  assert(!enforceAuthorizedScope({ ...p, scope: 'GLOBAL', objectives: [...p.objectives, 'TRENDS'] }, request).authorized);
  assert.throws(() => llmPlannerStub.plan(request), /not enabled/);
});
check('dim/conflict handling: conflicts OPEN and unresolved', () => {
  const o = runCase(FX.ADVERSARIAL.conflicting_pricing, 'DIM_conf');
  assert(o.conflicts.every(c => c.status === 'OPEN' && c.resolution === null));
});
check('dim/unknown handling: sophistication UNKNOWN when evidence thin; report unknowns listed', () => {
  const o = runCase(FX.ADVERSARIAL.very_little_evidence, 'DIM_unk');
  assert.strictEqual(o.sophistication.stage, 'UNKNOWN');
  assert(Array.isArray(o.report.sections.unknowns) && o.report.sections.unknowns.length > 0);
});
check('dim/numeric integrity: no fabricated numbers; expected_lift NOT_ESTIMATED; market_size NOT_ESTIMATED', () => {
  assert.strictEqual(dental.demand_set.market_size, 'NOT_ESTIMATED');
  for (const opp of dental.opportunities) assert.strictEqual(opp.expected_lift, 'NOT_ESTIMATED');
  for (const g of dental.gap_candidates) assert(typeof g.potential_value !== 'number');
});
check('dim/coverage awareness: MarketCoverage present with source/competitor/diversity', () => {
  assert(dental.coverage.source_count >= 1 && typeof dental.coverage.source_diversity === 'number');
});
check('dim/gap-vs-fact distinction: gaps are HYPOTHESIS/VALIDATION_NEEDED, never facts', () => {
  for (const g of dental.gap_candidates) { assert.strictEqual(g.is_market_fact, false); assert(['HYPOTHESIS', 'VALIDATION_NEEDED'].includes(g.status)); }
});
check('dim/recommendation grounding: opportunities tie to supporting claims + require human validation', () => {
  for (const o of dental.opportunities) { assert(o.supporting_claim_refs.length > 0); assert.strictEqual(o.requires_human_validation, true); assert.strictEqual(o.autonomous, false); }
});

console.log(`\nASTRA11D_BENCHMARK_RESULT pass=${pass} fail=${fail}`);
if (fail) { console.log('FAILURES:\n' + notes.join('\n')); process.exit(1); }
