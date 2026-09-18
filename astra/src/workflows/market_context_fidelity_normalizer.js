'use strict';

// Deterministic MARKET_CONTEXT normalization.
// If the brief explicitly provides a problem_context, that fact owns downstream_payload.problem_context.
// This prevents the model from restating the business objective as if it were the market problem.

function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }

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

  return { output: repaired, repairs };
}

module.exports = { normalizeMarketContextOutput };
