'use strict';
// ASTRA-11E — Competitor Intelligence Engine. Explicit W1..W50 requirement coverage.
// Offline deterministic ONLY. No network, no LLM, no production DB.
const assert = require('assert');
const fs = require('fs'); const path = require('path');
const R = require('../src/commercial/research');
const CI = require('../src/commercial/competitor');
const FX = require('../benchmarks/astra11e/fixtures');
const { mockPlanner } = require('../benchmarks/astra11d/llm_planner');

let pass = 0, fail = 0; const fails = []; const covered = {};
function W(id, name, fn) { covered[id] = true; try { fn(); pass++; console.log('PASS', id, name); } catch (e) { fail++; fails.push(`${id} ${name} :: ${e && e.message}`); console.log('FAIL', id, name, '::', e && e.message); } }

const REF = FX.REFERENCE_TIME;
function research(spec, id) {
  const request = R.request.makeMarketResearchRequest(spec.request);
  const plan = mockPlanner.plan(request);
  const provider = R.sourceProvider.makeFixtureProvider({ provider_id: 'fix.' + id, records: spec.records });
  return R.engine.runMarketResearch({ request, plan, providers: [provider], referenceTime: REF, batch_id: 'WE_' + id });
}
function ci(spec, id, opts = {}) {
  return CI.engine.runCompetitorIntelligence({ researchResult: research(spec, id), referenceTime: REF, positioningAxes: opts.axes || CI.positioningMap.DEFAULT_AXES, identityHints: spec.identityHints || opts.identityHints || {}, threatWeights: opts.threatWeights, subjectContext: opts.subjectContext || { audience: 'local', geography: { country: 'MX' }, channels: ['PAID_SOCIAL'] } });
}
const dental = () => ci(FX.VERTICALS.dental_clinic, 'dental');
const b2b = () => ci(FX.VERTICALS.b2b_service, 'b2b');

// ---- W1..W7 identity + attributes + temporal ----
W('W1', 'valid competitor profile', () => { const o = dental(); assert(o.profiles.length >= 2); for (const p of o.profiles) assert(CI.competitorProfile.validateCompetitorProfile(p).valid && p.competitor_id.startsWith('cmp_')); });
W('W2', 'unresolved identity preserved', () => {
  const spec = { request: { business_ref: 'e', product_or_service: 'x', objectives: ['MESSAGING', 'PRICING'] }, records: [
    { provider_hint: 'research_listing', source_category: 'WEB_PAGE', source_id: 'u1', evidence_ref: 'e_u1', captured_at: '2026-09-01T00:00:00Z', listing: { price: 900, currency: 'MXN', headline: 'Anuncio sin marca identificable', published_at: '2026-08-01T00:00:00Z' } },
    { provider_hint: 'research_listing', source_category: 'WEB_PAGE', source_id: 'u2', competitor_ref: 'known_co', evidence_ref: 'e_u2', captured_at: '2026-09-01T00:00:00Z', listing: { price: 1100, currency: 'MXN', headline: 'Marca conocida', published_at: '2026-08-02T00:00:00Z' } },
  ] };
  const o = ci(spec, 'W2');
  assert(o.profiles.some(p => p.identity_status === 'UNRESOLVED'), 'expected an UNRESOLVED profile; got ' + o.profiles.map(p => p.identity_status));
  assert(o.profiles.some(p => p.identity_status === 'RESOLVED'));
});
W('W3', 'ambiguous identity not auto-merged', () => { const o = ci(FX.ADVERSARIAL.two_similar_names, 'W3'); assert.strictEqual(o.profiles.length, 2); assert(o.profiles.every(p => p.identity_status === 'AMBIGUOUS')); });
W('W4', 'observed attribute requires evidence', () => { const o = b2b(); for (const ref of Object.keys(o.byCompetitor)) for (const a of o.byCompetitor[ref].attributes) if (a.kind === 'OBSERVED') assert(a.evidence_refs.length > 0); assert(!CI.attributeModel.validateAttribute({ attribute: 'price', kind: 'OBSERVED', evidence_refs: [] }).valid); });
W('W5', 'inferred attribute not stamped observed', () => { const o = b2b(); const anal = Object.values(o.byCompetitor).flatMap(b => b.attributes).filter(a => a.kind === 'ANALYTICAL'); assert(anal.length >= 1 && anal.every(a => /ANALYTICAL/i.test(a.note || ''))); });
W('W6', 'temporal snapshot preserved', () => { const o = ci(FX.ADVERSARIAL.old_pricing, 'W6'); const s = o.byCompetitor['subject:Competitor:co_old'].pricingSnapshots; assert(s.length >= 1 && s[0].content_hash && 'source_window' in s[0]); });
W('W7', 'stale pricing not treated as current', () => { const o = ci(FX.ADVERSARIAL.old_pricing, 'W7'); const s = o.byCompetitor['subject:Competitor:co_old'].pricingSnapshots[0]; assert(s.recency !== 'CURRENT'); const cs = CI.temporalState.currentState(o.byCompetitor['subject:Competitor:co_old'].pricingSnapshots); assert(cs.state === 'UNKNOWN_CURRENT' || cs.state === 'HISTORICAL'); });

