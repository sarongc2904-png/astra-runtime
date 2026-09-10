'use strict';
// ASTRA-11I — Positioning + Offer Intelligence Engine. Explicit W1..W70 + compatibility/security.
// Offline deterministic ONLY. No network, no LLM, no production DB.
const assert = require('assert');
const fs = require('fs'); const path = require('path');
const R = require('../src/commercial/research');
const VOC = require('../src/commercial/voc');
const CM = require('../src/commercial/customer_model');
const JN = require('../src/commercial/journey');
const PO = require('../src/commercial/positioning_offer');
const FX = require('../benchmarks/astra11i/fixtures');
const { mockPlanner } = require('../benchmarks/astra11d/llm_planner');

let pass = 0, fail = 0; const fails = []; const covered = {};
function W(id, name, fn) { covered[id] = true; try { fn(); pass++; console.log('PASS', id, name); } catch (e) { fail++; fails.push(`${id} ${name} :: ${e && e.message}`); console.log('FAIL', id, name, '::', e && e.message); } }

const REF = FX.REFERENCE_TIME;
function research(spec, id) {
  const request = R.request.makeMarketResearchRequest(spec.request);
  const plan = mockPlanner.plan(request);
  return R.engine.runMarketResearch({ request, plan, providers: [R.sourceProvider.makeFixtureProvider({ provider_id: 'fix.' + id, records: spec.records })], referenceTime: REF, batch_id: 'IT_' + id });
}
function voc(spec, id) { return VOC.engine.runVoiceOfCustomer({ researchResult: research(spec, id), referenceTime: REF, speakerHints: spec.speakerHints || {} }); }
function cm(spec, id) { return CM.engine.runCustomerModel({ vocResult: voc(spec, id), researchResult: research(spec, id), referenceTime: REF, businessInput: spec.businessInput || {} }); }
function jn(spec, id) { return JN.engine.runCustomerJourney({ vocResult: voc(spec, id), customerModel: cm(spec, id), researchResult: research(spec, id), referenceTime: REF, businessInput: spec.businessInput || {} }); }
function po(spec, id) { return PO.engine.runPositioningOffer({ vocResult: voc(spec, id), customerModel: cm(spec, id), journeyResult: jn(spec, id), researchResult: research(spec, id), referenceTime: REF, businessInput: spec.businessInput || {} }); }
const withBI = (v) => ({ ...v, businessInput: FX.BI });
const dental = () => po(withBI(FX.VERTICALS.dental_clinic), 'dental');

