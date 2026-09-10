'use strict';
// [ASTRA-11I §AC] PositioningOfferReport. Every material statement stays evidence-linked.
// No unsupported narrative facts. Reproducible from identical inputs. Missing sections stay
// UNKNOWN. No LLM, no web, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const SECTION_NAMES = Object.freeze([
  'executive_summary', 'scope', 'evidence_coverage', 'target_segments', 'jtbd_linkage',
  'positioning_territories', 'positioning_comparison', 'value_propositions', 'differentiation',
  'category_frame', 'competitive_overlap', 'offer_architecture', 'offer_components',
  'feature_benefit_outcome_map', 'mechanism', 'pricing', 'packaging', 'proof_strategy',
  'risk_reversal', 'objection_map', 'journey_stage_fit', 'segment_fit', 'competitive_comparison',
  'offer_gaps', 'opportunities', 'message_foundation', 'claims', 'conflicts', 'unknowns',
  'limitations', 'evidence_appendix',
]);

function sec(v) {
  const empty = v == null || (Array.isArray(v) && v.length === 0) || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0);
  return empty ? { status: 'UNKNOWN' } : v;
}

function buildReport(x) {
  const {
    request = {}, referenceTime = null, mode = 'B2C', positioningEvidence = [],
    territories = [], positioningComparison = null, valueProps = [], differentiation = [],
    frameBySegment = {}, distinctivenessBySegment = {}, offerArchitecture = null, benefitMap = [],
    mechanism = null, pricing = null, packaging = [], proofStrategy = null, riskReversals = [],
    objectionMap = [], offerJourneyFit = null, offerSegmentFits = [], competitorComparison = null,
    offerGaps = [], opportunities = [], messageFoundations = [], claims = [], conflicts = [],
    positioningFits = [], coverage = null, completion = null, customerModel = null, journeyResult = null,
  } = x;

  // evidence appendix — union of every evidence_ref cited by a positioning/offer artifact
  const seen = new Set(); const entries = [];
  const add = (er) => { if (er && !seen.has(er)) { seen.add(er); entries.push({ evidence_ref: er }); } };
  for (const e of positioningEvidence) for (const er of e.evidence_refs) add(er);
  for (const t of territories) for (const er of t.evidence_refs) add(er);
  for (const v of valueProps) for (const er of v.evidence_refs) add(er);
  entries.sort((a, b) => (a.evidence_ref < b.evidence_ref ? -1 : a.evidence_ref > b.evidence_ref ? 1 : 0));
  const appendixRefs = new Set(entries.map(e => e.evidence_ref));

  const graphErrors = [];
  for (const t of territories) for (const er of t.evidence_refs) if (!appendixRefs.has(er)) graphErrors.push(`territory ${t.territory_id} -> evidence ${er} not in appendix`);
  for (const v of valueProps) if (v.status !== 'INSUFFICIENT') for (const er of v.evidence_refs) if (!appendixRefs.has(er)) graphErrors.push(`value_proposition ${v.value_proposition_id} -> evidence ${er} not in appendix`);
  for (const c of claims) if (c.verdict === 'ACCEPTED') for (const er of c.evidence_refs) if (er && !appendixRefs.has(er)) graphErrors.push(`claim ${c.claim_id} -> evidence ${er} not in appendix`);

  const report = {
    schema_version: 'ucdm-positioning-offer-1.0.0',
    downstream_schema_versions: { ucdm: 'ucdm-1.0.0', research: 'ucdm-research-1.0.0', competitor: 'ucdm-competitor-1.0.0', voc: 'ucdm-voc-1.0.0', customer_model: 'ucdm-customer-model-1.0.0', journey: 'ucdm-journey-1.0.0' },
    request_ref: request.request_id || null,
    reference_time: referenceTime,
    mode,
    generated_by: 'deterministic:ucdm/positioning_offer',
    counts: {
      positioning_evidence: positioningEvidence.length, territories: territories.length,
      value_propositions: valueProps.length, differentiation: differentiation.length,
      offer_components: offerArchitecture ? offerArchitecture.components.length : 0,
      offer_gaps: offerGaps.length, opportunities: opportunities.length, claims: claims.length,
    },
    sections: {
      executive_summary: sec(completion ? { status: completion.status, reason_codes: completion.reason_codes, territories: territories.length, supported_value_props: valueProps.filter(v => v.status === 'SUPPORTED').length, mode } : null),
      scope: { objectives: request.objectives || [], language: request.language || null, mode },
      evidence_coverage: sec(coverage),
      target_segments: sec(((customerModel && customerModel.segments) || []).map(s => ({ segment_id: s.segment_id, label: s.label, status: s.status }))),
      jtbd_linkage: sec(((journeyResult && journeyResult.jobs) || []).map(j => ({ job_id: j.job_id, job_kind: j.job_kind, segment_refs: j.segment_refs }))),
      positioning_territories: sec(territories.map(t => ({ territory_id: t.territory_id, segment: t.target_segment_refs[0], problem: t.problem_context, desired_progress: t.desired_progress, frame_type: t.frame_type, differentiation_basis: t.differentiation_basis, status: t.status, is_market_fact: t.is_market_fact, unknowns: t.unknowns }))),
      positioning_comparison: sec(positioningComparison),
      value_propositions: sec(valueProps.map(v => ({ value_proposition_id: v.value_proposition_id, segment: v.segment_ref, status: v.status, rendered: v.rendered.text, unknown_slots: v.unknown_slots }))),
      differentiation: sec(differentiation.map(d => ({ type: d.differentiation_type, uniqueness_status: d.uniqueness_status, market_comparison: d.market_comparison.status, customer_relevance: d.customer_relevance }))),
      category_frame: sec(Object.values(frameBySegment).map(f => ({ frame_id: f.frame_id, frame_type: f.frame_type, label: f.label, basis: f.basis }))),
      competitive_overlap: sec(Object.values(distinctivenessBySegment).map(d => ({ overlap: d.overlap, whitespace: d.whitespace, contested: d.contested, market_wide_uniqueness_claim: d.market_wide_uniqueness_claim }))),
      offer_architecture: sec(offerArchitecture ? { component_types_present: offerArchitecture.component_types_present, has_core_offer: offerArchitecture.has_core_offer, unknowns: offerArchitecture.unknowns, manufactured_elements: offerArchitecture.manufactured_elements } : null),
      offer_components: sec(offerArchitecture ? offerArchitecture.components.map(c => ({ type: c.component_type, label: c.label, status: c.status })) : null),
      feature_benefit_outcome_map: sec(benefitMap.map(b => ({ feature: b.feature.statement, capability: b.capability.statement, functional: b.functional_benefit.status === 'UNKNOWN' ? 'UNKNOWN' : b.functional_benefit.concepts, emotional: b.emotional_benefit.status === 'UNKNOWN' ? 'UNKNOWN' : b.emotional_benefit.concepts, outcome: b.outcome.status === 'UNKNOWN' ? 'UNKNOWN' : b.outcome.concept }))),
      mechanism: sec(mechanism ? { status: mechanism.status, statement: mechanism.statement, invented_process: mechanism.invented_process } : null),
      pricing: sec(pricing ? { own_price: pricing.own_supplied_price, price_range: pricing.price_range, observed_competitor_count: pricing.observed_competitor_prices.length, willingness_to_pay: pricing.willingness_to_pay, optimal_price: pricing.optimal_price, fx_applied: pricing.fx_applied, price_conflict: pricing.price_conflict.status } : null),
      packaging: sec(packaging.map(p => ({ packaging_type: p.packaging_type, rationale: p.rationale, status: p.status, autonomous: p.autonomous }))),
      proof_strategy: sec(proofStrategy ? { available: proofStrategy.available.map(p => p.proof_type), required: proofStrategy.required.map(p => p.proof_type), gaps: proofStrategy.gaps.map(p => p.proof_type) } : null),
      risk_reversal: sec(riskReversals.map(r => ({ type: r.reversal_type, status: r.status, legal_financial_viability: r.legal_financial_viability }))),
      objection_map: sec(objectionMap.map(m => ({ objection: m.objection_concept, handling_status: m.handling_status, remaining_gap: m.remaining_gap }))),
      journey_stage_fit: sec(offerJourneyFit ? { stage_fit: offerJourneyFit.stage_fit.map(s => ({ stage: s.stage, status: s.status })), assumes_one_offer_fits_all_stages: offerJourneyFit.assumes_one_offer_fits_all_stages } : null),
      segment_fit: sec(offerSegmentFits.map(f => ({ segment_id: f.segment_id, fit_band: f.fit_band, total_score: f.total_score, reason_codes: f.reason_codes }))),
      competitive_comparison: sec(competitorComparison ? { dimensions: competitorComparison.dimensions.map(d => ({ dimension: d.dimension, status: d.status })), better_claims: competitorComparison.better_claims, competitor_sample_size: competitorComparison.competitor_sample_size } : null),
      offer_gaps: sec(offerGaps.map(g => ({ gap_type: g.gap_type, detail: g.detail, is_fact: g.is_fact }))),
      opportunities: sec(opportunities.map(o => ({ opportunity_id: o.opportunity_id, theme: o.theme, target_segment: o.target_segment_ref, autonomous: o.autonomous, expected_lift: o.expected_lift }))),
      message_foundation: sec(messageFoundations.map(m => ({ foundation_id: m.foundation_id, segment: m.segment_ref, is_ad_copy: m.is_ad_copy, unknowns: m.unknowns }))),
      claims: sec(claims.map(c => ({ claim_type: c.claim_type, final_claim_type: c.final_claim_type, verdict: c.verdict, statement: c.statement }))),
      conflicts: sec(conflicts.filter(c => c.status !== 'INSUFFICIENT').map(c => ({ dimension: c.dimension, status: c.status, likely_separate_positioning: c.likely_separate_positioning }))),
      unknowns: buildUnknowns({ territories, valueProps, offerArchitecture, pricing, proofStrategy, mechanism }),
      limitations: sec(completion ? completion.reason_codes : (coverage ? coverage.limitations : null)),
      evidence_appendix: { count: entries.length, entries },
    },
    positioning_fits: positioningFits.map(f => ({ fit_id: f.fit_id, fit_band: f.fit_band, total_score: f.total_score })),
    evidence_graph_valid: graphErrors.length === 0,
    evidence_graph_errors: graphErrors.sort(),
    completion_status: completion ? completion.status : null,
    caveats: [
      'Positioning territories and value propositions are analytical, never market facts.',
      'No market-wide uniqueness is claimed from an incomplete competitor sample.',
      'Per-segment positioning is preserved; no single universal positioning is forced.',
      'Bonuses / guarantees / scarcity / urgency exist only when the business supplies them — never manufactured.',
      'Emotional / social benefits require explicit customer evidence; no transformation fiction.',
      'Pricing is observed-competitor / business-supplied only — no willingness-to-pay, no optimal price, no FX.',
      'Proof assets are USER_PROVIDED only; ASTRA never fabricates a testimonial or result.',
      'Offer gaps and opportunities are analytical and non-autonomous; expected lift is NOT_ESTIMATED.',
      'Message foundations are canonical fields, not ad copy.',
      'No ASTRA-11I output may feed production routing or autonomous action.',
    ],
  };
  report.section_names = Object.keys(report.sections);
  report.report_id = 'por_' + sha256Hex(canonicalize({ ...report, report_id: undefined }));
  report.content_hash = report.report_id;
  return deepFreeze(report);
}

function buildUnknowns({ territories, valueProps, offerArchitecture, pricing, proofStrategy, mechanism }) {
  const u = new Set();
  if (territories.every(t => t.status === 'INSUFFICIENT' || t.status === 'HYPOTHESIS')) u.add('positioning_territories');
  if (valueProps.every(v => ['INSUFFICIENT', 'HYPOTHESIS'].includes(v.status))) u.add('value_propositions');
  if (!offerArchitecture || !offerArchitecture.has_core_offer) u.add('offer_architecture.core_offer');
  if (!pricing || (pricing.own_supplied_price.status === 'UNKNOWN' && pricing.observed_competitor_prices.length === 0)) u.add('pricing');
  if (!proofStrategy || proofStrategy.available.length === 0) u.add('proof_strategy');
  if (!mechanism || mechanism.status === 'UNKNOWN') u.add('mechanism');
  for (const t of territories) for (const k of t.unknowns) u.add(`territory:${k}`);
  return [...u].sort();
}

module.exports = { SECTION_NAMES, buildReport };