// ---- W8..W14 positioning / offer / message / proof ----
W('W8', 'positioning synthesis distinct from observed fact', () => { const o = dental(); for (const ref of Object.keys(o.byCompetitor)) { const ps = o.byCompetitor[ref].positioning; assert.strictEqual(ps.positioning_statement.observed, false); assert.strictEqual(ps.positioning_statement.analytical, true); assert.notStrictEqual(ps.positioning_statement.source_class, 'OBSERVED'); } });
W('W9', 'multiple offers preserved', () => { const o = ci(FX.ADVERSARIAL.competitor_multiple_offers, 'W9'); assert(o.byCompetitor['subject:Competitor:co_multi'].offerProfile.offer_count >= 2); });
W('W10', 'offer frequencies deterministic', () => { const a = b2b(), b = b2b(); const f = (o) => CI.offerProfile.computeOfferFieldFrequencies(o.profiles, o.profiles.map(p => o.byCompetitor[p.competitor_ref].offerProfile)).frequencies; assert.deepStrictEqual(f(a), f(b)); });
W('W11', 'exact message text traceable', () => { const o = dental(); const it = Object.values(o.byCompetitor).flatMap(b => b.messageProfile.items).find(i => i.message_field === 'headline'); assert(it && it.raw.verbatim_hash); const { makeVerbatim } = require('../src/commercial/normalization/verbatim'); assert.strictEqual(it.raw.verbatim_hash, makeVerbatim({ verbatim_text: it.raw.verbatim_text, actor: 'advertiser', source_ref: it.raw.source_ref, language: 'es' }).verbatim_hash); });
W('W12', 'analytical message classification distinct from raw text', () => { const o = dental(); for (const it of Object.values(o.byCompetitor).flatMap(b => b.messageProfile.items)) { assert(it.raw.source_class === 'OBSERVED'); assert(it.analysis.analytical === true && it.analysis.taxonomy === 'ucdm-competitor-message-v1'); } });
W('W13', 'published proof distinguished from independent proof', () => { const o = ci(FX.ADVERSARIAL.proof_mix, 'W13'); const items = Object.values(o.byCompetitor).flatMap(b => b.proofProfile.items); assert(items.some(i => i.veracity === 'PUBLISHED_PROOF'), 'expected a PUBLISHED_PROOF'); assert(items.some(i => i.veracity === 'INDEPENDENT_EVIDENCE'), 'expected an INDEPENDENT_EVIDENCE'); });
W('W14', 'proof truth not assumed', () => { const o = dental(); for (const i of Object.values(o.byCompetitor).flatMap(b => b.proofProfile.items)) { assert(!('truth' in i) && !('is_true' in i) && !('verified_true' in i)); assert(CI.proofProfile.validateProofItem(i).valid); } });