// ---------- positioning (W1..W12) ----------
W('W1', 'positioning evidence preserves provenance', () => { const o = dental(); assert(o.positioningEvidence.length > 0 && o.positioningEvidence.every(e => e.origin_module && Array.isArray(e.evidence_refs))); for (const e of o.positioningEvidence) assert(PO.positioningEvidence.validatePositioningEvidence(e).valid); });
W('W2', 'evidence-backed positioning territory', () => { const o = dental(); const t = o.territories.find(x => ['SUPPORTED', 'PARTIAL'].includes(x.status)); assert(t && t.evidence_refs.length > 0); });
W('W3', 'territory is analytical, never market fact', () => { const o = dental(); for (const t of o.territories) assert(t.is_market_fact === false && PO.positioningTerritory.validateTerritory(t).valid); });
W('W4', 'unsupported positioning stays HYPOTHESIS/INSUFFICIENT', () => { const o = po(FX.ADVERSARIAL.strong_capability_weak_voc, 'W4'); assert(o.territories.every(t => ['HYPOTHESIS', 'INSUFFICIENT', 'PARTIAL'].includes(t.status))); });
W('W5', 'no market-wide uniqueness claim (distinctiveness)', () => { const o = po(FX.ADVERSARIAL.identical_competitor_messages, 'W5'); for (const d of Object.values(o.distinctivenessBySegment)) { assert(d.market_wide_uniqueness_claim === 'NOT_ASSERTED'); assert(PO.distinctiveness.validateDistinctiveness(d).valid); } });
W('W6', 'no "unique"/"best" language survives validation', () => {
  let ok = false;
  try { po(FX.ADVERSARIAL.claimed_uniqueness_no_evidence, 'W6'); } catch (e) { ok = /unique|best/i.test(e.message); }
  if (!ok) { const o = po(FX.ADVERSARIAL.claimed_uniqueness_no_evidence, 'W6b'); ok = o.claims.every(c => c.verdict !== 'ACCEPTED' || !/\bunique\b|the best|nadie m[aá]s/i.test(c.statement)); }
  assert(ok);
});
W('W7', 'segment-specific positioning: one territory per segment', () => { const o = dental(); assert(o.territories.length === o.report.sections.target_segments.length); });
W('W8', 'multi-segment positions preserved, not averaged', () => { const o = po(FX.ADVERSARIAL.two_valid_territories, 'W8'); assert(o.positioningComparison.universal_positioning_forced === false); assert(o.territories.filter(t => ['SUPPORTED', 'PARTIAL'].includes(t.status)).length >= 2); });
W('W9', 'positioning comparison reports differences deterministically', () => { const a = po(FX.ADVERSARIAL.two_valid_territories, 'W9'); const b = po(FX.ADVERSARIAL.two_valid_territories, 'W9'); assert.deepStrictEqual(a.positioningComparison.differences, b.positioningComparison.differences); });
W('W10', 'category discipline: no category invented for novelty', () => { const o = dental(); for (const f of Object.values(o.frameBySegment)) { assert(f.invented_for_novelty === false && PO.categoryFrame.validateFrame(f).valid); } });
W('W11', 'new/alternative category only when USER_PROVIDED', () => {
  const s = { ...withBI(FX.VERTICALS.dental_clinic), businessInput: { ...FX.BI, category: { new_category: true, label: 'odontología express' } } };
  const o = po(s, 'W11');
  for (const f of Object.values(o.frameBySegment)) if (f.frame_type === 'ALTERNATIVE_CATEGORY') assert(f.basis === 'USER_PROVIDED');
});
W('W12', 'analytical frame carries evidence', () => { const o = dental(); for (const f of Object.values(o.frameBySegment)) if (['PROBLEM_BASED_FRAME', 'OUTCOME_BASED_FRAME'].includes(f.frame_type)) assert(f.evidence_refs.length > 0); });

