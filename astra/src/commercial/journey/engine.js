'use strict';
// [ASTRA-11H] Customer Journey + JTBD Engine — deterministic pipeline orchestrator.
//   ASTRA-11F VoC result (+ ASTRA-11G customer model + ASTRA-11D research + business input)
//   -> JOURNEY OBSERVATIONS -> EVENTS / STATES / TRANSITIONS -> FRICTION / TRIGGERS /
//      QUESTIONS / PROOF -> JTBD -> JOURNEY REPORT.
// Fully deterministic. NO LLM, NO web, NO I/O, NO clock (referenceTime is caller-supplied).
// No ASTRA-11H output may feed production routing or autonomous action.
const JO = require('./journey_observation');
const EV = require('./journey_event');
const TR = require('./transition');
const TG = require('./trigger');
const FR = require('./friction');
const QN = require('./question');
const PR = require('./proof_requirement');
const AL = require('./alternative');
const TP = require('./touchpoint');
const MX = require('./journey_metrics');
const BN = require('./bottleneck');
const JT = require('./jtbd');
const JS = require('./job_statement');
const FP = require('./forces');
const OUT = require('./job_outcome');
const BCJ = require('./buying_committee_journey');
const SJ = require('./segment_journey');
const PP = require('./post_purchase');
const RC = require('./retention_churn');
const CF = require('./conflicts');
const COV = require('./coverage');
const CMP = require('./completion');
const REP = require('./report');
const { splitByTemporal } = require('./temporal');

