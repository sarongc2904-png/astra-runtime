'use strict';
// [ASTRA-11G §E] Segment membership. Explicit or deterministically rule-based only.
// CONFIRMED / LIKELY_ANALYTICAL / UNKNOWN. Overlap is supported — a customer is NOT forced
// into exactly one segment. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const MEMBERSHIP_STATUS = Object.freeze(['CONFIRMED', 'LIKELY_ANALYTICAL', 'UNKNOWN']);

// assignMembership(candidates, observations) -> [SegmentMembership]
//   A speaker with an OBSERVED observation whose (dimension, concept) matches a candidate's
//   primary concept is a CONFIRMED member of that candidate. The same speaker can be a
//   CONFIRMED member of several candidates (overlap). Unknown-speaker observations produce
//   an UNKNOWN membership tied to the source, never a forced assignment.
function assignMembership(candidates, observations) {
  const out = [];
  const obsByConcept = {};
  for (const o of observations) {
    if (o.status !== 'OBSERVED') continue;
    (obsByConcept[o.normalized_concept] = obsByConcept[o.normalized_concept] || []).push(o);
  }
  for (const cand of candidates) {
    const matching = obsByConcept[cand.primary_concept] || [];
    const bySpeaker = {};
    const unknownSources = new Set();
    for (const o of matching) {
      if (o.speaker_pseudonym) (bySpeaker[o.speaker_pseudonym] = bySpeaker[o.speaker_pseudonym] || []).push(o);
      else if (o.source_ref) unknownSources.add(o.source_ref);
    }
    for (const [spk, os] of Object.entries(bySpeaker).sort()) {
      out.push(mk({ segment_id: cand.segment_id, speaker_pseudonym: spk, source_ref: null, status: 'CONFIRMED', basis: 'rule: OBSERVED concept match for an identified speaker', evidence_refs: [...new Set(os.flatMap(o => o.evidence_refs))].sort() }));
    }
    for (const src of [...unknownSources].sort()) {
      out.push(mk({ segment_id: cand.segment_id, speaker_pseudonym: null, source_ref: src, status: 'UNKNOWN', basis: 'concept match but speaker not identifiable — not counted as a confirmed member', evidence_refs: [...new Set(matching.filter(o => o.source_ref === src).flatMap(o => o.evidence_refs))].sort() }));
    }
    // sample-scope analytical membership for HYPOTHESIS candidates with no identified speakers
    if (Object.keys(bySpeaker).length === 0 && matching.length > 0) {
      out.push(mk({ segment_id: cand.segment_id, speaker_pseudonym: null, source_ref: null, status: 'LIKELY_ANALYTICAL', basis: 'sample-wide concept present but no identified speakers to confirm membership', evidence_refs: [...new Set(matching.flatMap(o => o.evidence_refs))].sort() }));
    }
  }
  return out;
}

function mk(x) {
  const body = {
    schema_version: 'ucdm-customer-model-1.0.0', kind: 'SegmentMembership',
    segment_id: x.segment_id, speaker_pseudonym: x.speaker_pseudonym, source_ref: x.source_ref,
    status: x.status, basis: x.basis, evidence_refs: x.evidence_refs,
    generated_by: 'deterministic:ucdm/customer_model/membership',
  };
  body.membership_id = 'segm_' + sha256Hex(canonicalize({ ...body, membership_id: undefined }));
  return deepFreeze(body);
}

// Overlap report: speakers who belong (CONFIRMED) to >1 segment.
function overlapReport(memberships) {
  const bySpeaker = {};
  for (const m of memberships) {
    if (m.status !== 'CONFIRMED' || !m.speaker_pseudonym) continue;
    (bySpeaker[m.speaker_pseudonym] = bySpeaker[m.speaker_pseudonym] || new Set()).add(m.segment_id);
  }
  const overlaps = Object.entries(bySpeaker).filter(([, s]) => s.size > 1).map(([spk, s]) => ({ speaker_pseudonym: spk, segment_ids: [...s].sort() }));
  return deepFreeze({ overlapping_speakers: overlaps.length, detail: overlaps.sort((a, b) => (a.speaker_pseudonym < b.speaker_pseudonym ? -1 : 1)), note: 'a customer may belong to several segments simultaneously (e.g. high urgency + price sensitive + solution aware)' });
}

function validateMembership(m) {
  const errors = [];
  if (!MEMBERSHIP_STATUS.includes(m.status)) errors.push(`bad membership status "${m.status}"`);
  if (m.status === 'CONFIRMED' && (!m.speaker_pseudonym || m.evidence_refs.length === 0)) errors.push('CONFIRMED membership needs an identified speaker + evidence');
  return { valid: errors.length === 0, errors };
}

module.exports = { MEMBERSHIP_STATUS, assignMembership, overlapReport, validateMembership };
