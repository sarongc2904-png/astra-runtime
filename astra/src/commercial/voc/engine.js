'use strict';
// [ASTRA-11F] Voice of Customer Engine — deterministic pipeline orchestrator.
//   ASTRA-11D research result -> customer QUOTE observations -> speaker validation ->
//   utterances -> span grounding -> observations -> questions/alternatives/triggers/criteria
//   -> clusters -> frequency/coverage -> contradictions -> patterns -> insights ->
//   buying-language library -> completion -> report.
// Fully deterministic. NO LLM, NO web, NO I/O, NO clock (referenceTime is caller-supplied).
// No ASTRA-11F output may feed production routing or autonomous action.
const SPK = require('./speaker_validation');
const UTT = require('./utterance');
const SG = require('./span_grounding');
const OBS = require('./observation');
const Q = require('./questions');
const ATC = require('./alternatives_triggers_criteria');
const CL = require('./clustering');
const COV = require('./coverage');
const PI = require('./pattern_insight');
const BL = require('./buying_language');
const REP = require('./report');

// runVoiceOfCustomer({ researchResult, referenceTime, speakerHints, segmentRefs, journeyStageRefs,
//                      redact, patternThresholds })
//   speakerHints: { <source_ref>: { role, speaker_ref, source_type, segment_ref, journey_stage_ref } }
function runVoiceOfCustomer(opts) {
  const rr = opts.researchResult;
  if (!rr || !Array.isArray(rr.observations)) throw new Error('[ASTRA-11F] runVoiceOfCustomer: an ASTRA-11D research result is required');
  const referenceTime = opts.referenceTime;
  if (!referenceTime) throw new Error('[ASTRA-11F] referenceTime is required (no implicit clock)');
  const speakerHints = opts.speakerHints || {};
  const envelopesBySource = {};
  for (const e of (rr.ingestion && rr.ingestion.envelopes) || []) envelopesBySource[e.source_id] = e;

  // ---- CUSTOMER SOURCE -> VERBATIM EVIDENCE -> SPEAKER VALIDATION ----
  // QUOTE + CLAIM observations that carry verbatim text are candidates. Business/competitor
  // authored text (CLAIM from an advertiser, anything attributed to a Competitor) is
  // recorded as excluded and NEVER becomes canonical VOC.
  const candidateObs = rr.observations.filter(o => ['QUOTE', 'CLAIM'].includes(o.observation_type) && o.verbatim && o.verbatim.verbatim_text);
  const utterances = [];
  const excludedNonVoc = [];
  for (const o of candidateObs) {
    const hint = speakerHints[o.source_ref] || {};
    const speaker = SPK.classifySpeaker({ observation: o, envelope: envelopesBySource[o.source_ref], hint });
    if (!speaker.voc_eligible && speaker.speaker_role !== 'UNKNOWN_CUSTOMER_ROLE') {
      excludedNonVoc.push({ source_ref: o.source_ref, verbatim_preview: o.verbatim.verbatim_text.slice(0, 60), speaker_role: speaker.speaker_role, reason: speaker.reason });
      continue; // business / competitor / salesperson / third-party language is NEVER canonical VOC
    }
    if (o.observation_type === 'CLAIM') { // a CLAIM with an eligible speaker is still just a customer statement
      // fall through as an utterance
    }
    const u = UTT.makeUtterance({
      observation: o, envelope: envelopesBySource[o.source_ref], speaker,
      segment_ref: hint.segment_ref || null, journey_stage_ref: hint.journey_stage_ref || null,
      conversation_ref: hint.conversation_ref || null, context: hint.context || null,
      redact: opts.redact,
    });
    const vu = UTT.verifyUtterance(u);
    if (!vu.valid) throw new Error(`[ASTRA-11F] utterance integrity: ${vu.errors.join(' | ')}`);
    utterances.push(u);
  }
  const utterancesByHash = Object.fromEntries(utterances.map(u => [u.content_hash, u]));

  // ---- span grounding -> observations (canonical VOC only for eligible speakers) ----
  const observations = [];
  const questions = [], alternatives = [], triggers = [], criteria = [];
  for (const u of utterances) {
    const canonical = u.voc_eligible; // UNKNOWN_CUSTOMER_ROLE utterances are kept but not canonical
    const { spans } = SG.groundUtterance(u);
    for (const span of spans) {
      const ob = OBS.makeObservation({ utterance: u, span });
      const v = OBS.validateObservation(ob); if (!v.valid) throw new Error(`[ASTRA-11F] invalid VocObservation: ${v.errors.join(' | ')}`);
      // an UNKNOWN-speaker observation is downgraded to ANALYTICAL so it never counts as prevalence
      observations.push(canonical ? ob : Object.freeze({ ...ob, status: 'ANALYTICAL', speaker_note: 'UNKNOWN speaker — not canonical prevalence' }));
    }
    for (const q of Q.extractQuestions(u)) { const v = Q.validateQuestion(q); if (!v.valid) throw new Error(`[ASTRA-11F] invalid VocQuestion: ${v.errors.join(' | ')}`); questions.push(q); }
    for (const a of ATC.extractAlternatives(u)) { ATC.validateAlternative(a); alternatives.push(a); }
    for (const t of ATC.extractTriggers(u)) { ATC.validateTrigger(t); triggers.push(t); }
    for (const c of ATC.extractDecisionCriteria(u)) { ATC.validateCriterion(c); criteria.push(c); }
  }

  // ---- clusters / frequency ----
  const clusters = CL.buildClusters(observations, utterancesByHash, { referenceTime });
  const evidenceRefSet = new Set(observations.flatMap(o => o.evidence_refs).concat(questions.flatMap(q => q.evidence_refs)));
  for (const c of clusters) { const v = CL.validateCluster(c, evidenceRefSet); if (!v.valid) throw new Error(`[ASTRA-11F] invalid VocCluster: ${v.errors.join(' | ')}`); }

  // ---- coverage / segment / journey ----
  const coverage = COV.computeCoverage({ utterances, observations, envelopesBySource, request: rr.request || {}, referenceTime, ingestion: rr.ingestion });
  const segmentComparison = COV.compareSegments(clusters, observations);
  const journeyComparison = COV.compareJourneyStages(observations);
  const completion = COV.assessCompletion({ coverage, ingestion: rr.ingestion });

  // ---- contradictions / patterns / insights ----
  const perClusterContradictions = clusters.map(PI.classifyContradiction);
  const crossContradictions = PI.crossConceptContradictions(clusters);
  const contradictions = [...perClusterContradictions, ...crossContradictions];
  const contradictionByCluster = Object.fromEntries(perClusterContradictions.map(c => [c.cluster_ref, c]));
  const patterns = clusters.map(c => PI.buildPattern(c, contradictionByCluster[c.cluster_id], opts.patternThresholds || {}));
  for (const p of patterns) { const v = PI.validatePattern(p); if (!v.valid) throw new Error(`[ASTRA-11F] invalid VocPattern: ${v.errors.join(' | ')}`); }
  const insights = PI.buildInsights(patterns);
  for (const i of insights) { const v = PI.validateInsight(i); if (!v.valid) throw new Error(`[ASTRA-11F] invalid CustomerInsight: ${v.errors.join(' | ')}`); }

  // ---- buying language library ----
  const buyingLanguage = BL.buildBuyingLanguageLibrary({ observations, questions, triggers, criteria, utterancesByHash, referenceTime });
  const vbl = BL.validateLibrary(buyingLanguage, evidenceRefSet); if (!vbl.valid) throw new Error(`[ASTRA-11F] invalid BuyingLanguageLibrary: ${vbl.errors.join(' | ')}`);

  // ---- report ----
  const report = REP.buildReport({
    request: rr.request || {}, referenceTime, utterances, observations, clusters,
    questions, alternatives, triggers, criteria, contradictions, patterns, insights, buyingLanguage,
    coverage, completion, segmentComparison, journeyComparison, excludedNonVoc,
  });

  return {
    report, utterances, observations, clusters, questions, alternatives, triggers, criteria,
    contradictions, patterns, insights, buyingLanguage, coverage, completion,
    segmentComparison, journeyComparison, excludedNonVoc,
    provenance_note: 'ASTRA-11F deterministic pipeline. Only customer/prospect language is canonical VOC. No LLM. No production routing. No autonomous action.',
  };
}

module.exports = { runVoiceOfCustomer };
