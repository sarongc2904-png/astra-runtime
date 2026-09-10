'use strict';
// [ASTRA-11M §13] Priority engine. Ordinal only — PRIORITY_1 / PRIORITY_2 / PRIORITY_3, or
// PRIORITY_UNRESOLVED when two candidates cannot be ordered with sufficient evidence.
// NO fake scoring, NO invented percentages. Deterministic total order with explicit tie-breaks.
// No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const C = require('./contracts');

// lower rank index = higher priority. Ordinal vectors compared lexicographically.
function vec(cand, depNode) {
  return [
    // 1. blocked / rejected sink to the bottom
    { CANDIDATE_READY: 0, CANDIDATE_DEFERRED: 1, CANDIDATE_BLOCKED: 2, CANDIDATE_REJECTED: 3, CANDIDATE_MALFORMED: 4 }[cand.status],
    // 2. dependency readiness
    { DEPENDENCY_SATISFIED: 0, DEPENDENCY_UNKNOWN: 1, DEPENDENCY_MISSING: 2, DEPENDENCY_BLOCKED: 3 }[(depNode && depNode.status) || 'DEPENDENCY_UNKNOWN'],
    // 3. urgency (critical first)
    C.ordinalIndex(C.URGENCY, cand.urgency),
    // 4. evidence strength (strong first)
    C.ordinalIndex(C.EVIDENCE_STRENGTH, cand.evidence_strength),
    // 5. impact (high first)
    C.ordinalIndex(C.IMPACT, cand.expected_impact),
    // 6. time-to-signal (immediate first)
    C.ordinalIndex(C.TIME_TO_SIGNAL, cand.time_to_signal),
    // 7. risk (low first -> invert: LOW index should be small). RISK_LEVELS = HIGH,MEDIUM,LOW,UNKNOWN
    ({ RISK_LOW: 0, RISK_UNKNOWN: 1, RISK_MEDIUM: 2, RISK_HIGH: 3 })[cand.risk],
    // 8. reversibility (easily reversible first)
    C.ordinalIndex(C.REVERSIBILITY, cand.reversibility),
  ];
}

function cmpVec(a, b) { for (let i = 0; i < a.length; i++) { if (a[i] !== b[i]) return a[i] - b[i]; } return 0; }

// two candidates are "not orderable with evidence" when their vectors are equal AND both have
// weak/none evidence or unknown impact — we refuse to fabricate a tiebreak
function unresolvedPair(a, b, va, vb) {
  if (cmpVec(va, vb) !== 0) return false;
  const weak = c => c.evidence_strength === 'EVIDENCE_WEAK' || c.evidence_strength === 'EVIDENCE_NONE' || c.expected_impact === 'IMPACT_UNKNOWN';
  return weak(a) && weak(b);
}

function prioritize(candidates, dependencyGraph) {
  const depByDec = Object.fromEntries((dependencyGraph && dependencyGraph.nodes || []).map(n => [n.decision_id, n]));
  const rows = candidates.map(c => ({ cand: c, v: vec(c, depByDec[c.decision_id]) }));

  // stable deterministic sort: vector, then decision_id
  rows.sort((x, y) => cmpVec(x.v, y.v) || x.cand.decision_id.localeCompare(y.cand.decision_id));

  // detect unresolved ties among READY candidates
  const unresolved = [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      if (rows[i].cand.status !== 'CANDIDATE_READY' || rows[j].cand.status !== 'CANDIDATE_READY') continue;
      if (unresolvedPair(rows[i].cand, rows[j].cand, rows[i].v, rows[j].v)) {
        unresolved.push([rows[i].cand.decision_id, rows[j].cand.decision_id].sort());
      }
    }
  }

  // assign ordinal bands: READY candidates get PRIORITY_1..3 by position, rest get their status band
  const readyOrder = rows.filter(r => r.cand.status === 'CANDIDATE_READY');
  const rankOf = {};
  readyOrder.forEach((r, idx) => {
    const inUnresolved = unresolved.some(p => p.includes(r.cand.decision_id));
    rankOf[r.cand.decision_id] = inUnresolved ? 'PRIORITY_UNRESOLVED' : (idx === 0 ? 'PRIORITY_1' : idx === 1 ? 'PRIORITY_2' : 'PRIORITY_3');
  });
  for (const r of rows) if (!(r.cand.decision_id in rankOf)) rankOf[r.cand.decision_id] = 'PRIORITY_3';

  const body = {
    schema_version: C.DECISION_SCHEMA_VERSION, kind: 'PriorityRanking',
    ordering: rows.map(r => r.cand.decision_id),
    ordinal_vectors: Object.fromEntries(rows.map(r => [r.cand.decision_id, r.v])),
    rank: rankOf,
    unresolved_pairs: unresolved.sort((a, b) => a.join().localeCompare(b.join())),
    fake_scoring: false, invented_confidence: false,
    factors: ['status', 'dependency_readiness', 'urgency', 'evidence_strength', 'impact', 'time_to_signal', 'risk', 'reversibility'],
    generated_by: 'deterministic:ucdm/decision_orchestrator/priority',
  };
  body.ranking_id = 'dpr_' + sha256Hex(canonicalize({ ...body, ranking_id: undefined })).slice(0, 40);
  return deepFreeze(body);
}

function validatePriority(p) {
  const errors = [];
  for (const v of Object.values(p.rank)) if (!C.PRIORITY_RANK.includes(v)) errors.push(`bad priority rank "${v}"`);
  if (p.fake_scoring !== false || p.invented_confidence !== false) errors.push('no fake scoring / invented confidence allowed');
  // monotonic: ordering must be sorted by ordinal vector
  for (let i = 1; i < p.ordering.length; i++) {
    if (cmpVec(p.ordinal_vectors[p.ordering[i - 1]], p.ordinal_vectors[p.ordering[i]]) > 0) errors.push('ordering not monotonic in ordinal vector');
  }
  return { valid: errors.length === 0, errors };
}

module.exports = { prioritize, validatePriority, cmpVec };