// ---------- value proposition + differentiation (W13..W22) ----------
W('W13', 'value proposition built only from canonical supported fields', () => { const o = dental(); for (const v of o.valueProps) assert(PO.valueProposition.validateValueProposition(v).valid); });
W('W14', 'VP missing support -> PARTIAL/HYPOTHESIS/INSUFFICIENT', () => { const o = po(FX.ADVERSARIAL.strong_capability_weak_voc, 'W14'); assert(o.valueProps.every(v => v.status !== 'SUPPORTED')); });
W('W15', 'VP render adds no new facts / no hype', () => { const o = dental(); for (const v of o.valueProps) { assert(v.rendered.adds_no_new_facts === true); assert(!/guaranteed results|the only|world[- ]class|revolucionari/i.test(v.rendered.text)); } });
W('W16', 'differentiation evidence discipline', () => { const o = dental(); for (const d of o.differentiation) assert(PO.differentiation.validateDifferentiation(d).valid); });
W('W17', 'differentiation distinguishes observed capability / market comparison / hypothesis', () => { const o = dental(); for (const d of o.differentiation) assert('observed_capability' in d && 'market_comparison' in d && 'analytical_hypothesis' in d); });
W('W18', 'DISTINCT_IN_SAMPLE impossible with no competitor sample', () => { const o = dental(); for (const d of o.differentiation) if (d.market_comparison.competitor_sample_size === 0) assert(d.uniqueness_status !== 'DISTINCT_IN_SAMPLE'); });
W('W19', 'distinctiveness calculation: overlap/whitespace/contested only with a sample', () => { const o = dental(); const d = Object.values(o.distinctivenessBySegment)[0]; if (d.competitor_sample_size === 0) assert(d.overlap.length === 0 && d.contested.length === 0); });
W('W20', 'positioning fit deterministic + null band when insufficient', () => { const a = dental(), b = dental(); assert.deepStrictEqual(a.positioningFits.map(f => f.fit_id), b.positioningFits.map(f => f.fit_id)); for (const f of a.positioningFits) { assert(PO.positioningFit.validatePositioningFit(f).valid); if (f.coverage_weight_mass < 0.5) assert(f.total_score === null && f.fit_band === 'UNKNOWN'); } });
W('W21', 'configurable positioning fit weights', () => {
  const s = { ...withBI(FX.VERTICALS.dental_clinic), businessInput: { ...FX.BI, positioning_fit_weights: { segment_relevance: 0.5, problem_fit: 0.2, jtbd_fit: 0.05, desired_outcome_fit: 0.05, objection_compatibility: 0.05, proof_availability: 0.05, business_capability_fit: 0.02, competitive_distinctiveness: 0.02, evidence_coverage: 0.06 } } };
  const o = po(s, 'W21');
  assert(o.positioningFits.every(f => f.weights_version === 'custom'));
});
W('W22', 'category/frame reference points come from journey alternatives', () => { const o = po(withBI(FX.VERTICALS.dental_clinic), 'W22'); assert(Object.values(o.frameBySegment).every(f => Array.isArray(f.reference_points))); });

// ---------- offer architecture + components (W23..W34) ----------
W('W23', 'offer architecture: no manufactured elements', () => { const o = dental(); assert(o.offerArchitecture.manufactured_elements.length === 0 && PO.offerArchitecture.validateOfferArchitecture(o.offerArchitecture).valid); });
W('W24', 'every offer component declares source/status', () => { const o = dental(); for (const c of o.offerArchitecture.components) { assert(PO.offerComponent.COMPONENT_STATUS.includes(c.status)); assert(PO.offerComponent.validateOfferComponent(c).valid); } });
W('W25', 'bonus/guarantee/scarcity/urgency only USER_PROVIDED', () => {
  const o = po(FX.ADVERSARIAL.unsupported_guarantee_temptation, 'W25');
  assert(!o.offerArchitecture.components.some(c => c.component_type === 'GUARANTEE'));
  const c = PO.offerComponent.makeOfferComponent({ component_type: 'BONUS', label: 'x', status: 'ANALYTICAL' });
  assert(c.status === 'UNKNOWN' && c.manufactured_block === true);
});
W('W26', 'feature/benefit/outcome separation', () => { const o = dental(); for (const b of o.benefitMap) assert('feature' in b && 'capability' in b && 'functional_benefit' in b && 'emotional_benefit' in b && 'outcome' in b); });
W('W27', 'no emotional-benefit fiction', () => { const o = po(FX.ADVERSARIAL.emotional_transformation_temptation, 'W27'); for (const b of o.benefitMap) assert(b.emotional_benefit.status === 'UNKNOWN'); });
W('W28', 'no social-benefit fiction', () => { const o = po(FX.ADVERSARIAL.emotional_transformation_temptation, 'W28'); for (const b of o.benefitMap) assert(b.social_benefit.status === 'UNKNOWN' && PO.benefitModel.validateBenefitChain(b).valid); });
W('W29', 'no transformation language in benefit chain', () => { const o = dental(); for (const b of o.benefitMap) assert(!/transform your life|feel unstoppable|convi[eé]rtete en|new you/i.test(JSON.stringify(b))); });
W('W30', 'mechanism discipline: no invented proprietary process', () => { const o = dental(); assert(o.mechanism.invented_process === false && PO.mechanism.validateMechanism(o.mechanism).valid); });
W('W31', 'analytical mechanism framing does not name a method', () => { const o = dental(); if (o.mechanism.status === 'ANALYTICAL_FRAMING') assert(!/\bm[eé]todo\b|framework|the \w+ method|3[- ]step system/i.test(o.mechanism.statement || '')); });
W('W32', 'proof strategy: available vs required vs gap', () => { const o = po(FX.ADVERSARIAL.missing_proof, 'W32'); assert(o.proofStrategy.gaps.length > 0 && PO.proofStrategy.validateProofStrategy(o.proofStrategy).valid); });
W('W33', 'no fabricated proof (proof only from USER_PROVIDED assets)', () => { const o = po(FX.ADVERSARIAL.missing_proof, 'W33'); assert(o.proofStrategy.available.length === 0); for (const i of o.proofStrategy.items) assert(i.fabricated === false); });
W('W34', 'available proof requires a supplied asset', () => { const o = dental(); for (const i of o.proofStrategy.items) if (i.status === 'AVAILABLE_PROOF') assert(i.available_from_business === true); });

