'use strict';
// [ASTRA-11G] Customer Modeling Engine — deterministic pipeline orchestrator.
//   ASTRA-11F VoC result (+ optional ASTRA-11D market research result + business input)
//   -> CustomerAttributeEvidence -> SegmentDimensions -> SegmentCandidates ->
//   SegmentValidation/Membership/Metrics -> BuyerPersona / ICP -> FitAssessment ->
//   Prioritization -> CustomerModelReport.
// Fully deterministic. NO LLM, NO web, NO I/O, NO clock (referenceTime is caller-supplied).
// No ASTRA-11G output may feed production routing or autonomous action.
const AE = require('./attribute_evidence');
const SC = require('./segment_candidate');
const SM = require('./segment_membership');
const SX = require('./segment_metrics');
const BP = require('./buyer_persona');
const PE = require('./persona_evidence');
const AW = require('./awareness');
const UR = require('./urgency');
const BG = require('./budget_signal');
const ICP = require('./icp');
const ROLES = require('./buying_roles');
const FIT = require('./icp_fit');
const ATT = require('./attractiveness');
const PRI = require('./priority');
const DQ = require('./disqualification');
const CF = require('./conflicts');
const MS = require('./merge_split');
const COV = require('./coverage');
const CMP = require('./completion');
const REP = require('./report');

const SEVERITY_BY_STATUS = { SUPPORTED: 'HIGH', PARTIAL: 'MODERATE', HYPOTHESIS: 'LOW', INSUFFICIENT: 'LOW' };
const PROBLEM_FIT_BY_STATUS = { SUPPORTED: 0.8, PARTIAL: 0.55, HYPOTHESIS: 0.3, INSUFFICIENT: 0.15 };
const URGENCY_FIT = { HIGH: 0.9, MEDIUM: 0.6, MIXED: 0.5, LOW: 0.3, UNKNOWN: null };
const BUDGET_FIT = { BUDGET_FLEXIBLE: 0.9, BUDGET_DECLARED: 0.85, FINANCING_REQUIRED: 0.5, PRICE_SENSITIVE: 0.4, NO_BUDGET_SIGNAL: null, UNKNOWN: null };

