'use strict';
// [ASTRA-11J §G] Cohort discipline. A cohort metric (leads generated in January -> purchases
// by March) is NEVER naively compared against a period metric (purchases in January from
// older leads). No LLM, no I/O.
const COHORT_BASIS = Object.freeze(['PERIOD_METRIC', 'COHORT_METRIC', 'UNKNOWN_BASIS']);

function basisOf(obs) {
  const b = obs && obs.cohort_basis;
  if (COHORT_BASIS.includes(b)) return b;
  if (obs && obs.cohort) return 'COHORT_METRIC';
  // a count with a bounded period and no cohort is a PERIOD_METRIC by default
  const p = obs && obs.period;
  const hasPeriod = p && ((p.start && p.end) || p.valid === true);
  if (hasPeriod) return 'PERIOD_METRIC';
  return 'UNKNOWN_BASIS';
}

// cohortComparable(upstream, downstream) -> { comparable, reason }
function cohortComparable(up, down) {
  const bu = basisOf(up), bd = basisOf(down);
  if (bu === 'UNKNOWN_BASIS' || bd === 'UNKNOWN_BASIS') return { comparable: false, reason: 'UNKNOWN_COHORT_BASIS' };
  if (bu !== bd) return { comparable: false, reason: 'COHORT_BASIS_MISMATCH' };
  if (bu === 'COHORT_METRIC') {
    const cu = up.cohort, cd = down.cohort;
    if (String(cu) !== String(cd)) return { comparable: false, reason: 'DIFFERENT_COHORT' };
  }
  return { comparable: true, reason: bu };
}

module.exports = { COHORT_BASIS, basisOf, cohortComparable };