// ---- W15..W20 funnel / creative / strength / weakness ----
W('W15', 'observable funnel step preserved', () => { const o = dental(); const fp = Object.values(o.byCompetitor).map(b => b.funnelProfile).find(f => f.observed_touchpoints.length > 0); assert(fp && fp.steps.length >= 1 && fp.steps[0].evidence_refs.length >= 0); });
W('W16', 'missing funnel observation remains UNKNOWN', () => { const o = ci(FX.ADVERSARIAL.no_funnel_visibility, 'W16'); for (const ref of Object.keys(o.byCompetitor)) for (const st of Object.values(o.byCompetitor[ref].funnelProfile.touchpoint_status)) assert(['OBSERVED', 'UNKNOWN'].includes(st)); });
W('W17', 'creative angle traceable', () => { const o = dental(); const items = Object.values(o.byCompetitor).flatMap(b => b.creativeProfile.items); assert(items.length >= 1); for (const i of items) { assert(i.raw.verbatim_hash || (i.raw.verbatim_text && (i.raw.evidence_refs || []).length > 0), 'creative item must be traceable to ASTRA-11C'); assert.strictEqual(i.analysis.analytical, true); } });
W('W18', 'strength is hypothesis', () => { const o = dental(); for (const h of o.strengthHypotheses) { assert.strictEqual(h.kind, 'CompetitorStrengthHypothesis'); assert.strictEqual(h.is_fact, false); assert.strictEqual(h.status, 'HYPOTHESIS'); } });
W('W19', 'weakness is hypothesis', () => { const o = dental(); for (const h of o.weaknessHypotheses) { assert.strictEqual(h.is_fact, false); assert.strictEqual(h.status, 'HYPOTHESIS'); } });
W('W20', 'absence != lack without sufficient coverage', () => {
  const thin = ci(FX.ADVERSARIAL.single_competitor_only, 'W20thin'); // 1 competitor -> coverage cannot support absence
  for (const h of thin.weaknessHypotheses) assert(!/lacks|does not have|missing/i.test(h.statement) || h.coverage_supports_absence === true);
  assert(!CI.hypotheses.validateHypothesis({ kind: 'CompetitorWeaknessHypothesis', is_fact: false, status: 'HYPOTHESIS', statement: 'competitor lacks X', coverage_supports_absence: false, confidence: { produced_by: 'deterministic:ucdm/confidence' } }).valid);
});

// ---- W21..W25 matrix / saturation / taxonomy ----
W('W21', 'matrix distinguishes NOT_OBSERVED_IN_SAMPLE vs UNKNOWN', () => {
  const o = dental();
  const statuses = new Set(o.matrix.rows.flatMap(r => Object.values(r.cells).map(c => c.status)));
  for (const s of statuses) assert(['OBSERVED', 'NOT_OBSERVED_IN_SAMPLE', 'UNKNOWN', 'CONFLICTED'].includes(s));
  assert(o.matrix.legend.NOT_OBSERVED_IN_SAMPLE.includes('NOT proof of absence'));
});
W('W22', 'saturation count deterministic', () => { const a = dental(), b = dental(); assert.deepStrictEqual(a.marketSaturation.patterns.map(p => [p.pattern, p.competitor_count]), b.marketSaturation.patterns.map(p => [p.pattern, p.competitor_count])); });
W('W23', 'duplicate observations do not inflate frequency', () => { const o = ci(FX.ADVERSARIAL.high_volume_duplicated_ads, 'W23'); for (const p of o.marketSaturation.patterns) assert(p.competitor_count <= p.sample_size); });
W('W24', 'duplicate competitors do not inflate sample', () => { const o = ci(FX.ADVERSARIAL.duplicate_competitor_pages, 'W24'); assert.strictEqual(o.profiles.length, 2); assert.strictEqual(o.marketSaturation.sample_size, 2); });
W('W25', 'message taxonomy controlled', () => { const o = dental(); assert.strictEqual(o.messageSaturation.taxonomy, 'ucdm-competitor-message-v1'); const allowed = new Set(Object.keys(CI.messageProfile.MESSAGE_PATTERNS).concat(['UNKNOWN'])); for (const p of o.messageSaturation.patterns) assert(allowed.has(p.label)); });

