'use strict';

// Deterministic MARKET_CONTEXT normalization.
// If the brief explicitly provides a problem_context, that fact owns downstream_payload.problem_context.
// This prevents the model from restating the business objective as if it were the market problem.

function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }

const MONEY_RE = /\$\s*[\d][\d,.]*(?:\s*(?:MXN|USD|pesos?|d[oó]lares?))?/gi;

function redactExternalMoney(value) {
  if (typeof value === 'string') return value.replace(MONEY_RE, '[PRECIO_COMPETITIVO_EXTERNO_VER_EVIDENCIA]');
  if (Array.isArray(value)) return value.map(redactExternalMoney);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = redactExternalMoney(v);
    return out;
  }
  return value;
}

function normalizeMarketContextOutput(output, canonicalBriefFacts) {
  const repaired = clone(output);
  const payload = repaired && repaired.downstream_payload;
  const repairs = [];
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { output: repaired, repairs };

  const problem = canonicalBriefFacts && canonicalBriefFacts.problem_context;
  if (problem && problem.status === 'USER_PROVIDED_FACT' && problem.value) {
    if (payload.problem_context !== problem.value) {
      payload.problem_context = problem.value;
      repairs.push({ field_key: 'problem_context', repair_type: 'RESTORE_CANONICAL_PROBLEM_CONTEXT', deterministic: true });
    }
  }

  // MARKET_CONTEXT may inspect competitor pricing as EXTERNAL_RESEARCH, but its downstream
  // schema is not a pricing surface. Monetary amounts from external evidence must remain in
  // findings/provenance and must never flow into market_assumptions/constraints where later
  // fidelity checks could misread them as the user's own price.
  for (const key of ['market_assumptions', 'constraints']) {
    if (!(key in payload)) continue;
    const before = JSON.stringify(payload[key]);
    const afterValue = redactExternalMoney(payload[key]);
    const after = JSON.stringify(afterValue);
    if (before !== after) {
      payload[key] = afterValue;
      repairs.push({ field_key: key, repair_type: 'REDACT_EXTERNAL_COMPETITOR_PRICE_FROM_MARKET_PAYLOAD', deterministic: true });
    }
  }

  return { output: repaired, repairs };
}

module.exports = { normalizeMarketContextOutput, redactExternalMoney };