function runCustomerModel(opts) {
  const vocResult = opts.vocResult;
  if (!vocResult || !Array.isArray(vocResult.observations)) throw new Error('[ASTRA-11G] runCustomerModel: an ASTRA-11F VoC result is required');
  const referenceTime = opts.referenceTime;
  if (!referenceTime) throw new Error('[ASTRA-11G] referenceTime is required (no implicit clock)');
  const researchResult = opts.researchResult || null;
  const businessInput = opts.businessInput || {};
  const mode = businessInput.mode === 'B2B' ? 'B2B' : 'B2C';
  const request = (researchResult && researchResult.request) || (vocResult.report && { request_id: vocResult.report.request_ref }) || {};

  const observedObs = vocResult.observations.filter(o => o.status === 'OBSERVED');
  const evidenceRefSet = new Set(vocResult.observations.flatMap(o => o.evidence_refs));

  // ---- CUSTOMER ATTRIBUTE EVIDENCE (§A §B) ----
  const attributeEvidence = AE.deriveAttributeEvidence({ vocResult, businessInput });
  for (const a of attributeEvidence) { const v = AE.validateAttributeEvidence(a, null); if (!v.valid) throw new Error(`[ASTRA-11G] invalid CustomerAttributeEvidence: ${v.errors.join(' | ')}`); }

  // ---- SEGMENT DIMENSIONS -> SEGMENT CANDIDATES -> VALIDATION (§C §D) ----
  const segments = SC.buildSegmentCandidates({ vocResult, businessInput });
  for (const s of segments) { const v = SC.validateSegmentCandidate(s); if (!v.valid) throw new Error(`[ASTRA-11G] invalid SegmentCandidate: ${v.errors.join(' | ')}`); }

  // ---- SEGMENT MEMBERSHIP + METRICS (§E §F) ----
  const memberships = SM.assignMembership(segments, observedObs);
  for (const m of memberships) { const v = SM.validateMembership(m); if (!v.valid) throw new Error(`[ASTRA-11G] invalid SegmentMembership: ${v.errors.join(' | ')}`); }
  const overlap = SM.overlapReport(memberships);
  const metrics = segments.map(s => SX.computeSegmentMetrics(s, { suppliedSizes: businessInput.segment_sizes || {} }));
  for (const m of metrics) { const v = SX.validateSegmentMetrics(m); if (!v.valid) throw new Error(`[ASTRA-11G] invalid SegmentMetrics: ${v.errors.join(' | ')}`); }

  // ---- sample-wide awareness / urgency / budget (§K §L §M) ----
  const awareness = AW.classifyAwareness(observedObs, { explicit: businessInput.awareness, alternatives: vocResult.alternatives || [], questions: vocResult.questions || [] });
  const urgency = UR.classifyUrgency({ triggers: vocResult.triggers || [], observations: observedObs, explicit: businessInput.urgency });
  const budget = BG.classifyBudgetSignal({ observations: observedObs, explicit: businessInput.budget_signal });
  for (const [name, obj, val] of [['awareness', awareness, AW.validateAwareness], ['urgency', urgency, UR.validateUrgency], ['budget', budget, BG.validateBudgetSignal]]) {
    const v = val(obj); if (!v.valid) throw new Error(`[ASTRA-11G] invalid ${name} assessment: ${v.errors.join(' | ')}`);
  }

  // ---- BUYER PERSONA per segment (+ narrative + evidence map) (§G §H §I §J) ----
  const memberSpeakersBySeg = {};
  for (const m of memberships) if (m.status === 'CONFIRMED' && m.speaker_pseudonym) (memberSpeakersBySeg[m.segment_id] = memberSpeakersBySeg[m.segment_id] || new Set()).add(m.speaker_pseudonym);
  const personas = [], narratives = [], evidenceMaps = [];
  for (const seg of segments) {
    const spk = memberSpeakersBySeg[seg.segment_id];
    const segObs = spk && spk.size
      ? observedObs.filter(o => o.speaker_pseudonym && spk.has(o.speaker_pseudonym))
      : observedObs.filter(o => o.normalized_concept === seg.primary_concept || SC.CONCEPT_LABEL[o.normalized_concept]); // HYPOTHESIS: sample-wide, concept-anchored
    const persona = BP.buildBuyerPersona({ segment: seg, observations: segObs.length ? segObs : observedObs, vocResult, businessInput });
    const vp = BP.validatePersona(persona, evidenceRefSet); if (!vp.valid) throw new Error(`[ASTRA-11G] invalid BuyerPersona: ${vp.errors.join(' | ')}`);
    const narrative = BP.renderNarrative(persona);
    const vn = BP.validateNarrative(narrative, persona); if (!vn.valid) throw new Error(`[ASTRA-11G] invalid PersonaNarrative: ${vn.errors.join(' | ')}`);
    const emap = PE.buildPersonaEvidenceMap(persona, { observations: vocResult.observations, utterances: vocResult.utterances || [], vocResult });
    const ve = PE.validatePersonaEvidenceMap(emap); if (!ve.valid) throw new Error(`[ASTRA-11G] invalid PersonaEvidenceMap: ${ve.errors.join(' | ')}`);
    personas.push(persona); narratives.push(narrative); evidenceMaps.push(emap);
  }

  // ---- ICP + BUYING ROLES (§N §O §P) ----
  const icp = ICP.buildICP({ mode, businessInput, attributeEvidence, researchResult });
  { const v = ICP.validateICP(icp); if (!v.valid) throw new Error(`[ASTRA-11G] invalid ICP: ${v.errors.join(' | ')}`); }
  const buyingCommittee = ROLES.buildBuyingCommittee({ mode, businessInput });
  for (const r of buyingCommittee.members) { const v = ROLES.validateBuyingRole(r); if (!v.valid) throw new Error(`[ASTRA-11G] invalid BuyingRole: ${v.errors.join(' | ')}`); }

  // ---- FIT / ATTRACTIVENESS / PRIORITY per segment (§Q §R §S) ----
  const ici = businessInput.icp_input || {};
  const icpFits = [], attractiveness = [], priorities = [];
  for (const seg of segments) {
    const fit = FIT.assessIcpFit({
      weights: businessInput.fit_weights || null,
      dimension_scores: {
        problem_fit: PROBLEM_FIT_BY_STATUS[seg.status],
        urgency_fit: URGENCY_FIT[urgency.level],
        budget_fit: BUDGET_FIT[budget.signal],
        solution_fit: num(ici.solution_fit),
        geographic_fit: ici.geography != null ? num(ici.geographic_fit != null ? ici.geographic_fit : 0.6) : num(ici.geographic_fit),
        implementation_fit: num(ici.implementation_fit),
        maturity_fit: num(ici.maturity_fit),
        strategic_fit: num(ici.strategic_fit),
      },
    });
    { const v = FIT.validateIcpFit(fit); if (!v.valid) throw new Error(`[ASTRA-11G] invalid IcpFitAssessment: ${v.errors.join(' | ')}`); }
    const att = ATT.assessAttractiveness({ segment: seg, urgency, budget, severity: SEVERITY_BY_STATUS[seg.status], researchResult, businessInput });
    { const v = ATT.validateAttractiveness(att); if (!v.valid) throw new Error(`[ASTRA-11G] invalid SegmentAttractiveness: ${v.errors.join(' | ')}`); }
    const pri = PRI.assessPriority({ segment: seg, fit, attractiveness: att, businessInput, weights: businessInput.priority_weights || null });
    { const v = PRI.validatePriority(pri); if (!v.valid) throw new Error(`[ASTRA-11G] invalid SegmentPriority: ${v.errors.join(' | ')}`); }
    icpFits.push(fit); attractiveness.push(att); priorities.push(pri);
  }

  // ---- DISQUALIFIERS / CONFLICTS / MERGE-SPLIT (§T §U §V) ----
  const disqualifiers = DQ.buildDisqualifiers({ businessInput });
  for (const d of disqualifiers) { const v = DQ.validateDisqualifier(d); if (!v.valid) throw new Error(`[ASTRA-11G] invalid Disqualifier: ${v.errors.join(' | ')}`); }
  const conflicts = CF.detectPersonaConflicts({ vocResult });
  for (const c of conflicts) { const v = CF.validatePersonaConflict(c); if (!v.valid) throw new Error(`[ASTRA-11G] invalid PersonaConflict: ${v.errors.join(' | ')}`); }
  const mergeSplits = [];
  for (let i = 0; i < personas.length; i++) for (let j = i + 1; j < personas.length; j++) {
    const relevant = conflicts.filter(c => ['MIXED', 'POLARIZED'].includes(c.status));
    const m = MS.assessMergeSplit(personas[i], personas[j], { conflicts: relevant });
    const v = MS.validateMergeSplit(m); if (!v.valid) throw new Error(`[ASTRA-11G] invalid MergeSplitAssessment: ${v.errors.join(' | ')}`);
    mergeSplits.push(m);
  }

  // ---- COVERAGE / COMPLETION (§W) ----
  const coverage = COV.computeCustomerModelCoverage({ vocResult, researchResult, attributeEvidence, segments });
  const completion = CMP.assessCompletion({ coverage, segments, awareness, budget, icp, conflicts, vocResult });

  // ---- REPORT (§X) ----
  const report = REP.buildReport({
    request, referenceTime, mode, attributeEvidence, segments, memberships, overlap, metrics,
    personas, narratives, evidenceMaps, buyingLanguage: vocResult.buyingLanguage || null,
    awareness, urgency, budget, icp, icpFits, buyingCommittee,
    attractiveness, priorities, disqualifiers, conflicts, mergeSplits, coverage, completion, vocResult,
  });

  return {
    report, attributeEvidence, segments, memberships, overlap, metrics,
    personas, narratives, evidenceMaps,
    awareness, urgency, budget, icp, buyingCommittee, icpFits, attractiveness, priorities,
    disqualifiers, conflicts, mergeSplits, coverage, completion,
    mode,
    provenance_note: 'ASTRA-11G deterministic pipeline. Attributes are evidence-backed or UNKNOWN. No demographic or psychographic invention. No LLM. No production routing. No autonomous action.',
  };
}

function num(v) { return v == null || Number.isNaN(Number(v)) ? null : Math.max(0, Math.min(1, Number(v))); }

module.exports = { runCustomerModel };
