'use strict';

// Deterministic META_ADS specialist output normalization before brief-fidelity validation.
// Purpose: preserve the canonical business objective exactly and label newly-designed ad tactics
// as PROPUESTA, matching the user's provenance contract. This does not relax the validator.

const PROPOSAL_PREFIX_RE = /^\s*(?:PROPUESTA|PROPOSAL|HIP[ÓO]TESIS|HYPOTHESIS)\s*:/i;
const UNKNOWN_RE = /^\s*(?:UNKNOWN|CURRENT_RESEARCH_REQUIRED)\b/i;
const TACTICAL_FIELDS = new Set(['audience_approach', 'structure', 'creative_testing', 'qualification', 'measurement']);
const HARD_CLAIM_RE = /\b(?:garantiz\w*|guarantee\w*|\d+(?:[.,]\d+)?\s*(?:%|x|ventas?|sales?|clientes?|clients?|citas?|appointments?|leads?)\b)/i;

function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }

function markProposal(value) {
  if (typeof value === 'string') {
    const s = value.trim();
    if (!s || PROPOSAL_PREFIX_RE.test(s) || UNKNOWN_RE.test(s)) return value;
    // Never convert a hard result/guarantee claim into a "proposal" escape hatch.
    // Leave it untouched so the existing strict fidelity validator can block it.
    if (HARD_CLAIM_RE.test(s)) return value;
    return 'PROPUESTA: ' + s;
  }
  if (Array.isArray(value)) return value.map(markProposal);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = markProposal(v);
    return out;
  }
  return value;
}

function normalizeAdsOutput(output, canonicalBriefFacts) {
  const repaired = clone(output);
  const payload = repaired && repaired.downstream_payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { output: repaired, repairs: [] };
  const repairs = [];

  const objective = canonicalBriefFacts && canonicalBriefFacts.business_objective;
  if (objective && objective.status === 'USER_PROVIDED_FACT' && objective.value) {
    if (payload.campaign_objective !== objective.value) {
      repairs.push({ field_key: 'campaign_objective', repair_type: 'RESTORE_CANONICAL_OBJECTIVE', deterministic: true });
      payload.campaign_objective = objective.value;
    }
  }

  for (const field of TACTICAL_FIELDS) {
    if (!(field in payload)) continue;
    const before = JSON.stringify(payload[field]);
    payload[field] = markProposal(payload[field]);
    if (JSON.stringify(payload[field]) !== before) {
      repairs.push({ field_key: field, repair_type: 'PREFIX_PROPUESTA', deterministic: true });
    }
  }

  return { output: repaired, repairs };
}

module.exports = { normalizeAdsOutput, markProposal, TACTICAL_FIELDS };
