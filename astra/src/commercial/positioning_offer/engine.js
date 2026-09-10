'use strict';
// [ASTRA-11I] Positioning + Offer Intelligence Engine — deterministic pipeline orchestrator.
//   MARKET (11D) + COMPETITION (11E) + VOC (11F) + ICP/PERSONA (11G) + JOURNEY/JTBD (11H)
//   -> POSITIONING EVIDENCE -> TERRITORIES -> VALUE PROP -> DIFFERENTIATION -> OFFER
//      ARCHITECTURE -> OFFER FIT -> POSITIONING+OFFER REPORT.
// Fully deterministic. NO LLM, NO web, NO I/O, NO clock (referenceTime caller-supplied).
// No ASTRA-11I output may feed production routing or autonomous action.
const PEV = require('./positioning_evidence');
const CF = require('./category_frame');
const DIF = require('./differentiation');
const DST = require('./distinctiveness');
const VP = require('./value_proposition');
const PT = require('./positioning_territory');
const PFIT = require('./positioning_fit');
const OC = require('./offer_component');
const BEN = require('./benefit_model');
const MECH = require('./mechanism');
const PROOF = require('./proof_strategy');
const RR = require('./risk_reversal');
const OBJ = require('./objection_map');
const OA = require('./offer_architecture');
const PRICE = require('./pricing');
const PKG = require('./packaging');
const US = require('./urgency_scarcity');
const OSF = require('./offer_segment_fit');
const OJF = require('./offer_journey_fit');
const CMP2 = require('./competitor_comparison');
const GAP = require('./offer_gap');
const OPP = require('./offer_opportunity');
const MSG = require('./message_foundation');
const CLAIM = require('./claim_validation');
const CONF = require('./conflicts');
const COMP = require('./completion');
const REP = require('./report');

const SEVERITY_BY_STATUS = { SUPPORTED: 0.85, PARTIAL: 0.6, HYPOTHESIS: 0.35, INSUFFICIENT: 0.15 };
const URGENCY_SCORE = { HIGH: 0.9, MEDIUM: 0.6, MIXED: 0.5, LOW: 0.3, UNKNOWN: null };
const BUDGET_SCORE = { BUDGET_FLEXIBLE: 0.9, BUDGET_DECLARED: 0.85, FINANCING_REQUIRED: 0.55, PRICE_SENSITIVE: 0.4, NO_BUDGET_SIGNAL: null, UNKNOWN: null };

