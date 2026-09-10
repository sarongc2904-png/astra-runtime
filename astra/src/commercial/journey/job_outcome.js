'use strict';
// [ASTRA-11H §R] JobOutcome. Desired outcome + success criterion, with current performance /
// importance / satisfaction ONLY where actually evidenced. NO fabricated numerical ODI-style
// scores. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const UNKNOWN = { status: 'UNKNOWN' };

// buildJobOutcomes({ segment, observations }) -> [JobOutcome]
function buildJobOutcomes({ segment = null, observations = [] }) {
  const obs = observations.filter(o => o.status === 'OBSERVED');
  const byConcept = {};
  for (const o of obs) {
    if (!['RESULTS_DESIRED', 'SPEED_NEED', 'CONVENIENCE_VALUE', 'QUALITY_PRAISE', 'PAIN_EXPERIENCED', 'SLOW_SERVICE'].includes(o.normalized_concept)) continue;
    (byConcept[o.normalized_concept] = byConcept[o.normalized_concept] || []).push(o);
  }
  const out = [];
  for (const [concept, rows] of Object.entries(byConcept).sort()) {
    const positive = rows.filter(o => o.polarity === 'POSITIVE');
    const negative = rows.filter(o => o.polarity === 'NEGATIVE');
    const body = {
      schema_version: 'ucdm-journey-1.0.0', kind: 'JobOutcome',
      segment_ref: segment ? segment.segment_id : null,
      desired_outcome: concept,
      success_criterion: SUCCESS_CRITERION[concept] || UNKNOWN,
      current_performance: (positive.length || negative.length)
        ? { direction: positive.length > negative.length ? 'MEETING' : negative.length > positive.length ? 'NOT_MEETING' : 'MIXED', positive: positive.length, negative: negative.length, evidence_refs: [...new Set(rows.flatMap(o => o.evidence_refs))].sort(), basis: 'OBSERVED_SENTIMENT_ONLY' }
        : UNKNOWN,
      importance_signal: UNKNOWN,   // no numeric ODI score is fabricated
      satisfaction_signal: (positive.length + negative.length) >= 2
        ? { qualitative: positive.length > negative.length ? 'SATISFIED' : 'DISSATISFIED', evidence_refs: [...new Set(rows.flatMap(o => o.evidence_refs))].sort(), basis: 'QUALITATIVE_ONLY', numeric_score: null }
        : UNKNOWN,
      evidence_refs: [...new Set(rows.flatMap(o => o.evidence_refs))].sort(),
      generated_by: 'deterministic:ucdm/journey/job_outcome',
    };
    body.outcome_id = 'jout_' + sha256Hex(canonicalize({ ...body, outcome_id: undefined }));
    out.push(deepFreeze(body));
  }
  return out;
}

const SUCCESS_CRITERION = Object.freeze({
  RESULTS_DESIRED: { criterion: 'the result actually works', basis: 'ANALYTICAL' },
  SPEED_NEED: { criterion: 'it is done quickly', basis: 'ANALYTICAL' },
  CONVENIENCE_VALUE: { criterion: 'minimal effort / friction', basis: 'ANALYTICAL' },
  QUALITY_PRAISE: { criterion: 'quality meets expectation', basis: 'ANALYTICAL' },
  PAIN_EXPERIENCED: { criterion: 'the problem is resolved', basis: 'ANALYTICAL' },
  SLOW_SERVICE: { criterion: 'service is timely', basis: 'ANALYTICAL' },
});

function validateJobOutcome(o) {
  const errors = [];
  if (o.evidence_refs.length === 0) errors.push('a JobOutcome must be evidence-backed');
  if (o.importance_signal && o.importance_signal.status !== 'UNKNOWN' && o.importance_signal.numeric_score != null) errors.push('no fabricated numeric importance/ODI score');
  if (o.satisfaction_signal && o.satisfaction_signal.status !== 'UNKNOWN' && o.satisfaction_signal.numeric_score != null) errors.push('no fabricated numeric satisfaction score');
  return { valid: errors.length === 0, errors };
}

module.exports = { buildJobOutcomes, validateJobOutcome, SUCCESS_CRITERION };
