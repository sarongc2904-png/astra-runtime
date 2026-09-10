'use strict';
// [ASTRA-11D remediation §2] Pricing intelligence. OBSERVED price observations only
// (no inferred price). Deterministic statistics. Currency stays EXPLICIT — stats are
// computed strictly per-currency, NEVER mixed, NEVER FX-converted.
// No LLM, no web, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const { assess } = require('../validation/confidence');

const PRICING_KINDS = Object.freeze(['LISTED_PRICE', 'STARTING_PRICE', 'RANGE', 'SUBSCRIPTION', 'ONE_TIME', 'FINANCING', 'DISCOUNT']);
const PRODUCER = 'deterministic:ucdm/research/pricing';

// extractPricingObservations(observations) -> [{ pricing_id, pricing_kind, amount, currency, unit,
//   observed_at, subject_ref, source_ref, evidence_refs, status:'OBSERVED' }]
function extractPricingObservations(observations) {
  const out = [];
  const excluded_inferred = [];
  for (const o of observations) {
    if (!o.numeric || !o.numeric.currency) continue;
    const sc = o.provenance && o.provenance.source_class;
    if (sc === 'INFERRED') { excluded_inferred.push({ source_ref: o.source_ref, reason: 'inferred price is not a pricing observation' }); continue; }
    if (sc !== 'OBSERVED' && sc !== 'USER_PROVIDED') continue;
    if (!['METRIC', 'TRANSACTION'].includes(o.observation_type)) continue;
    const sv = o.structured_values || {};
    const kind = PRICING_KINDS.includes(sv.pricing_kind) ? sv.pricing_kind : (o.observation_type === 'TRANSACTION' ? 'ONE_TIME' : 'LISTED_PRICE');
    const body = {
      schema_version: 'ucdm-research-1.0.0',
      pricing_kind: kind,
      amount: o.numeric.value,
      currency: o.numeric.currency,          // explicit, never normalized away
      currency_known: o.numeric.currency_known,
      unit: o.numeric.unit,
      observed_at: (o.temporal && (o.temporal.event_time || o.temporal.publication_time || o.temporal.capture_time)) || null,
      subject_ref: (o.subject && o.subject.state === 'RESOLVED') ? `subject:${o.subject.subject_type}:${o.subject.subject_id}` : `subject:${(o.subject && o.subject.subject_type) || '?'}:${(o.subject && o.subject.label) || 'UNRESOLVED'}`,
      source_ref: o.source_ref,
      evidence_refs: [...((o.provenance && o.provenance.evidence_refs) || [])],
      status: 'OBSERVED',
    };
    body.pricing_id = 'mpx_' + sha256Hex(canonicalize({ ...body, pricing_id: undefined }));
    out.push(deepFreeze(body));
  }
  return { pricing_observations: out, excluded_inferred };
}

function median(sorted) {
  const n = sorted.length; if (!n) return null;
  return n % 2 ? sorted[(n - 1) / 2] : Number(((sorted[n / 2 - 1] + sorted[n / 2]) / 2).toFixed(6));
}
// Fixed relative distribution buckets around the per-currency median (deterministic).
function buckets(values, med) {
  if (med == null || med === 0) return { '<0.75x': values.length, '0.75-1.25x': 0, '1.25-2x': 0, '>=2x': 0 };
  const b = { '<0.75x': 0, '0.75-1.25x': 0, '1.25-2x': 0, '>=2x': 0 };
  for (const v of values) {
    const r = v / med;
    if (r < 0.75) b['<0.75x']++;
    else if (r < 1.25) b['0.75-1.25x']++;
    else if (r < 2) b['1.25-2x']++;
    else b['>=2x']++;
  }
  return b;
}

// computePricingStats(pricingObservations, { referenceTime }) -> { by_currency: {CUR: {...}}, mixed_currency }
function computePricingStats(pricingObservations, { referenceTime = null } = {}) {
  const byCur = {};
  for (const p of pricingObservations) {
    (byCur[p.currency] = byCur[p.currency] || []).push(p);
  }
  const currencies = Object.keys(byCur).sort();
  const stats = {};
  for (const cur of currencies) {
    const arr = byCur[cur];
    const vals = arr.map(p => p.amount).filter(v => typeof v === 'number').sort((a, b) => a - b);
    const mean = vals.length ? Number((vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(6)) : null;
    const med = median(vals);
    const byKind = {};
    for (const p of arr) { (byKind[p.pricing_kind] = byKind[p.pricing_kind] || []).push(p.amount); }
    const conf = assess({
      evidence_count: [...new Set(arr.flatMap(p => p.evidence_refs))].length,
      distinct_sources: new Set(arr.map(p => p.source_ref)).size,
      newest_evidence_age_days: 60, coverage: 1, agree_count: arr.length, conflict_count: 0,
      data_quality: 0.7,
    });
    stats[cur] = deepFreeze({
      currency: cur,
      sample_size: vals.length,
      min: vals.length ? vals[0] : null,
      max: vals.length ? vals[vals.length - 1] : null,
      median: med,
      mean,
      distribution_buckets: buckets(vals, med),
      by_pricing_kind: Object.fromEntries(Object.entries(byKind).map(([k, v]) => [k, { n: v.length, min: Math.min(...v), max: Math.max(...v) }])),
      confidence: conf,
      status: 'COMPUTED',
      produced_by: PRODUCER,
      note: 'per-currency only; no FX conversion; no inferred price',
    });
  }
  return deepFreeze({
    schema_version: 'ucdm-research-1.0.0',
    by_currency: stats,
    currencies,
    mixed_currency: currencies.length > 1,
    generated_by: PRODUCER,
  });
}

function validatePricingObservation(p) {
  const errors = [];
  if (!PRICING_KINDS.includes(p.pricing_kind)) errors.push(`bad pricing_kind "${p.pricing_kind}"`);
  if (p.status !== 'OBSERVED') errors.push('pricing observation must be OBSERVED');
  if (p.currency == null) errors.push('currency must be explicit');
  if (typeof p.amount !== 'number' || !Number.isFinite(p.amount)) errors.push('amount must be a finite number');
  if (!Array.isArray(p.evidence_refs) || p.evidence_refs.length === 0) errors.push('pricing observation needs evidence_refs');
  return { valid: errors.length === 0, errors };
}

module.exports = { PRICING_KINDS, extractPricingObservations, computePricingStats, validatePricingObservation };
