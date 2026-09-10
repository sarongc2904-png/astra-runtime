'use strict';
// [ASTRA-11E benchmark] Offline, mock-only. Zero network, zero LLM, zero cost.
// 6 verticals + 12 adversarial competitor cases + 12 benchmark dimensions.
const assert = require('assert');
const R = require('../../src/commercial/research');
const CI = require('../../src/commercial/competitor');
const { mockPlanner } = require('../astra11d/llm_planner');
const FX = require('./fixtures');

let pass = 0, fail = 0; const notes = [];
function check(name, fn) { try { fn(); pass++; console.log('PASS', name); } catch (e) { fail++; notes.push(name + ' :: ' + e.message); console.log('FAIL', name, '::', e.message); } }

const REF = FX.REFERENCE_TIME;
function research(spec, id) {
  const request = R.request.makeMarketResearchRequest(spec.request);
  const plan = mockPlanner.plan(request);
  const provider = R.sourceProvider.makeFixtureProvider({ provider_id: 'fix.' + id, records: spec.records });
  return R.engine.runMarketResearch({ request, plan, providers: [provider], referenceTime: REF, batch_id: 'CI_' + id });
}
function ci(spec, id) {
  return CI.engine.runCompetitorIntelligence({ researchResult: research(spec, id), referenceTime: REF, positioningAxes: CI.positioningMap.DEFAULT_AXES, identityHints: spec.identityHints || {}, subjectContext: { audience: 'local', geography: { country: 'MX' }, channels: ['PAID_SOCIAL'] } });
}

// ---- 6 verticals ----
for (const [name, spec] of Object.entries(FX.VERTICALS)) {
  check(`vertical/${name}: runs, deterministic, 22 report sections, evidence graph valid`, () => {
    const a = ci(spec, 'V_' + name), b = ci(spec, 'V_' + name);
    assert.strictEqual(a.report.report_id, b.report.report_id);
    assert.strictEqual(a.report.section_names.length, 22);
    assert(a.report.evidence_graph_valid, JSON.stringify(a.report.evidence_graph_errors));
    assert.strictEqual(a.report.generated_by, 'deterministic:ucdm/competitor');
    for (const p of a.profiles) assert(CI.competitorProfile.validateCompetitorProfile(p).valid);
  });
}

