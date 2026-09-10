'use strict';
// [ASTRA-11D remediation §7] Market sophistication — ANALYTICAL CONTRACT ONLY.
// evidence_refs mandatory, schema-constrained, confidence required, UNKNOWN permitted.
// Never force a stage when evidence is insufficient. No runtime LLM required — the default
// classification is UNKNOWN; a conservative deterministic rule may raise it only with strong
// evidence. No LLM, no web, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const { assess } = require('../validation/confidence');

const STAGES = Object.freeze(['STAGE_1', 'STAGE_2', 'STAGE_3', 'STAGE_4', 'STAGE_5', 'UNKNOWN']);
const PRODUCER = 'deterministic:ucdm/research/sophistication';

// makeSophisticationAssessment({ evidence_refs (required, non-empty), stage, rationale, confidence, signals })
function makeSophisticationAssessment(input) {
  if (!Array.isArray(input.evidence_refs) || input.evidence_refs.length === 0) {
    throw new Error('[ASTRA-11D] SophisticationAssessment requires non-empty evidence_refs');
  }
  const stage = STAGES.includes(input.stage) ? input.stage : 'UNKNOWN';
  const confidence = input.confidence;
  if (!confidence || confidence.produced_by !== 'deterministic:ucdm/confidence') {
    throw new Error('[ASTRA-11D] SophisticationAssessment requires a deterministic ConfidenceAssessment');
  }
  const body = {
    schema_version: 'ucdm-research-1.0.0',
    stage,
    rationale: input.rationale != null ? String(input.rationale) : (stage === 'UNKNOWN' ? 'insufficient evidence to place a sophistication stage' : null),
    signals: input.signals || {},
    evidence_refs: [...input.evidence_refs].sort(),
    confidence,
    classifier: input.classifier || 'deterministic-conservative',
    produced_by: PRODUCER,
  };
  body.assessment_id = 'msoph_' + sha256Hex(canonicalize({ ...body, assessment_id: undefined, confidence: confidence.content_hash }));
  return deepFreeze(body);
}

// assessSophistication({ messageFrequencies, competitorCount, evidenceRefs, referenceTime })
// Conservative deterministic heuristic: only raises above UNKNOWN when there is broad,
// multi-competitor evidence of mechanism + proof messaging (a classic later-stage marker).
// Otherwise UNKNOWN. Never invents a stage from thin evidence.
function assessSophistication({ messageFrequencies, competitorCount = 0, evidenceRefs = [], referenceTime = null } = {}) {
  const refs = evidenceRefs.length ? evidenceRefs : ['NO_EVIDENCE'];
  const freqs = (messageFrequencies && messageFrequencies.frequencies) || [];
  const frac = (field) => { const f = freqs.find(x => x.message_field === field); return f ? f.fraction : 0; };
  const mechanism = frac('mechanism'), proof = frac('proof'), promise = frac('promise');

  const signals = { competitor_count: competitorCount, mechanism_fraction: mechanism, proof_fraction: proof, promise_fraction: promise };
  const conf = assess({
    evidence_count: evidenceRefs.length, distinct_sources: Math.min(competitorCount, evidenceRefs.length || 1),
    newest_evidence_age_days: 60, coverage: 0.6, agree_count: 1, conflict_count: 0, data_quality: 0.5,
  });

  let stage = 'UNKNOWN', rationale = 'insufficient evidence to place a sophistication stage';
  if (evidenceRefs.length === 0 || competitorCount < 4) {
    // stay UNKNOWN — never force a stage
  } else if (mechanism >= 0.6 && proof >= 0.6) {
    stage = 'STAGE_4';
    rationale = `mechanism messaging in ${(mechanism * 100).toFixed(0)}% and proof in ${(proof * 100).toFixed(0)}% of ${competitorCount} observed competitors — market is educated, competing on mechanism/proof`;
  } else if (promise >= 0.6 && mechanism < 0.3) {
    stage = 'STAGE_2';
    rationale = `broad promise/benefit messaging with little mechanism differentiation across ${competitorCount} competitors`;
  }
  return makeSophisticationAssessment({ evidence_refs: refs, stage, rationale, confidence: conf, signals, classifier: 'deterministic-conservative' });
}

module.exports = { STAGES, makeSophisticationAssessment, assessSophistication };
