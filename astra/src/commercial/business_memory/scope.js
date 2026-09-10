'use strict';
// [ASTRA-11L §4] Scope contract. Scope is NEVER inferred as global from a partial scope.
// Reuses ASTRA-11J time_window / cohort / channel primitives — no parallel system.
// No LLM, no I/O.
const { canonicalize, sha256Hex } = require('../validation/canonical');
const { samePeriod } = require('../funnel_revenue/time_window');
const { cohortComparable } = require('../funnel_revenue/cohort');
const { channelsComparable } = require('../funnel_revenue/channel');

const SCOPE_FIELDS = Object.freeze([
  'period', 'cohort_basis', 'cohort', 'channel', 'segment', 'offer', 'geography', 'currency',
  'product', 'campaign', 'funnel_transition', 'customer_type',
]);
const SCOPE_MATCH_STATUS = Object.freeze(['SCOPE_MATCH', 'SCOPE_PARTIAL', 'SCOPE_MISMATCH', 'SCOPE_UNKNOWN']);

function normalizeScope(s = {}) {
  const out = {};
  for (const f of SCOPE_FIELDS) {
    if (f === 'period') out.period = s.period || null;
    else out[f] = s[f] == null ? 'UNKNOWN' : String(s[f]);
  }
  out.cohort_basis = out.cohort_basis === 'UNKNOWN' && (s.cohort || out.cohort !== 'UNKNOWN') ? 'COHORT_METRIC' : out.cohort_basis;
  return out;
}

function scopeHash(s) { return 'sch_' + sha256Hex(canonicalize(normalizeScope(s))); }

// compareScope(a, b) -> { status, matched_fields[], mismatched_fields[], unknown_fields[] }
//   a "match" requires every field that BOTH sides specify to be equal.
function compareScope(aRaw, bRaw) {
  const a = normalizeScope(aRaw), b = normalizeScope(bRaw);
  const matched = [], mismatched = [], unknown = [], partial = [];
  for (const f of SCOPE_FIELDS) {
    if (f === 'period') {
      if (!a.period && !b.period) { unknown.push(f); continue; }
      if (!a.period || !b.period) { partial.push(f); continue; }
      if (samePeriod(a.period, b.period)) matched.push(f); else mismatched.push(f);
      continue;
    }
    const av = a[f], bv = b[f];
    if (av === 'UNKNOWN' && bv === 'UNKNOWN') { unknown.push(f); continue; }
    if (av === 'UNKNOWN' || bv === 'UNKNOWN') { partial.push(f); continue; }
    if (f === 'cohort') { const cc = cohortComparable({ cohort_basis: a.cohort_basis, cohort: av }, { cohort_basis: b.cohort_basis, cohort: bv }); if (cc.comparable) matched.push(f); else mismatched.push(f); continue; }
    if (f === 'channel') { const ch = channelsComparable(av, bv); if (ch.comparable) matched.push(f); else if (ch.reason === 'UNKNOWN_CHANNEL') partial.push(f); else mismatched.push(f); continue; }
    if (av === bv) matched.push(f); else mismatched.push(f);
  }
  let status;
  if (mismatched.length) status = 'SCOPE_MISMATCH';
  else if (matched.length === 0 && partial.length === 0) status = 'SCOPE_UNKNOWN';
  else if (partial.length) status = 'SCOPE_PARTIAL';
  else status = 'SCOPE_MATCH';
  return { status, matched_fields: matched.sort(), mismatched_fields: mismatched.sort(), partial_fields: partial.sort(), unknown_fields: unknown.sort() };
}

// scope specificity — a fully-specified scope outranks a vaguer one during retrieval
function scopeSpecificity(sRaw) {
  const s = normalizeScope(sRaw);
  let n = 0;
  for (const f of SCOPE_FIELDS) { if (f === 'period') { if (s.period) n++; } else if (s[f] !== 'UNKNOWN') n++; }
  return n;
}

// validateScope — required fields must not be UNKNOWN; scope is never widened
function validateScope(sRaw, { requiredFields = [] } = {}) {
  const s = normalizeScope(sRaw);
  const errors = [];
  for (const f of requiredFields) {
    if (f === 'period') { if (!s.period) errors.push('required scope field "period" is missing'); }
    else if (s[f] === 'UNKNOWN') errors.push(`required scope field "${f}" is UNKNOWN`);
  }
  return { valid: errors.length === 0, errors };
}

module.exports = { SCOPE_FIELDS, SCOPE_MATCH_STATUS, normalizeScope, scopeHash, compareScope, scopeSpecificity, validateScope };