function runPositioningOffer(opts) {
  const vocResult = opts.vocResult;
  if (!vocResult || !Array.isArray(vocResult.observations)) throw new Error('[ASTRA-11I] runPositioningOffer: an ASTRA-11F VoC result is required');
  const referenceTime = opts.referenceTime;
  if (!referenceTime) throw new Error('[ASTRA-11I] referenceTime is required (no implicit clock)');
  const customerModel = opts.customerModel || null;
  const journeyResult = opts.journeyResult || null;
  const researchResult = opts.researchResult || null;
  const competitorResult = opts.competitorResult || null;
  const businessInput = opts.businessInput || {};
  const mode = (customerModel && customerModel.mode) || (businessInput.mode === 'B2B' ? 'B2B' : 'B2C');
  const request = (researchResult && researchResult.request) || {};

  // ---- POSITIONING EVIDENCE (§A) ----
  const positioningEvidence = PEV.collectPositioningEvidence({ researchResult, competitorResult, vocResult, customerModel, journeyResult, businessInput });
  for (const e of positioningEvidence) { const v = PEV.validatePositioningEvidence(e); if (!v.valid) throw new Error(`[ASTRA-11I] invalid PositioningEvidence: ${v.errors.join(' | ')}`); }

  // ---- DIFFERENTIATION + DISTINCTIVENESS (§E §F) ----
  const differentiation = DIF.buildDifferentiationCandidates({ businessInput, researchResult, vocResult, journeyResult });
  for (const d of differentiation) { const v = DIF.validateDifferentiation(d); if (!v.valid) throw new Error(`[ASTRA-11I] invalid DifferentiationCandidate: ${v.errors.join(' | ')}`); }
  const diffTypes = [...new Set(differentiation.map(d => d.differentiation_type))];

  const segments = (customerModel && customerModel.segments) || [];
  const personaBySeg = {};
  for (const p of ((customerModel && customerModel.personas) || [])) for (const s of p.segment_refs) personaBySeg[s] = p;
  const jtbdBySeg = {};
  for (const j of ((journeyResult && journeyResult.jobs) || [])) if (j.segment_refs[0]) (jtbdBySeg[j.segment_refs[0]] = jtbdBySeg[j.segment_refs[0]] || []).push(j);

  const frameBySegment = {}, distinctivenessBySegment = {};
  for (const seg of segments) {
    frameBySegment[seg.segment_id] = CF.resolveFrame({ segment: seg, persona: personaBySeg[seg.segment_id], journeyAlternatives: (journeyResult && journeyResult.alternatives) || [], businessInput });
    const vf = CF.validateFrame(frameBySegment[seg.segment_id]); if (!vf.valid) throw new Error(`[ASTRA-11I] invalid CategoryFrame: ${vf.errors.join(' | ')}`);
    distinctivenessBySegment[seg.segment_id] = DST.assessDistinctiveness({ differentiationTypes: diffTypes, researchResult, competitorResult });
    const vd = DST.validateDistinctiveness(distinctivenessBySegment[seg.segment_id]); if (!vd.valid) throw new Error(`[ASTRA-11I] invalid PositioningDistinctiveness: ${vd.errors.join(' | ')}`);
  }

  // ---- OFFER-SIDE PRIMITIVES (segment-independent) ----
  const mechanism = MECH.buildMechanism({ businessInput, differentiation });
  { const v = MECH.validateMechanism(mechanism); if (!v.valid) throw new Error(`[ASTRA-11I] invalid OfferMechanism: ${v.errors.join(' | ')}`); }
  const pricing = PRICE.buildPricingIntelligence({ researchResult, businessInput });
  { const v = PRICE.validatePricing(pricing); if (!v.valid) throw new Error(`[ASTRA-11I] invalid PricingIntelligence: ${v.errors.join(' | ')}`); }
  const proofStrategy = PROOF.buildProofStrategy({ journeyResult, competitorResult, businessInput });
  { const v = PROOF.validateProofStrategy(proofStrategy); if (!v.valid) throw new Error(`[ASTRA-11I] invalid ProofStrategy: ${v.errors.join(' | ')}`); }
  const riskReversals = RR.buildRiskReversalCandidates({ vocResult, journeyResult });
  for (const r of riskReversals) { const v = RR.validateRiskReversal(r); if (!v.valid) throw new Error(`[ASTRA-11I] invalid RiskReversalCandidate: ${v.errors.join(' | ')}`); }
  const urgencyScarcity = US.classifyUrgencyScarcity({ businessInput, journeyResult });
  { const v = US.validateUrgencyScarcity(urgencyScarcity); if (!v.valid) throw new Error(`[ASTRA-11I] invalid UrgencyScarcity: ${v.errors.join(' | ')}`); }
  const offerArchitecture = OA.buildOfferArchitecture({ businessInput, mechanism, pricing, urgencyScarcity, proofStrategy });
  for (const c of offerArchitecture.components) { const v = OC.validateOfferComponent(c); if (!v.valid) throw new Error(`[ASTRA-11I] invalid OfferComponent: ${v.errors.join(' | ')}`); }
  { const v = OA.validateOfferArchitecture(offerArchitecture); if (!v.valid) throw new Error(`[ASTRA-11I] invalid OfferArchitecture: ${v.errors.join(' | ')}`); }
  const objectionMap = OBJ.buildObjectionMap({ vocResult, proofStrategy, offerComponents: offerArchitecture.components, riskReversals });
  for (const m of objectionMap) { const v = OBJ.validateObjectionMapping(m); if (!v.valid) throw new Error(`[ASTRA-11I] invalid ObjectionMapping: ${v.errors.join(' | ')}`); }
  const packaging = PKG.buildPackagingCandidates({ customerModel, vocResult, businessInput, mode });
  for (const p of packaging) { const v = PKG.validatePackaging(p); if (!v.valid) throw new Error(`[ASTRA-11I] invalid PackagingCandidate: ${v.errors.join(' | ')}`); }

  // ---- POSITIONING TERRITORIES (§B §Z) ----
  const preConflicts = [
    ...((customerModel && customerModel.conflicts) || []).map(c => ({ ...c, conflict_id: c.conflict_id || null, segment_refs: [] })),
    ...((journeyResult && journeyResult.conflicts) || []),
  ];
  const territories = PT.buildPositioningTerritories({ customerModel, journeyResult, differentiation, frameBySegment, distinctivenessBySegment, conflicts: preConflicts });
  for (const t of territories) { const v = PT.validateTerritory(t); if (!v.valid) throw new Error(`[ASTRA-11I] invalid PositioningTerritory: ${v.errors.join(' | ')}`); }
  const positioningComparison = PT.comparePositioning(territories);

  // ---- VALUE PROPOSITIONS + POSITIONING FIT (§D §G) ----
  const valueProps = [], positioningFits = [], benefitMap = [], offerSegmentFits = [], messageFoundations = [];
  for (const seg of segments) {
    const persona = personaBySeg[seg.segment_id];
    const jt = (jtbdBySeg[seg.segment_id] || [])[0] || null;
    const vp = VP.buildValueProposition({ segment: seg, persona, jtbd: jt, differentiation, proofStrategy, frame: frameBySegment[seg.segment_id], businessInput });
    { const v = VP.validateValueProposition(vp); if (!v.valid) throw new Error(`[ASTRA-11I] invalid ValueProposition: ${v.errors.join(' | ')}`); }
    valueProps.push(vp);

    const awarenessOk = customerModel && customerModel.awareness && customerModel.awareness.stage !== 'UNKNOWN';
    const objCompat = objectionMap.length ? objectionMap.filter(m => ['ADDRESSED', 'PARTIALLY_ADDRESSED'].includes(m.handling_status)).length / objectionMap.length : null;
    const pf = PFIT.assessPositioningFit({
      weights: businessInput.positioning_fit_weights || null,
      dimension_scores: {
        segment_relevance: seg.status === 'SUPPORTED' ? 0.9 : seg.status === 'PARTIAL' ? 0.6 : 0.3,
        problem_fit: persona && persona.primary_problem && persona.primary_problem.status !== 'UNKNOWN' ? 0.85 : null,
        jtbd_fit: jt && jt.functional_job.status !== 'UNKNOWN' ? 0.7 : null,
        desired_outcome_fit: persona && Array.isArray(persona.desired_outcomes) && persona.desired_outcomes.length ? 0.75 : null,
        objection_compatibility: objCompat,
        proof_availability: proofStrategy.available.length ? Math.min(1, proofStrategy.available.length / Math.max(1, proofStrategy.required.length || 1)) : (proofStrategy.required.length ? 0.1 : null),
        business_capability_fit: (businessInput.capabilities || []).length ? 0.8 : null,
        competitive_distinctiveness: (distinctivenessBySegment[seg.segment_id] || {}).competitor_sample_size ? Math.min(1, 0.4 + 0.15 * (distinctivenessBySegment[seg.segment_id].whitespace.length)) : null,
        evidence_coverage: Math.min(1, 1 - Math.exp(-seg.observed_sample.unique_source_count / 4)),
      },
    });
    { const v = PFIT.validatePositioningFit(pf); if (!v.valid) throw new Error(`[ASTRA-11I] invalid PositioningFitAssessment: ${v.errors.join(' | ')}`); }
    positioningFits.push(pf);

    const bm = BEN.buildBenefitMap({ businessInput, vocResult, jtbd: jt });
    for (const b of bm) { const v = BEN.validateBenefitChain(b); if (!v.valid) throw new Error(`[ASTRA-11I] invalid BenefitChain: ${v.errors.join(' | ')}`); }
    benefitMap.push(...bm);

    const compTypes = new Set(offerArchitecture.components.map(c => c.component_type));
    const osf = OSF.assessOfferSegmentFit({
      segment_id: seg.segment_id,
      weights: businessInput.offer_segment_fit_weights || null,
      dimension_scores: {
        problem_severity: SEVERITY_BY_STATUS[seg.status],
        desired_outcome: persona && Array.isArray(persona.desired_outcomes) && persona.desired_outcomes.length ? 0.75 : null,
        urgency: URGENCY_SCORE[(customerModel && customerModel.urgency && customerModel.urgency.level) || 'UNKNOWN'],
        budget_signal: BUDGET_SCORE[(customerModel && customerModel.budget && customerModel.budget.signal) || 'UNKNOWN'],
        solution_fit: (businessInput.capabilities || []).length ? 0.7 : null,
        implementation_fit: businessInput.icp_input && businessInput.icp_input.implementation_fit != null ? Number(businessInput.icp_input.implementation_fit) : null,
        proof_fit: proofStrategy.gaps.length === 0 && proofStrategy.available.length ? 0.85 : proofStrategy.available.length ? 0.5 : (proofStrategy.required.length ? 0.15 : null),
        friction_resolution: objCompat,
        jtbd_fit: jt && jt.functional_job.status !== 'UNKNOWN' ? 0.7 : null,
      },
    });
    { const v = OSF.validateOfferSegmentFit(osf); if (!v.valid) throw new Error(`[ASTRA-11I] invalid OfferSegmentFit: ${v.errors.join(' | ')}`); }
    offerSegmentFits.push(osf);
  }

  // ---- OFFER-JOURNEY FIT / COMPETITOR COMPARISON (§S §T) ----
  const offerJourneyFit = OJF.assessOfferJourneyFit({ journeyResult, proofStrategy, offerArchitecture, objectionMap });
  { const v = OJF.validateOfferJourneyFit(offerJourneyFit); if (!v.valid) throw new Error(`[ASTRA-11I] invalid OfferJourneyFit: ${v.errors.join(' | ')}`); }
  const competitorComparison = CMP2.buildCompetitorComparison({ differentiation, offerArchitecture, proofStrategy, pricing, researchResult, competitorResult });
  { const v = CMP2.validateCompetitorComparison(competitorComparison); if (!v.valid) throw new Error(`[ASTRA-11I] invalid CompetitorComparison: ${v.errors.join(' | ')}`); }

  // ---- GAPS / OPPORTUNITIES (§U §V) ----
  const offerGaps = GAP.buildOfferGaps({ proofStrategy, riskReversals, objectionMap, offerArchitecture, mechanism, pricing, offerSegmentFits, offerJourneyFit, competitorComparison });
  for (const g of offerGaps) { const v = GAP.validateOfferGap(g); if (!v.valid) throw new Error(`[ASTRA-11I] invalid OfferGap: ${v.errors.join(' | ')}`); }
  const opportunities = OPP.buildOfferOpportunities({ gaps: offerGaps, territories, offerSegmentFits, businessInput });
  for (const o of opportunities) { const v = OPP.validateOpportunity(o); if (!v.valid) throw new Error(`[ASTRA-11I] invalid OfferOpportunity: ${v.errors.join(' | ')}`); }

  // ---- MESSAGE FOUNDATIONS (§W) ----
  for (const t of territories) {
    const seg = t.target_segment_refs[0];
    const persona = personaBySeg[seg];
    const vp = valueProps.find(v => v.segment_ref === seg) || null;
    const mf = MSG.buildMessageFoundation({ territory: t, valueProposition: vp, persona, objectionMap, proofStrategy, vocResult, journeyResult });
    const v = MSG.validateMessageFoundation(mf); if (!v.valid) throw new Error(`[ASTRA-11I] invalid MessageFoundation: ${v.errors.join(' | ')}`);
    messageFoundations.push(mf);
  }

  // ---- CLAIMS (§X) ----
  const claims = CLAIM.deriveClaims({ territories, differentiation, proofStrategy, competitorComparison });
  for (const c of claims) { const v = CLAIM.validateClaim(c); if (!v.valid) throw new Error(`[ASTRA-11I] invalid OfferClaim: ${v.errors.join(' | ')}`); }

  // ---- CONFLICTS (§Y) ----
  const conflicts = CONF.detectPositioningOfferConflicts({ customerModel, journeyResult, territories, pricing, proofStrategy, competitorComparison });
  for (const c of conflicts) { const v = CONF.validateConflict(c); if (!v.valid) throw new Error(`[ASTRA-11I] invalid PositioningOfferConflict: ${v.errors.join(' | ')}`); }

  // ---- COVERAGE / COMPLETION ----
  const coverage = buildCoverage({ researchResult, vocResult, customerModel, journeyResult, positioningEvidence, territories, differentiation, proofStrategy, businessInput });
  const completion = COMP.assessCompletion({ researchResult, vocResult, customerModel, journeyResult, territories, valueProps, differentiation, proofStrategy, pricing, businessInput, objectionMap, offerSegmentFits, conflicts, competitorComparison });

  // ---- REPORT ----
  const report = REP.buildReport({
    request, referenceTime, mode, positioningEvidence, territories, positioningComparison, valueProps,
    differentiation, frameBySegment, distinctivenessBySegment, offerArchitecture, benefitMap, mechanism,
    pricing, packaging, proofStrategy, riskReversals, objectionMap, offerJourneyFit, offerSegmentFits,
    competitorComparison, offerGaps, opportunities, messageFoundations, claims, conflicts, positioningFits,
    coverage, completion, customerModel, journeyResult,
  });

  return {
    report, positioningEvidence, territories, positioningComparison, valueProps, differentiation,
    frameBySegment, distinctivenessBySegment, mechanism, pricing, proofStrategy, riskReversals,
    urgencyScarcity, offerArchitecture, objectionMap, packaging, positioningFits, benefitMap,
    offerSegmentFits, offerJourneyFit, competitorComparison, offerGaps, opportunities,
    messageFoundations, claims, conflicts, coverage, completion, mode,
    provenance_note: 'ASTRA-11I deterministic pipeline. Positioning/value/differentiation are analytical and evidence-linked; offer elements are supplied or analytical; no market fact, price, WTP, proof or expected lift is invented. No LLM. No production routing. No autonomous action.',
  };
}