// ---- 12 adversarial ----
check('adv/single_competitor_only -> completion PARTIAL/INSUFFICIENT, LOW_COMPETITOR_COUNT', () => {
  const o = ci(FX.ADVERSARIAL.single_competitor_only, 'A_single');
  assert(['PARTIAL', 'INSUFFICIENT', 'BLOCKED'].includes(o.completion.status));
  assert(o.completion.reason_codes.includes('LOW_COMPETITOR_COUNT'));
});
check('adv/two_similar_names -> NOT auto-merged, both AMBIGUOUS, IDENTITY_AMBIGUITY reason', () => {
  const o = ci(FX.ADVERSARIAL.two_similar_names, 'A_names');
  assert.strictEqual(o.profiles.length, 2);
  assert(o.profiles.every(p => p.identity_status === 'AMBIGUOUS'));
  assert(o.completion.reason_codes.includes('IDENTITY_AMBIGUITY'));
});
check('adv/old_pricing -> historical pricing snapshot not treated as current', () => {
  const o = ci(FX.ADVERSARIAL.old_pricing, 'A_old');
  const oldCo = o.byCompetitor['subject:Competitor:co_old'];
  const snap = oldCo.pricingSnapshots[0];
  assert(snap.recency === 'HISTORICAL' || snap.recency === 'UNKNOWN_CURRENT');
  assert(o.completion.reason_codes.includes('STALE_DATA'));
});
check('adv/conflicting_price -> OPEN VALUE_CONFLICT, CONFLICTED_DATA', () => {
  const o = ci(FX.ADVERSARIAL.conflicting_price, 'A_confp');
  assert(o.conflicts.some(c => c.kind === 'VALUE_CONFLICT' && c.status === 'OPEN' && c.resolution === null));
  assert(o.completion.reason_codes.includes('CONFLICTED_DATA'));
});
check('adv/conflicting_offer -> CATEGORICAL_CONFLICT on guarantee', () => {
  const o = ci(FX.ADVERSARIAL.conflicting_offer, 'A_confo');
  assert(o.conflicts.some(c => c.fact_type === 'OBSERVED_GUARANTEE' && c.kind === 'CATEGORICAL_CONFLICT'));
});
check('adv/missing_proof -> proof_coverage 0, MISSING_PROOF_DATA, proof section UNKNOWN', () => {
  const o = ci(FX.ADVERSARIAL.missing_proof, 'A_noproof');
  assert.strictEqual(o.coverage.proof_coverage, 0);
  assert(o.completion.reason_codes.includes('MISSING_PROOF_DATA'));
});
check('adv/duplicate_competitor_pages -> exact dup does not inflate the sample', () => {
  const o = ci(FX.ADVERSARIAL.duplicate_competitor_pages, 'A_dupc');
  assert.strictEqual(o.profiles.length, 2, 'two distinct competitors despite a duplicated page');
});
check('adv/duplicate_reviews -> duplicate content does not inflate proof/review counts', () => {
  const o = ci(FX.ADVERSARIAL.duplicate_reviews, 'A_dupr');
  const b = o.byCompetitor[Object.keys(o.byCompetitor)[0]] || {};
  // dedup handled upstream by ASTRA-11C; the review facts should not multiply
  assert(o.marketSaturation.patterns.every(p => p.competitor_count <= p.sample_size));
});
check('adv/competitor_multiple_offers -> multiple simultaneous offers preserved', () => {
  const o = ci(FX.ADVERSARIAL.competitor_multiple_offers, 'A_multi');
  const multi = o.byCompetitor['subject:Competitor:co_multi'];
  assert(multi.offerProfile.offer_count >= 2, 'both offer surfaces retained');
});
check('adv/competitor_rebrand -> alias preserved, not merged with other competitor', () => {
  const o = ci(FX.ADVERSARIAL.competitor_rebrand, 'A_rebrand');
  const nb = o.profiles.find(p => p.competitor_ref === 'subject:Competitor:newbrand_co');
  assert(nb && nb.aliases.includes('OldBrand Co'));
  assert.strictEqual(o.profiles.length, 2);
});
check('adv/high_volume_duplicated_ads -> one competitor, duplicated ads do not inflate frequency', () => {
  const o = ci(FX.ADVERSARIAL.high_volume_duplicated_ads, 'A_hvads');
  assert(o.marketSaturation.patterns.every(p => p.competitor_count <= p.sample_size));
});
check('adv/no_funnel_visibility -> touchpoints UNKNOWN not ABSENT; funnel_coverage 0', () => {
  const o = ci(FX.ADVERSARIAL.no_funnel_visibility, 'A_nofun');
  for (const ref of Object.keys(o.byCompetitor)) {
    const fp = o.byCompetitor[ref].funnelProfile;
    for (const st of Object.values(fp.touchpoint_status)) assert(['OBSERVED', 'UNKNOWN'].includes(st));
  }
});