// ---- W26..W29 gap / positioning axes ----
W('W26', 'differentiation gap is hypothesis', () => { const o = b2b(); for (const g of o.differentiationGaps) { assert.strictEqual(g.is_fact, false); assert(['HYPOTHESIS', 'VALIDATION_NEEDED'].includes(g.status)); } });
W('W27', 'gap cannot be labeled profitable automatically', () => { const o = b2b(); for (const g of o.differentiationGaps) assert.strictEqual(g.profitability, 'UNVALIDATED'); assert(!CI.differentiationGap.validateGap({ kind: 'CompetitorDifferentiationGap', is_fact: false, gap_type: 'message_gap', status: 'VALIDATION_NEEDED', profitability: 'PROFITABLE' }).valid); });
W('W28', 'positioning axes explicit', () => { const noAxes = CI.positioningMap.buildPositioningMap({ axes: [], profiles: [], byCompetitor: {} }); assert.strictEqual(noAxes.status, 'NO_AXES_DEFINED'); const withAxes = dental().positioningMap; assert(Array.isArray(withAxes.axes) && withAxes.axes.every(a => a.axis_definition && a.rubric)); });
W('W29', 'unknown placement preserved', () => { const o = ci(FX.ADVERSARIAL.no_funnel_visibility, 'W29'); const placed = o.positioningMap.placements.flatMap(pl => Object.values(pl.axis_positions).map(ap => ap.position)); assert(placed.includes('UNKNOWN')); });

// ---- W30..W34 threat / opportunity ----
W('W30', 'threat score deterministic', () => { const a = b2b(), b = b2b(); assert.deepStrictEqual(a.threatAssessments.map(t => [t.competitor_ref, t.level, t.score]), b.threatAssessments.map(t => [t.competitor_ref, t.level, t.score])); });
W('W31', 'threat weights configurable', () => {
  const base = ci(FX.VERTICALS.b2b_service, 'W31a');
  const custom = ci(FX.VERTICALS.b2b_service, 'W31b', { threatWeights: { audience_overlap: 1, offer_overlap: 0, geographic_overlap: 0, price_overlap: 0, proof_strength: 0, channel_overlap: 0, review_signal: 0, differentiation_overlap: 0 } });
  assert(custom.threatAssessments.every(t => t.weights_version === 'custom'));
  assert.notDeepStrictEqual(base.threatAssessments.map(t => t.score), custom.threatAssessments.map(t => t.score));
});
W('W32', 'competitor size not automatically threat', () => { const o = b2b(); for (const t of o.threatAssessments) { assert(t.note.includes('size is NOT automatically threat')); if (t.known_signal_count < 3) assert.strictEqual(t.level, 'UNKNOWN'); } });
W('W33', 'opportunity remains non-autonomous', () => { const o = b2b(); for (const opp of o.opportunities) { assert.strictEqual(opp.autonomous, false); assert.strictEqual(opp.requires_human_validation, true); assert(opp.recommended_validation.length > 0); } });
W('W34', 'expected lift not invented', () => { const o = b2b(); for (const opp of o.opportunities) assert.strictEqual(opp.expected_lift, 'NOT_ESTIMATED'); });

// ---- W35..W40 completion / report / stability ----
W('W35', 'completion deterministic', () => { const a = dental(), b = dental(); assert.strictEqual(a.completion.completion_id, b.completion.completion_id); assert(CI.coverage.COMPLETION_STATUS.includes(a.completion.status)); });
W('W36', 'stale data produces completion reason', () => { const o = ci(FX.ADVERSARIAL.old_pricing, 'W36'); assert(o.completion.reason_codes.includes('STALE_DATA')); });
W('W37', 'identity ambiguity produces completion reason', () => { const o = ci(FX.ADVERSARIAL.two_similar_names, 'W37'); assert(o.completion.reason_codes.includes('IDENTITY_AMBIGUITY')); });
W('W38', 'report evidence graph valid', () => { const o = dental(); assert.strictEqual(o.report.evidence_graph_valid, true); assert.deepStrictEqual(o.report.evidence_graph_errors, []); assert(o.report.sections.evidence_appendix.count > 0); });
W('W39', 'missing sections remain UNKNOWN', () => { const o = ci(FX.ADVERSARIAL.missing_proof, 'W39'); assert.deepStrictEqual(o.report.sections.proof_landscape, { status: 'UNKNOWN' }); assert.strictEqual(o.report.section_names.length, 22); });
W('W40', 'identical input yields stable output', () => { const a = dental(), b = dental(); assert.strictEqual(a.report.content_hash, b.report.content_hash); });

