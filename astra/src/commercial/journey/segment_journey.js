'use strict';
// [ASTRA-11H §U] Segment-specific journeys. A global journey must NOT erase differences
// between segments. Reuses ASTRA-11G segments + memberships. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

// buildSegmentJourneys({ customerModel, journeyObservations, transitions, frictions, triggers, proofRequirements })
function buildSegmentJourneys(x) {
  const { customerModel = null, journeyObservations = [], transitions = [], frictions = [], triggers = [], proofRequirements = [] } = x;
  const segments = (customerModel && customerModel.segments) || [];
  const memberships = (customerModel && customerModel.memberships) || [];

  const speakersBySeg = {};
  for (const m of memberships) if (m.status === 'CONFIRMED' && m.speaker_pseudonym) (speakersBySeg[m.segment_id] = speakersBySeg[m.segment_id] || new Set()).add(m.speaker_pseudonym);

  const segment_journeys = segments.map(seg => {
    const spk = speakersBySeg[seg.segment_id] || new Set();
    const sel = (arr, keyFn) => arr.filter(x2 => {
      const s = keyFn(x2);
      return (s && spk.has(s)) || (x2.segment_refs && x2.segment_refs.includes(seg.segment_id));
    });
    const obs = sel(journeyObservations, o => o.subject_ref);
    const tr = transitions.filter(t => spk.has(t.subject_ref));
    const fr = frictions.filter(f => spk.has(f.speaker_pseudonym));
    const tg = triggers.filter(t => spk.has(t.speaker_pseudonym));
    const pr = proofRequirements.filter(p => obs.some(o => o.evidence_refs.some(er => p.evidence_refs.includes(er))));
    const body = {
      schema_version: 'ucdm-journey-1.0.0', kind: 'SegmentJourney',
      segment_id: seg.segment_id, label: seg.label, primary_concept: seg.primary_concept,
      stages: [...new Set(obs.map(o => o.stage).filter(s => s !== 'UNKNOWN'))].sort(),
      transitions: tr.map(t => `${t.from_state}->${t.to_state}`).sort(),
      frictions: [...new Set(fr.map(f => f.category))].sort(),
      triggers: [...new Set(tg.map(t => t.category))].sort(),
      proof_requirements: [...new Set(pr.map(p => p.proof_type))].sort(),
      evidence_refs: [...new Set(obs.flatMap(o => o.evidence_refs))].sort(),
      subject_count: spk.size,
    };
    body.segment_journey_id = 'jsj_' + sha256Hex(canonicalize({ ...body, segment_journey_id: undefined }));
    return deepFreeze(body);
  });

  // difference report — the global journey is NOT allowed to hide these
  const withData = segment_journeys.filter(s => s.frictions.length || s.proof_requirements.length || s.triggers.length);
  const differences = [];
  for (let i = 0; i < withData.length; i++) for (let j = i + 1; j < withData.length; j++) {
    const a = withData[i], b = withData[j];
    const fricDiff = symDiff(a.frictions, b.frictions);
    const proofDiff = symDiff(a.proof_requirements, b.proof_requirements);
    const trigDiff = symDiff(a.triggers, b.triggers);
    if (fricDiff.length || proofDiff.length || trigDiff.length) {
      differences.push({ segment_a: a.segment_id, segment_b: b.segment_id, friction_difference: fricDiff, proof_difference: proofDiff, trigger_difference: trigDiff });
    }
  }

  return deepFreeze({
    schema_version: 'ucdm-journey-1.0.0', kind: 'SegmentJourneys',
    segment_journeys, differences,
    segments_differ: differences.length > 0,
    note: 'segment journey differences are preserved; the global journey map does not overwrite them',
    generated_by: 'deterministic:ucdm/journey/segment',
  });
}

function symDiff(a, b) { const sa = new Set(a), sb = new Set(b); return [...new Set([...a.filter(x => !sb.has(x)), ...b.filter(x => !sa.has(x))])].sort(); }

module.exports = { buildSegmentJourneys };