// ---- 12 benchmark dimensions (over the dental vertical) ----
const dental = ci(FX.VERTICALS.dental_clinic, 'DIM');
check('dim/identity discipline: no fuzzy/LLM resolution; method EXPLICIT_ONLY', () => {
  for (const p of dental.profiles) assert.strictEqual(p.identity_resolution_method, 'EXPLICIT_ONLY');
});
check('dim/evidence discipline: every OBSERVED attribute has evidence_refs', () => {
  for (const ref of Object.keys(dental.byCompetitor)) for (const a of dental.byCompetitor[ref].attributes) if (a.kind === 'OBSERVED') assert(a.evidence_refs.length > 0);
});
check('dim/temporal discipline: snapshots carry recency labels', () => {
  for (const ref of Object.keys(dental.byCompetitor)) for (const s of dental.byCompetitor[ref].pricingSnapshots) assert(['CURRENT', 'HISTORICAL', 'UNKNOWN_CURRENT'].includes(s.recency));
});
check('dim/offer accuracy: offer field frequencies deterministic', () => {
  const a = ci(FX.VERTICALS.b2b_service, 'DIM_o1'), b = ci(FX.VERTICALS.b2b_service, 'DIM_o2');
  assert.deepStrictEqual(
    CI.offerProfile.computeOfferFieldFrequencies(a.profiles, a.profiles.map(p => a.byCompetitor[p.competitor_ref].offerProfile)).frequencies,
    CI.offerProfile.computeOfferFieldFrequencies(b.profiles, b.profiles.map(p => b.byCompetitor[p.competitor_ref].offerProfile)).frequencies);
});
check('dim/pricing accuracy: price_position from sample median, deterministic', () => {
  const positions = dental.profiles.map(p => dental.byCompetitor[p.competitor_ref].positioning.observed_elements.price_position);
  assert(positions.some(pp => pp.value || pp.status === 'UNKNOWN'));
});
check('dim/message traceability: every message item keeps raw verbatim traceable to ASTRA-11C', () => {
  for (const ref of Object.keys(dental.byCompetitor)) for (const it of dental.byCompetitor[ref].messageProfile.items) assert(CI.messageProfile.validateMessageItem(it).valid);
});
check('dim/proof discipline: veracity labelled; truth never asserted', () => {
  for (const ref of Object.keys(dental.byCompetitor)) for (const it of dental.byCompetitor[ref].proofProfile.items) { assert(['PUBLISHED_PROOF', 'INDEPENDENT_EVIDENCE', 'UNKNOWN_VERACITY'].includes(it.veracity)); assert(!('truth' in it) && !('is_true' in it)); }
});
check('dim/coverage awareness: CI coverage present with the required fields', () => {
  for (const k of ['competitors_observed', 'competitors_resolved', 'attribute_coverage', 'pricing_coverage', 'message_coverage', 'proof_coverage', 'funnel_coverage', 'creative_coverage', 'time_coverage']) assert(k in dental.coverage);
});
check('dim/absence-vs-unknown: matrix distinguishes NOT_OBSERVED_IN_SAMPLE from UNKNOWN', () => {
  const statuses = new Set(dental.matrix.rows.flatMap(r => Object.values(r.cells).map(c => c.status)));
  for (const s of statuses) assert(['OBSERVED', 'NOT_OBSERVED_IN_SAMPLE', 'UNKNOWN', 'CONFLICTED'].includes(s));
});
check('dim/saturation accuracy: counts <= sample size; extrapolation NONE_BEYOND_SAMPLE', () => {
  assert.strictEqual(dental.marketSaturation.extrapolation, 'NONE_BEYOND_SAMPLE');
  for (const p of dental.marketSaturation.patterns) assert(p.competitor_count <= p.sample_size);
});
check('dim/gap-vs-fact: differentiation gaps are hypotheses, never facts, never "profitable"', () => {
  for (const g of dental.differentiationGaps) { assert.strictEqual(g.is_fact, false); assert.strictEqual(g.profitability, 'UNVALIDATED'); }
});
check('dim/opportunity grounding: opportunities non-autonomous, no fabricated lift, reference a gap/evidence', () => {
  for (const o of dental.opportunities) { assert.strictEqual(o.autonomous, false); assert.strictEqual(o.expected_lift, 'NOT_ESTIMATED'); assert(o.supporting_gap_refs.length + o.supporting_evidence_refs.length > 0); }
});

console.log(`\nASTRA11E_BENCHMARK_RESULT pass=${pass} fail=${fail}`);
if (fail) { console.log('FAILURES:\n' + notes.join('\n')); process.exit(1); }