function buildCoverage({ researchResult, vocResult, customerModel, journeyResult, positioningEvidence, territories, differentiation, proofStrategy, businessInput }) {
  const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
  const vc = vocResult.coverage || {};
  const body = {
    schema_version: 'ucdm-positioning-offer-1.0.0', kind: 'PositioningOfferCoverage',
    market_fact_count: researchResult ? ((researchResult.facts || []).length + (researchResult.computed_facts || []).length) : 0,
    voc_source_count: vc.source_count || 0,
    voc_unique_speaker_count: vc.unique_speaker_count || null,
    segment_count: ((customerModel && customerModel.segments) || []).length,
    supported_segment_count: ((customerModel && customerModel.segments) || []).filter(s => s.status === 'SUPPORTED').length,
    jtbd_count: ((journeyResult && journeyResult.jobs) || []).length,
    positioning_evidence_count: positioningEvidence.length,
    territory_count: territories.length,
    supported_territory_count: territories.filter(t => t.status === 'SUPPORTED').length,
    differentiation_count: differentiation.length,
    business_capability_count: (businessInput.capabilities || []).length,
    proof_available_count: proofStrategy ? proofStrategy.available.length : 0,
    proof_gap_count: proofStrategy ? proofStrategy.gaps.length : 0,
    competitor_message_count: researchResult ? ((researchResult.message_observations || []).length + (researchResult.offer_items || []).length) : 0,
    limitations: [],
  };
  if (body.market_fact_count < 3) body.limitations.push('thin market evidence');
  if (body.voc_source_count < 5) body.limitations.push('few VoC sources');
  if (body.business_capability_count === 0) body.limitations.push('no business capabilities supplied — differentiation and offer largely UNKNOWN');
  if (body.competitor_message_count === 0) body.limitations.push('no observed competitor messages/offers — distinctiveness and comparison UNKNOWN');
  if (body.proof_available_count === 0) body.limitations.push('no proof assets supplied');
  body.coverage_id = 'pocov_' + sha256Hex(canonicalize({ ...body, coverage_id: undefined }));
  return deepFreeze(body);
}

module.exports = { runPositioningOffer };
