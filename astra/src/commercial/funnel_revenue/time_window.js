'use strict';
// [ASTRA-11J §F] Time-window discipline. Every metric preserves period start/end, timezone
// (where provided), aggregation level and the caller referenceTime. Different periods are
// NEVER silently compared. No LLM, no I/O, no implicit clock.
const AGGREGATION_LEVELS = Object.freeze(['DAY', 'WEEK', 'MONTH', 'QUARTER', 'YEAR', 'CUSTOM_RANGE', 'UNKNOWN']);

function normalizePeriod(p) {
  if (!p) return { start: null, end: null, tz: null, aggregation: 'UNKNOWN', valid: false };
  const start = p.start ? String(p.start) : null;
  const end = p.end ? String(p.end) : null;
  const ts = start ? Date.parse(start) : NaN;
  const te = end ? Date.parse(end) : NaN;
  let aggregation = AGGREGATION_LEVELS.includes(p.aggregation) ? p.aggregation : 'UNKNOWN';
  if (aggregation === 'UNKNOWN' && Number.isFinite(ts) && Number.isFinite(te)) {
    const days = (te - ts) / 86400000;
    aggregation = days <= 1.5 ? 'DAY' : days <= 8 ? 'WEEK' : days <= 32 ? 'MONTH' : days <= 95 ? 'QUARTER' : days <= 370 ? 'YEAR' : 'CUSTOM_RANGE';
  }
  return {
    start, end, tz: p.tz ? String(p.tz) : (p.timezone ? String(p.timezone) : null),
    aggregation, span_days: Number.isFinite(ts) && Number.isFinite(te) ? Number(((te - ts) / 86400000).toFixed(2)) : null,
    valid: Number.isFinite(ts) && Number.isFinite(te) && te >= ts,
  };
}

// periodsComparable(a, b) -> { comparable, reason }
function periodsComparable(a, b) {
  const pa = normalizePeriod(a), pb = normalizePeriod(b);
  if (!pa.valid || !pb.valid) return { comparable: false, reason: 'MISSING_OR_INVALID_PERIOD' };
  if (pa.start === pb.start && pa.end === pb.end) return { comparable: true, reason: 'SAME_PERIOD' };
  if ((pa.tz || null) !== (pb.tz || null)) return { comparable: false, reason: 'TIMEZONE_MISMATCH' };
  if (pa.aggregation !== pb.aggregation) return { comparable: false, reason: 'AGGREGATION_MISMATCH' };
  // same aggregation, different window -> comparable only as an explicit period-vs-period delta
  return { comparable: false, reason: 'DIFFERENT_PERIOD' };
}

// samePeriod(a, b) — strict identity required for a single conversion ratio numerator/denominator
function samePeriod(a, b) {
  const pa = normalizePeriod(a), pb = normalizePeriod(b);
  return pa.valid && pb.valid && pa.start === pb.start && pa.end === pb.end && (pa.tz || null) === (pb.tz || null);
}

module.exports = { AGGREGATION_LEVELS, normalizePeriod, periodsComparable, samePeriod };
