'use strict';
// [ASTRA-11H §X] Journey conflicts. Conflicting journey evidence is PRESERVED, never
// averaged. A conflict may imply separate segment journeys. Reuses the ASTRA-11F/11G
// contradiction pattern — no parallel system. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const CONFLICT_STATUS = Object.freeze(['CONSISTENT', 'MIXED', 'POLARIZED', 'INSUFFICIENT']);

// detectJourneyConflicts({ journeyObservations, transitions, events, customerModel })
function detectJourneyConflicts(x) {
  const { journeyObservations = [], transitions = [], events = [], customerModel = null } = x;
  const out = [];

  // (1) purchase path length: immediate buyers vs long comparers
  const bySubject = {};
  for (const o of journeyObservations) if (o.subject_ref && o.stage !== 'UNKNOWN') (bySubject[o.subject_ref] = bySubject[o.subject_ref] || new Set()).add(o.stage);
  const immediate = [], deliberate = [];
  for (const [sub, stages] of Object.entries(bySubject)) {
    const comparing = stages.has('ALTERNATIVE_COMPARISON') || stages.has('VENDOR_EVALUATION');
    const buying = stages.has('PURCHASE') || stages.has('PURCHASE_DECISION') || stages.has('PURCHASE_INTENT');
    if (buying && !comparing) immediate.push(sub);
    else if (comparing) deliberate.push(sub);
  }
  out.push(mkConflict('PURCHASE_PATH_LENGTH', immediate.length, deliberate.length,
    'buy quickly with little comparison', 'compare / evaluate at length',
    [...immediate, ...deliberate], journeyObservations));

  // (2) recommendation-driven vs search/ad-driven entry
  const recEntry = events.filter(e => e.event_type === 'RECOMMENDATION_RECEIVED');
  const selfEntry = events.filter(e => ['SEARCH_PERFORMED', 'AD_SEEN', 'WEBSITE_VISIT'].includes(e.event_type));
  if (recEntry.length + selfEntry.length >= 3) {
    out.push(mkConflictRaw('ENTRY_PATH', recEntry.length, selfEntry.length, 'enters via referral', 'enters via own search / ads',
      [...recEntry, ...selfEntry].flatMap(e => e.evidence_refs)));
  }

  // (3) carry through ASTRA-11G persona conflicts that bear on the journey
  for (const c of ((customerModel && customerModel.conflicts) || [])) {
    if (['MIXED', 'POLARIZED'].includes(c.status)) {
      out.push(deepFreeze({
        schema_version: 'ucdm-journey-1.0.0', kind: 'JourneyConflict', dimension: 'CARRIED_FROM_CUSTOMER_MODEL',
        theme: c.theme, status: c.status, likely_separate_segment_journeys: true,
        evidence_refs: c.evidence_refs || [], source: 'ASTRA-11G persona conflict',
        note: 'a persona-level conflict propagates to distinct segment journeys',
        conflict_id: 'jcf_' + sha256Hex(canonicalize({ theme: c.theme, status: c.status, dim: 'carried' })),
      }));
    }
  }
  return out.filter(c => c.status !== 'INSUFFICIENT' || c.dimension === 'CARRIED_FROM_CUSTOMER_MODEL');
}

function mkConflict(dimension, na, nb, aLabel, bLabel, subjects, journeyObservations) {
  const ev = [...new Set(journeyObservations.filter(o => subjects.includes(o.subject_ref)).flatMap(o => o.evidence_refs))].sort();
  return mkFinal(dimension, na, nb, aLabel, bLabel, ev);
}
function mkConflictRaw(dimension, na, nb, aLabel, bLabel, evidence_refs) {
  return mkFinal(dimension, na, nb, aLabel, bLabel, [...new Set(evidence_refs)].sort());
}
function mkFinal(dimension, na, nb, aLabel, bLabel, evidence_refs) {
  const total = na + nb;
  let status;
  if (total < 3) status = 'INSUFFICIENT';
  else if (na === 0 || nb === 0) status = 'CONSISTENT';
  else status = Math.min(na, nb) / total >= 0.35 ? 'POLARIZED' : 'MIXED';
  const body = {
    schema_version: 'ucdm-journey-1.0.0', kind: 'JourneyConflict', dimension,
    side_a: { label: aLabel, count: na }, side_b: { label: bLabel, count: nb },
    status, likely_separate_segment_journeys: ['MIXED', 'POLARIZED'].includes(status),
    evidence_refs,
    note: ['MIXED', 'POLARIZED'].includes(status) ? 'conflicting journeys preserved — likely separate segment journeys' : 'no material journey conflict on this dimension',
    generated_by: 'deterministic:ucdm/journey/conflicts',
  };
  body.conflict_id = 'jcf_' + sha256Hex(canonicalize({ ...body, conflict_id: undefined }));
  return deepFreeze(body);
}

function validateConflict(c) {
  const errors = [];
  if (!CONFLICT_STATUS.includes(c.status)) errors.push(`bad conflict status "${c.status}"`);
  if (['MIXED', 'POLARIZED'].includes(c.status) && c.likely_separate_segment_journeys !== true) errors.push('a material journey conflict must be flagged as likely separate segment journeys');
  return { valid: errors.length === 0, errors };
}

module.exports = { CONFLICT_STATUS, detectJourneyConflicts, validateConflict };
