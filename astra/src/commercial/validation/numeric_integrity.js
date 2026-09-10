'use strict';
// [ASTRA-11B] Numeric Integrity Contract (ASTRA-11B section C).
//   An LLM-generated number must never become a canonical commercial metric.
// Canonical numeric fields must be OBSERVED, USER_PROVIDED, or COMPUTED (deterministic).
// A number that appears only inside INFERRED/LLM content stays annotation text — it is
// never promoted to a canonical metric field.
// Pure functions. No I/O, no LLM, no network.
const { CANONICAL_NUMERIC_CLASSES, isProvenanceValue, DETERMINISTIC_PRODUCER_PREFIX, isUnknown } = require('../provenance/provenance');

// A "number" for canonical-metric purposes: a finite JS number, or a numeric object
// { amount, unit } / { value, unit } where amount/value is a finite number.
function extractNumeric(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (v && typeof v === 'object') {
    if (typeof v.amount === 'number') return Number.isFinite(v.amount) ? v.amount : null;
    if (typeof v.value === 'number') return Number.isFinite(v.value) ? v.value : null;
  }
  return null;
}

// Validate ONE canonical-metric field. `pvOrValue` is expected to be a ProvenanceValue.
// Returns { valid, errors[] }.
function validateCanonicalMetric(fieldName, pvOrValue) {
  const errors = [];
  if (isUnknown(pvOrValue) || pvOrValue == null) return { valid: true, errors }; // UNKNOWN metric is allowed; absence is allowed
  if (!isProvenanceValue(pvOrValue)) {
    return { valid: false, errors: [`${fieldName}: canonical metric must be a ProvenanceValue (got bare value) — a raw number cannot be canonical without provenance`] };
  }
  const cls = pvOrValue.source_class;
  if (!CANONICAL_NUMERIC_CLASSES.includes(cls)) {
    errors.push(`${fieldName}: canonical metric has source_class ${cls} — only ${CANONICAL_NUMERIC_CLASSES.join('/')} may be canonical; an ${cls} number must stay annotation text`);
  }
  if (cls === 'COMPUTED' && (!pvOrValue.produced_by || !String(pvOrValue.produced_by).startsWith(DETERMINISTIC_PRODUCER_PREFIX))) {
    errors.push(`${fieldName}: COMPUTED metric must name a deterministic producer ("${DETERMINISTIC_PRODUCER_PREFIX}<module>") — an LLM node cannot label output COMPUTED`);
  }
  const n = extractNumeric(pvOrValue.value);
  if (n === null && pvOrValue.value !== null) {
    errors.push(`${fieldName}: canonical metric value is not numeric`);
  }
  return { valid: errors.length === 0, errors };
}

// Guard for INFERRED content that carries embedded numbers: those numbers are allowed to
// exist as TEXT/annotation, but the object must not also mark them as a canonical metric.
// `inferredField` is a ProvenanceValue with source_class INFERRED whose .value is text (or
// an object with a `.text`/`.narrative`). We only assert it is NOT flagged canonical.
function assertInferredNumbersStayText(fieldName, pvValue) {
  const errors = [];
  if (!isProvenanceValue(pvValue)) return { valid: true, errors };
  if (pvValue.source_class !== 'INFERRED') return { valid: true, errors };
  if (pvValue.canonical_metric === true || (pvValue.value && typeof pvValue.value === 'object' && pvValue.value.canonical_metric === true)) {
    errors.push(`${fieldName}: INFERRED content flagged canonical_metric — INFERRED numbers must remain annotation text, never a canonical metric`);
  }
  return { valid: errors.length === 0, errors };
}

module.exports = { extractNumeric, validateCanonicalMetric, assertInferredNumbersStayText, CANONICAL_NUMERIC_CLASSES };