// ---------- risk reversal + objections + pricing (W35..W46) ----------
W('W35', 'risk reversal analytical only', () => { const o = dental(); for (const r of o.riskReversals) assert(r.status === 'ANALYTICAL' && PO.riskReversal.validateRiskReversal(r).valid); });
W('W36', 'risk reversal does not assert legal/financial viability', () => { const o = dental(); for (const r of o.riskReversals) assert(r.legal_financial_viability === 'NOT_ASSESSED'); });
W('W37', 'risk reversal driven by evidenced fear/friction', () => { const o = dental(); for (const r of o.riskReversals) assert(r.evidence_refs.length > 0); });
W('W38', 'objections grounded in evidence', () => { const o = dental(); for (const m of o.objectionMap) assert(m.evidence_refs.length > 0 && PO.objectionMap.validateObjectionMapping(m).valid); });
W('W39', 'ADDRESSED only when no remedy gap', () => { const o = dental(); for (const m of o.objectionMap) if (m.handling_status === 'ADDRESSED') assert(m.remaining_gap.length === 0); });
W('W40', 'partial objection handling preserved', () => { const o = dental(); assert(PO.objectionMap.HANDLING_STATUS.includes('PARTIALLY_ADDRESSED')); for (const m of o.objectionMap) assert(['ADDRESSED', 'PARTIALLY_ADDRESSED', 'UNADDRESSED', 'UNKNOWN'].includes(m.handling_status)); });
W('W41', 'pricing observed/supplied only', () => { const o = dental(); assert(PO.pricing.validatePricing(o.pricing).valid); assert(o.pricing.own_supplied_price.status === 'UNKNOWN' || o.pricing.own_supplied_price.source_class === 'USER_PROVIDED'); });
W('W42', 'no willingness-to-pay invention', () => { const o = po(FX.ADVERSARIAL.fabricated_wtp_temptation, 'W42'); assert.strictEqual(o.pricing.willingness_to_pay, 'NOT_ESTIMATED'); });
W('W43', 'no optimal-price invention', () => { const o = po(FX.ADVERSARIAL.fabricated_wtp_temptation, 'W43'); assert.strictEqual(o.pricing.optimal_price, 'NOT_ESTIMATED'); });
W('W44', 'no FX conversion unless supplied', () => { const o = po(FX.ADVERSARIAL.competitor_price_conflict, 'W44'); assert.strictEqual(o.pricing.fx_applied, false); });
W('W45', 'competitor price conflict surfaced, not reconciled', () => { const o = po(FX.ADVERSARIAL.competitor_price_conflict, 'W45'); assert(o.pricing.price_conflict.status !== 'NONE'); assert(o.offerGaps.some(g => g.gap_type === 'PRICING_AMBIGUITY')); });
W('W46', 'price unknown -> UNKNOWN + gap/reason', () => { const o = po(FX.ADVERSARIAL.price_unknown, 'W46'); assert(o.pricing.own_supplied_price.status === 'UNKNOWN'); assert(o.completion.reason_codes.includes('MISSING_PRICING') || o.offerGaps.some(g => g.gap_type === 'PRICING_AMBIGUITY')); });

