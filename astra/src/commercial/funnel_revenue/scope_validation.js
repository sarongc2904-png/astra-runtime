'use strict';
// [ASTRA-11J §C] Scope validation for any two observations that are about to be divided,
// differenced or compared. Same scope = same time basis, same cohort basis, same
// segment/channel/offer/geography/currency filter context, and a positive denominator.
// No LLM, no I/O.
const { samePeriod, periodsComparable } = require('./time_window');
const { cohortComparable } = require('./cohort');
const { channelsComparable } = require('./channel');

// compareScope(up, down, { requireSameCohort, requireSamePeriod }) -> { same_scope, mismatches[] }
function compareScope(up, down, opts = {}) {
  const mismatches = [];
  const requireSamePeriod = opts.requireSamePeriod !== false;

  if (requireSamePeriod) {
    if (!samePeriod(up.period, down.period)) {
      const pc = periodsComparable(up.period, down.period);
      mismatches.push({ field: 'period', reason: pc.reason });
    }
  } else {
    const pc = periodsComparable(up.period, down.period);
    if (!pc.comparable && pc.reason !== 'DIFFERENT_PERIOD') mismatches.push({ field: 'period', reason: pc.reason });
  }

  const cc = cohortComparable(up, down);
  if (!cc.comparable) mismatches.push({ field: 'cohort', reason: cc.reason });

  const chc = channelsComparable(up.channel, down.channel);
  if (!chc.comparable && chc.reason !== 'UNKNOWN_CHANNEL') mismatches.push({ field: 'channel', reason: chc.reason });
  else if (chc.reason === 'UNKNOWN_CHANNEL' && (up.channel != null || down.channel != null) && String(up.channel || '') !== String(down.channel || '')) mismatches.push({ field: 'channel', reason: 'CHANNEL_MISMATCH' });

  for (const f of ['segment', 'offer', 'geography']) {
    if ((up[f] || null) !== (down[f] || null)) mismatches.push({ field: f, reason: `${f.toUpperCase()}_MISMATCH` });
  }
  if ((up.currency || null) !== (down.currency || null) && (up.currency || down.currency)) {
    mismatches.push({ field: 'currency', reason: 'CURRENCY_MISMATCH' });
  }

  return { same_scope: mismatches.length === 0, mismatches };
}

// denominatorState(count) -> 'VALID' | 'ZERO' | 'MISSING'
function denominatorState(count) {
  if (count == null || Number.isNaN(Number(count))) return 'MISSING';
  const n = Number(count);
  if (n === 0) return 'ZERO';
  if (n < 0) return 'INVALID_NEGATIVE';
  return 'VALID';
}

module.exports = { compareScope, denominatorState };
