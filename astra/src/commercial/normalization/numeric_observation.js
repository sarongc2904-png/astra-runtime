'use strict';
// [ASTRA-11C] Numeric observations (spec section F). Integrates ASTRA-11B numeric integrity:
// a numeric observation is OBSERVED / USER_PROVIDED / COMPUTED(deterministic) only.
// An INFERRED / LLM number is NOT a numeric observation — it stays a TEXT observation.
// Deterministic unit/currency METADATA normalization only. NO FX, NO value conversion.
// No LLM, no web, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const { pv, CANONICAL_NUMERIC_CLASSES, DETERMINISTIC_PRODUCER_PREFIX } = require('../provenance/provenance');
const { normalizeUnit, normalizeCurrency } = require('./normalize');
const { extractNumeric } = require('../validation/numeric_integrity');

const AGGREGATIONS = Object.freeze(['RAW', 'SUM', 'COUNT', 'MEAN', 'MEDIAN', 'RATE', 'RATIO', 'MIN', 'MAX', 'LAST', 'FIRST']);

// makeNumericObservation({ value, unit, currency, denominator, aggregation, observation_window,
//                          source_class, evidence_refs, produced_by, transform, as_of })
// Fails closed (throws) on: non-finite value, disallowed source_class, COMPUTED without a
// deterministic producer, unknown aggregation. Malformed -> caller routes to QUARANTINED.
function makeNumericObservation(input) {
  const errors = [];
  const n = extractNumeric(input && input.value);
  if (n === null) errors.push(`value is not a finite number: ${JSON.stringify(input && input.value)}`);

  const sc = input && input.source_class;
  if (!CANONICAL_NUMERIC_CLASSES.includes(sc)) {
    errors.push(`source_class "${sc}" not allowed for a numeric observation — must be ${CANONICAL_NUMERIC_CLASSES.join('/')} (an INFERRED number is a TEXT observation, not a metric)`);
  }
  if (sc === 'COMPUTED' && (!input.produced_by || !String(input.produced_by).startsWith(DETERMINISTIC_PRODUCER_PREFIX))) {
    errors.push(`COMPUTED numeric observation must name a deterministic producer ("${DETERMINISTIC_PRODUCER_PREFIX}<module>")`);
  }
  const agg = (input && input.aggregation) || 'RAW';
  if (!AGGREGATIONS.includes(agg)) errors.push(`unknown aggregation "${agg}"`);
  if (sc === 'OBSERVED' && (!Array.isArray(input.evidence_refs) || input.evidence_refs.length === 0)) {
    errors.push('OBSERVED numeric observation must carry at least one evidence_ref');
  }
  if (errors.length) throw new Error(`[ASTRA-11C] invalid NumericObservation: ${errors.join(' | ')}`);

  const unitN = normalizeUnit(input.unit);
  const curN = normalizeCurrency(input.currency);
  const provValue = pv(n, sc, {
    evidence_refs: input.evidence_refs || [],
    produced_by: input.produced_by || (sc === 'COMPUTED' ? null : null),
    transform: input.transform || null,
    as_of: input.as_of || null,
    observed_period: input.observation_window || null,
  });

  const obs = {
    value: n,
    unit: unitN.unit,
    unit_known: unitN.known,
    currency: curN.code,
    currency_known: curN.known,
    denominator: input.denominator != null ? input.denominator : null, // e.g. "per lead", "per month"
    aggregation: agg,
    observation_window: input.observation_window != null ? input.observation_window : null,
    provenance: provValue,
    is_canonical_metric: true, // by construction: only OBSERVED/USER_PROVIDED/COMPUTED reach here
  };
  obs.content_hash = 'num_' + sha256Hex(canonicalize({ ...obs, content_hash: undefined }));
  return deepFreeze(obs);
}

// A number that only appears inside INFERRED prose: build a NON-canonical annotation instead.
function inferredNumberAnnotation({ text, mentioned_value, evidence_refs = [] }) {
  return deepFreeze({
    kind: 'INFERRED_NUMBER_ANNOTATION',
    text: String(text || ''),
    mentioned_value: mentioned_value != null ? mentioned_value : null,
    provenance: pv(String(text || ''), 'INFERRED', { evidence_refs }),
    is_canonical_metric: false,
    note: 'this number is annotation text, never a canonical metric (ASTRA-11B numeric integrity)',
  });
}

module.exports = { AGGREGATIONS, makeNumericObservation, inferredNumberAnnotation };