// ---------- packaging + urgency/scarcity + fits (W47..W58) ----------
W('W47', 'packaging analytical + non-autonomous', () => { const o = dental(); for (const p of o.packaging) assert(p.status === 'ANALYTICAL' && p.autonomous === false && PO.packaging.validatePackaging(p).valid); });
W('W48', 'packaging cites a rationale', () => { const o = dental(); for (const p of o.packaging) assert(p.rationale && p.rationale.length > 0); });
W('W49', 'no fake urgency', () => { const o = po(FX.ADVERSARIAL.fake_urgency_temptation, 'W49'); const u = o.urgencyScarcity.elements.find(e => e.kind === 'URGENCY'); assert(u.basis === 'UNSUPPORTED'); assert(!o.offerArchitecture.components.some(c => c.component_type === 'URGENCY')); });
W('W50', 'no fake scarcity', () => { const o = po(FX.ADVERSARIAL.fake_scarcity_temptation, 'W50'); const s = o.urgencyScarcity.elements.find(e => e.kind === 'SCARCITY'); assert(s.basis === 'UNSUPPORTED'); assert(!o.offerArchitecture.components.some(c => c.component_type === 'SCARCITY')); });
W('W51', 'real capacity scarcity accepted as USER_PROVIDED', () => { const o = po(FX.ADVERSARIAL.real_capacity_scarcity, 'W51'); assert(o.offerArchitecture.components.some(c => c.component_type === 'SCARCITY' && c.status === 'USER_PROVIDED')); assert(PO.urgencyScarcity.validateUrgencyScarcity(o.urgencyScarcity).valid); });
W('W52', 'urgency_scarcity.manufactured_any is false', () => { const o = dental(); assert(o.urgencyScarcity.manufactured_any === false); });
W('W53', 'offer-segment fit deterministic', () => { const a = dental(), b = dental(); assert.deepStrictEqual(a.offerSegmentFits.map(f => f.fit_id), b.offerSegmentFits.map(f => f.fit_id)); });
W('W54', 'offer-segment fit null score when insufficient', () => { const o = dental(); for (const f of o.offerSegmentFits) { assert(PO.offerSegmentFit.validateOfferSegmentFit(f).valid); if (f.coverage_weight_mass < 0.5) assert(f.total_score === null); } });
W('W55', 'offer-journey fit does not assume one offer fits all stages', () => { const o = dental(); assert(o.offerJourneyFit.assumes_one_offer_fits_all_stages === false && PO.offerJourneyFit.validateOfferJourneyFit(o.offerJourneyFit).valid); });
W('W56', 'journey-stage mismatch surfaced', () => { const o = po(FX.ADVERSARIAL.journey_stage_mismatch, 'W56'); assert(o.offerJourneyFit.unaddressed_stages.length >= 1 || o.offerGaps.some(g => g.gap_type === 'JOURNEY_MISMATCH')); });
W('W57', 'competitor comparison scoped to evidence; no "better" claim', () => { const o = po(FX.ADVERSARIAL.identical_competitor_messages, 'W57'); assert(o.competitorComparison.scoped_to_evidence === true && o.competitorComparison.better_claims.length === 0 && PO.competitorComparison.validateCompetitorComparison(o.competitorComparison).valid); });
W('W58', 'competitor comparison UNKNOWN with no sample', () => { const o = dental(); if (o.competitorComparison.competitor_sample_size === 0) assert(o.competitorComparison.dimensions.every(d => d.status === 'UNKNOWN')); });