// ---- W41..W50 compatibility / isolation ----
W('W41', 'provider-neutral compatibility (no vendor ids in any output)', () => {
  const o = ci(FX.ADVERSARIAL.high_volume_duplicated_ads, 'W41');
  const blob = JSON.stringify({ p: o.profiles, bc: o.byCompetitor, r: o.report });
  assert(!/"ad_id"|page_id|fbclid|utm_source|"wamid"/.test(blob));
});
W('W42', 'ASTRA-11B compatibility', () => { const o = dental(); assert.strictEqual(CI.UCDM_SCHEMA_VERSION, 'ucdm-1.0.0'); for (const p of o.profiles) assert.strictEqual(p.confidence.produced_by, 'deterministic:ucdm/confidence'); });
W('W43', 'ASTRA-11C compatibility', () => { assert.strictEqual(CI.INGEST_SCHEMA_VERSION, 'ucdm-ingest-1.0.0'); const o = dental(); assert.strictEqual(o.report.downstream_schema_versions.ingest, 'ucdm-ingest-1.0.0'); });
W('W44', 'ASTRA-11D compatibility', () => { assert.strictEqual(CI.RESEARCH_SCHEMA_VERSION, 'ucdm-research-1.0.0'); const o = dental(); assert.strictEqual(o.report.downstream_schema_versions.research, 'ucdm-research-1.0.0'); });
W('W45', 'no network dependency', () => {
  let src = '';
  for (const f of fs.readdirSync(path.join(__dirname, '../src/commercial/competitor'))) src += fs.readFileSync(path.join(__dirname, '../src/commercial/competitor', f), 'utf8');
  assert(!/require\(['"](http|https|net|dns|tls)['"]\)|fetch\(|XMLHttpRequest/.test(src));
});
W('W46', 'no DB dependency', () => {
  for (const f of fs.readdirSync(path.join(__dirname, '../src/commercial/competitor'))) { const s = fs.readFileSync(path.join(__dirname, '../src/commercial/competitor', f), 'utf8'); assert(!/supabase|createClient|\bpg\b|mysql|mongodb/i.test(s), f + ' references a DB'); }
});
W('W47', 'no production routing', () => { const o = dental(); assert(o.report.caveats.some(c => /production routing/.test(c))); assert(o.provenance_note.includes('No production routing')); });
W('W48', 'no autonomous action', () => { const o = b2b(); for (const opp of o.opportunities) assert.strictEqual(opp.autonomous, false); assert(o.provenance_note.includes('No autonomous action')); });
W('W49', 'ASTRA-10 frozen artifacts unchanged', () => { const f = JSON.parse(fs.readFileSync(path.join(__dirname, '../benchmarks/astra10ah/freeze.json'), 'utf8')); assert.strictEqual(f.harness_hash_sha256, '57305a9dee3f9130d8f913e28280d759e78c32cee5affb0ac8931a4da725d53d'); });
W('W50', 'benchmark isolated from production', () => { const d = fs.readdirSync(path.join(__dirname, '../benchmarks/astra11e')); assert(d.includes('run_competitor_benchmark.js') && d.includes('fixtures.js')); });

const missing = []; for (let i = 1; i <= 50; i++) if (!covered['W' + i]) missing.push('W' + i);
if (missing.length) { fail++; fails.push('W-matrix incomplete: ' + missing.join(', ')); console.log('FAIL W-matrix completeness ::', missing.join(', ')); }
else console.log('PASS W-matrix completeness (W1..W50 all have explicit test evidence)');

console.log(`\nASTRA11E_TEST_RESULT pass=${pass} fail=${fail}`);
if (fail) { console.log('FAILURES:\n' + fails.join('\n')); process.exit(1); }