function runCustomerJourney(opts) {
  const vocResult = opts.vocResult;
  if (!vocResult || !Array.isArray(vocResult.observations)) throw new Error('[ASTRA-11H] runCustomerJourney: an ASTRA-11F VoC result is required');
  const referenceTime = opts.referenceTime;
  if (!referenceTime) throw new Error('[ASTRA-11H] referenceTime is required (no implicit clock)');
  const customerModel = opts.customerModel || null;
  const researchResult = opts.researchResult || null;
  const businessInput = opts.businessInput || {};
  const mode = (customerModel && customerModel.mode) || (businessInput.mode === 'B2B' ? 'B2B' : 'B2C');
  const request = (researchResult && researchResult.request) || (vocResult.report && { request_id: vocResult.report.request_ref }) || {};

  const evidenceRefSet = new Set(vocResult.observations.flatMap(o => o.evidence_refs));

  // ---- JOURNEY OBSERVATIONS: states (analytical) + events (grounded) ----
  const stateObs = JO.deriveStateObservations({ vocResult, customerModel, referenceTime });
  const events = [];
  const eventObs = [];
  for (const u of (vocResult.utterances || [])) {
    for (const { event, observationSpec } of EV.extractEvents(u, referenceTime)) {
      const v = EV.validateEvent(event); if (!v.valid) throw new Error(`[ASTRA-11H] invalid JourneyEvent: ${v.errors.join(' | ')}`);
      events.push(event);
      eventObs.push(JO.makeJourneyObservation({
        ...observationSpec,
        segment_refs: [], persona_refs: [],
      }));
    }
  }
  const journeyObservations = [...stateObs, ...eventObs];
  for (const o of journeyObservations) { const v = JO.validateJourneyObservation(o, evidenceRefSet); if (!v.valid) throw new Error(`[ASTRA-11H] invalid JourneyObservation: ${v.errors.join(' | ')}`); }
  const temporalSplit = splitByTemporal(journeyObservations);

  // ---- TRIGGERS / FRICTIONS / QUESTIONS / PROOF / ALTERNATIVES ----
  const triggers = TG.buildTriggers({ vocResult }); for (const t of triggers) { const v = TG.validateTrigger(t); if (!v.valid) throw new Error(`[ASTRA-11H] invalid JourneyTrigger: ${v.errors.join(' | ')}`); }
  const frictions = FR.buildFrictions({ vocResult }); for (const f of frictions) { const v = FR.validateFriction(f); if (!v.valid) throw new Error(`[ASTRA-11H] invalid JourneyFriction: ${v.errors.join(' | ')}`); }
  const questions = QN.buildQuestions({ vocResult }); for (const q of questions) { const v = QN.validateQuestion(q); if (!v.valid) throw new Error(`[ASTRA-11H] invalid JourneyQuestion: ${v.errors.join(' | ')}`); }
  const proofRequirements = PR.buildProofRequirements({ vocResult }); for (const p of proofRequirements) { const v = PR.validateProofRequirement(p); if (!v.valid) throw new Error(`[ASTRA-11H] invalid ProofRequirement: ${v.errors.join(' | ')}`); }
  const alternatives = AL.buildAlternatives({ vocResult }); for (const a of alternatives) { const v = AL.validateAlternative(a); if (!v.valid) throw new Error(`[ASTRA-11H] invalid JourneyAlternative: ${v.errors.join(' | ')}`); }

  // ---- TRANSITIONS (per-customer, evidence-anchored) + stalls ----
  const transitions = TR.buildTransitions(journeyObservations, { triggers, frictions });
  for (const t of transitions) { const v = TR.validateTransition(t); if (!v.valid) throw new Error(`[ASTRA-11H] invalid JourneyTransition: ${v.errors.join(' | ')}`); }
  const stalls = TR.detectStalls(journeyObservations, transitions);

  // ---- TOUCHPOINTS / METRICS / BOTTLENECKS ----
  const touchpoints = TP.buildTouchpoints({ journeyObservations, events });
  for (const t of touchpoints) { const v = TP.validateTouchpoint(t); if (!v.valid) throw new Error(`[ASTRA-11H] invalid JourneyTouchpoint: ${v.errors.join(' | ')}`); }
  const metrics = MX.computeJourneyMetrics({ journeyObservations, transitions, events, stalls, referenceTime });
  { const v = MX.validateMetrics(metrics); if (!v.valid) throw new Error(`[ASTRA-11H] invalid JourneyMetrics: ${v.errors.join(' | ')}`); }
  const bottlenecks = BN.buildBottleneckCandidates({ frictions, stalls, events, transitions, metrics, vocResult });
  for (const b of bottlenecks) { const v = BN.validateBottleneck(b); if (!v.valid) throw new Error(`[ASTRA-11H] invalid JourneyBottleneckCandidate: ${v.errors.join(' | ')}`); }

  // ---- PRE / POST PURCHASE + segment / committee journeys ----
  const prePost = PP.buildPrePostJourneys({ journeyObservations, events, transitions });
  const segmentJourneys = SJ.buildSegmentJourneys({ customerModel, journeyObservations, transitions, frictions, triggers, proofRequirements });
  const committeeJourneys = BCJ.buildBuyingCommitteeJourneys({ mode, buyingCommittee: customerModel && customerModel.buyingCommittee, journeyObservations, frictions, proofRequirements, triggers, businessInput });
  for (const r of committeeJourneys.role_journeys || []) { const v = BCJ.validateRoleJourney(r); if (!v.valid) throw new Error(`[ASTRA-11H] invalid RoleJourney: ${v.errors.join(' | ')}`); }

  // ---- JTBD: per segment/persona, multiple job kinds ----
  const segments = (customerModel && customerModel.segments) || [];
  const personaBySeg = {};
  for (const p of ((customerModel && customerModel.personas) || [])) for (const s of p.segment_refs) personaBySeg[s] = p;
  const jobs = [], jobStatements = [], jobOutcomes = [];
  const jobKinds = mode === 'B2B'
    ? ['BUYING_JOB', 'IMPLEMENTATION_JOB', 'USAGE_JOB', 'RETENTION_JOB', 'EXPANSION_JOB']
    : ['BUYING_JOB', 'USAGE_JOB', 'RETENTION_JOB', 'EXPANSION_JOB'];
  const targetSegments = segments.length ? segments : [null];
  for (const seg of targetSegments) {
    const persona = seg ? personaBySeg[seg.segment_id] : ((customerModel && customerModel.personas) || [])[0];
    const segSpeakers = new Set(((customerModel && customerModel.memberships) || []).filter(m => seg && m.segment_id === seg.segment_id && m.status === 'CONFIRMED' && m.speaker_pseudonym).map(m => m.speaker_pseudonym));
    const segVocObs = seg && segSpeakers.size
      ? (vocResult.observations || []).filter(o => o.speaker_pseudonym && segSpeakers.has(o.speaker_pseudonym))
      : (vocResult.observations || []);
    for (const kind of jobKinds) {
      const job = JT.buildJob({ segment: seg, persona, observations: segVocObs, journeyTriggers: triggers, journeyAlternatives: alternatives, kind });
      if (job.evidence_refs.length === 0) continue; // a job with no supporting evidence is not asserted
      const v = JT.validateJob(job); if (!v.valid) throw new Error(`[ASTRA-11H] invalid JobToBeDone: ${v.errors.join(' | ')}`);
      const stmt = JS.renderJobStatement(job);
      const sv = JS.validateJobStatement(stmt, job); if (!sv.valid) throw new Error(`[ASTRA-11H] invalid JobStatement: ${sv.errors.join(' | ')}`);
      jobs.push(job); jobStatements.push(stmt);
    }
    for (const o of OUT.buildJobOutcomes({ segment: seg, observations: segVocObs })) { const v = OUT.validateJobOutcome(o); if (!v.valid) throw new Error(`[ASTRA-11H] invalid JobOutcome: ${v.errors.join(' | ')}`); jobOutcomes.push(o); }
  }

  // ---- FORCES OF PROGRESS ----
  const forces = FP.buildForces({ observations: vocResult.observations || [], journeyAlternatives: alternatives, triggers });
  { const v = FP.validateForces(forces); if (!v.valid) throw new Error(`[ASTRA-11H] invalid ForcesOfProgress: ${v.errors.join(' | ')}`); }

  // ---- RETENTION / CHURN + CONFLICTS ----
  const retentionChurn = RC.buildRetentionChurnSignals({ vocResult, events, frictions });
  for (const s of retentionChurn.signals) { const v = RC.validateSignal(s); if (!v.valid) throw new Error(`[ASTRA-11H] invalid RetentionChurnSignal: ${v.errors.join(' | ')}`); }
  const conflicts = CF.detectJourneyConflicts({ journeyObservations, transitions, events, customerModel });
  for (const c of conflicts) { const v = CF.validateConflict(c); if (!v.valid) throw new Error(`[ASTRA-11H] invalid JourneyConflict: ${v.errors.join(' | ')}`); }

  // ---- COVERAGE / COMPLETION ----
  const coverage = COV.computeJourneyCoverage({ vocResult, journeyObservations, events, transitions, triggers, frictions, proofRequirements, alternatives, jobs, prePost, temporalSplit });
  const completion = CMP.assessCompletion({ coverage, triggers, transitions, proofRequirements, alternatives, jobs, jobOutcomes, conflicts, temporalSplit, vocResult });

  // ---- REPORT ----
  const report = REP.buildReport({
    request, referenceTime, mode, journeyObservations, events, transitions, stalls, triggers, frictions,
    questions, proofRequirements, alternatives, touchpoints, metrics, segmentJourneys, committeeJourneys,
    prePost, bottlenecks, jobs, jobStatements, forces, jobOutcomes, retentionChurn, conflicts,
    coverage, completion, temporalSplit,
  });

  return {
    report, journeyObservations, events, transitions, stalls, triggers, frictions, questions,
    proofRequirements, alternatives, touchpoints, metrics, bottlenecks,
    prePost, segmentJourneys, committeeJourneys,
    jobs, jobStatements, forces, jobOutcomes, retentionChurn, conflicts,
    coverage, completion, temporalSplit, mode,
    provenance_note: 'ASTRA-11H deterministic pipeline. Journeys are reconstructed from evidence; missing evidence is UNKNOWN; stages are never invented. No LLM. No production routing. No autonomous action.',
  };
}

module.exports = { runCustomerJourney };