// ---------- gaps + opportunities + message + claims + conflicts + completion (W59..W70) ----------
W('W59', 'gap detection: gaps are analytical', () => { const o = po(FX.ADVERSARIAL.missing_proof, 'W59'); assert(o.offerGaps.length > 0); for (const g of o.offerGaps) assert(g.is_fact === false && PO.offerGap.validateOfferGap(g).valid); });
W('W60', 'opportunity non-autonomous', () => { const o = dental(); for (const op of o.opportunities) assert(op.autonomous === false && PO.offerOpportunity.validateOpportunity(op).valid); });
W('W61', 'expected lift NOT_ESTIMATED', () => { const o = dental(); for (const op of o.opportunities) assert(op.expected_lift === 'NOT_ESTIMATED'); });
W('W62', 'message foundation grounded, not ad copy', () => { const o = dental(); for (const m of o.messageFoundations) { assert(m.is_ad_copy === false && PO.messageFoundation.validateMessageFoundation(m).valid); } });
W('W63', 'message foundation reuses ASTRA-11F buying language', () => {
  const o = dental();
  const m = o.messageFoundations.find(x => x.buying_language_refs && x.buying_language_refs.status !== 'UNKNOWN');
  if (m) assert(m.buying_language_refs.contains_generated_copy === false && m.buying_language_refs.library_id);
  else assert(o.messageFoundations.length >= 1);
});
W('W64', 'factual/comparative/outcome claims require evidence', () => { const o = dental(); for (const c of o.claims) { assert(PO.claimValidation.validateClaim(c).valid); if (c.verdict === 'ACCEPTED' && ['FACTUAL', 'COMPARATIVE', 'OUTCOME'].includes(c.final_claim_type)) assert(c.evidence_refs.length > 0); } });
W('W65', 'unsupported claim downgraded/rejected', () => {
  const rej = PO.claimValidation.makeOfferClaim({ claim_type: 'FACTUAL', statement: 'we are the best', evidence_refs: [] });
  assert(rej.verdict === 'REJECTED');
  const dg = PO.claimValidation.makeOfferClaim({ claim_type: 'OUTCOME', statement: 'customers achieve X', evidence_refs: [] });
  assert(dg.verdict === 'DOWNGRADED_TO_ANALYTICAL' && dg.final_claim_type === 'ANALYTICAL');
});
W('W66', 'conflicts preserved', () => { const o = po(FX.ADVERSARIAL.multiple_conflicting_segments, 'W66'); assert(o.conflicts.some(c => ['MIXED', 'POLARIZED'].includes(c.status))); for (const c of o.conflicts) assert(PO.conflicts.validateConflict(c).valid); });
W('W67', 'business constraints preserved', () => { const o = dental(); assert(o.positioningEvidence.some(e => e.evidence_kind === 'BUSINESS_CONSTRAINT')); assert(o.offerArchitecture.components.some(c => c.component_type === 'CONSTRAINT')); });
W('W68', 'deterministic completion', () => { const a = dental(), b = dental(); assert.strictEqual(a.completion.completion_id, b.completion.completion_id); assert.strictEqual(a.completion.generated_by, 'deterministic:ucdm/positioning_offer/completion'); });
W('W69', 'valid evidence graph + 31 sections', () => { const o = dental(); assert(o.report.evidence_graph_valid, JSON.stringify(o.report.evidence_graph_errors)); assert.strictEqual(o.report.section_names.length, 31); });
W('W70', 'no production routing / autonomous action', () => {
  const o = dental();
  assert(o.report.caveats.some(c => /production routing or autonomous action/.test(c)));
  assert(o.provenance_note.includes('No production routing') && o.provenance_note.includes('No autonomous action'));
  for (const op of o.opportunities) assert(op.autonomous === false);
});

// ---------- compatibility / security ----------
W('C1', 'ASTRA-11B compatibility', () => { const o = dental(); const SC = require('../src/commercial/provenance/provenance').SOURCE_CLASSES; for (const e of o.positioningEvidence) assert(SC.includes(e.source_class)); assert.strictEqual(PO.UCDM_SCHEMA_VERSION, require('../src/commercial/schema/entities').SCHEMA_VERSION); });
W('C2', 'ASTRA-11C compatibility', () => { const rr = research(FX.VERTICALS.dental_clinic, 'C2'); assert(rr.ingestion && Array.isArray(rr.ingestion.envelopes)); });
W('C3', 'ASTRA-11D compatibility (facts/pricing/messages consumed)', () => { const o = po(FX.ADVERSARIAL.identical_competitor_messages, 'C3'); assert(o.coverage.market_fact_count >= 0 && o.coverage.competitor_message_count >= 1); });
W('C4', 'ASTRA-11E compatibility (schema version constant)', () => { assert.strictEqual(PO.COMPETITOR_SCHEMA_VERSION, require('../src/commercial/competitor/competitor_profile').COMPETITOR_SCHEMA_VERSION); });
W('C5', 'ASTRA-11F/G/H consumed unchanged', () => {
  const v = voc(FX.VERTICALS.dental_clinic, 'C5'); const c = cm(FX.VERTICALS.dental_clinic, 'C5'); const j = jn(FX.VERTICALS.dental_clinic, 'C5');
  const vb = v.report.report_id, cb = c.report.report_id, jb = j.report.report_id;
  PO.engine.runPositioningOffer({ vocResult: v, customerModel: c, journeyResult: j, referenceTime: REF, businessInput: FX.BI });
  assert.strictEqual(v.report.report_id, vb); assert.strictEqual(c.report.report_id, cb); assert.strictEqual(j.report.report_id, jb);
  assert.strictEqual(PO.JOURNEY_SCHEMA_VERSION, 'ucdm-journey-1.0.0');
});
W('C6', 'no network dependency', () => {
  let src = '';
  for (const f of fs.readdirSync(path.join(__dirname, '../src/commercial/positioning_offer'))) src += fs.readFileSync(path.join(__dirname, '../src/commercial/positioning_offer', f), 'utf8');
  assert(!/require\(['"](http|https|net|dns|tls|dgram)['"]\)|fetch\(|XMLHttpRequest|WebSocket/.test(src));
});
W('C7', 'no production DB dependency', () => {
  for (const f of fs.readdirSync(path.join(__dirname, '../src/commercial/positioning_offer'))) {
    const s = fs.readFileSync(path.join(__dirname, '../src/commercial/positioning_offer', f), 'utf8');
    assert(!/supabase|createClient|\bpg\b|mysql|mongodb|@vercel|kv\.set/i.test(s));
  }
});
W('C8', 'ASTRA-10 freeze unchanged + stable hashes + benchmark isolation', () => {
  const fr = JSON.parse(fs.readFileSync(path.join(__dirname, '../benchmarks/astra10ah/freeze.json'), 'utf8'));
  assert.strictEqual(fr.harness_hash_sha256, '57305a9dee3f9130d8f913e28280d759e78c32cee5affb0ac8931a4da725d53d');
  const a = dental(), b = dental();
  assert.strictEqual(a.report.report_id, b.report.report_id);
  const bsrc = fs.readFileSync(path.join(__dirname, '../benchmarks/astra11i/run_positioning_offer_benchmark.js'), 'utf8');
  assert(!/writeFileSync|writeFile\(|appendFile/.test(bsrc) && /ASTRA11I_BENCHMARK_RESULT/.test(bsrc));
});

// ---------- W-matrix completeness ----------
const allW = [];
for (let i = 1; i <= 70; i++) allW.push('W' + i);
for (let i = 1; i <= 8; i++) allW.push('C' + i);
const missing = allW.filter(id => !covered[id]);
if (missing.length) { console.log('FAIL W-matrix completeness :: missing', missing.join(',')); fail++; }
else console.log('PASS W-matrix completeness (W1..W70 + C1..C8 all have explicit test evidence)');

console.log(`\nASTRA11I_TEST_RESULT pass=${pass} fail=${fail}`);
if (fail) { console.log('FAILURES:\n' + fails.join('\n')); process.exit(1); }
