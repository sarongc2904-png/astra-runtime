'use strict';
// [ASTRA-11I §L] Proof strategy. Reuses ASTRA-11H proof requirements + ASTRA-11E proof
// evidence + business-supplied proof assets. AVAILABLE_PROOF / REQUIRED_PROOF / PROOF_GAP /
// UNKNOWN. ASTRA does NOT fabricate testimonials or results. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const PROOF_TYPES = Object.freeze([
  'TESTIMONIAL', 'CASE_STUDY', 'QUANTIFIED_RESULT', 'DEMONSTRATION', 'CREDENTIAL', 'COMPARISON',
  'GUARANTEE', 'SAMPLE_TRIAL', 'PROCESS_TRANSPARENCY', 'THIRD_PARTY_VALIDATION',
]);
const PROOF_ITEM_STATUS = Object.freeze(['AVAILABLE_PROOF', 'REQUIRED_PROOF', 'PROOF_GAP', 'UNKNOWN']);

// map 11H proof_type -> 11I proof_type
const REQ_MAP = Object.freeze({
  TESTIMONIALS: 'TESTIMONIAL', CASE_RESULTS: 'CASE_STUDY', PRICE_TRANSPARENCY: 'PROCESS_TRANSPARENCY',
  GUARANTEE: 'GUARANTEE', TECHNICAL_EXPLANATION: 'PROCESS_TRANSPARENCY', CREDENTIAL: 'CREDENTIAL',
  DEMONSTRATION: 'DEMONSTRATION', COMPARISON: 'COMPARISON', SAMPLE: 'SAMPLE_TRIAL', TRIAL: 'SAMPLE_TRIAL',
});

function buildProofStrategy({ journeyResult = null, competitorResult = null, businessInput = {} }) {
  const required = new Map();
  for (const pr of ((journeyResult && journeyResult.proofRequirements) || [])) {
    const t = REQ_MAP[pr.proof_type] || 'PROCESS_TRANSPARENCY';
    const cur = required.get(t) || { proof_type: t, evidence_refs: new Set() };
    for (const er of pr.evidence_refs) cur.evidence_refs.add(er);
    required.set(t, cur);
  }
  // business-supplied proof assets (USER_PROVIDED — the ONLY route; ASTRA never fabricates one)
  const availableTypes = new Map();
  for (const p of (businessInput.proof_assets || [])) {
    const t = String(p.type || '').toUpperCase();
    if (!PROOF_TYPES.includes(t)) continue;
    const cur = availableTypes.get(t) || { proof_type: t, source_class: 'USER_PROVIDED', evidence_refs: new Set(), count: 0 };
    cur.count += 1;
    for (const er of (p.evidence_refs || [])) cur.evidence_refs.add(er);
    availableTypes.set(t, cur);
  }

  const items = [];
  const allTypes = new Set([...required.keys(), ...availableTypes.keys()]);
  for (const t of [...allTypes].sort()) {
    const req = required.get(t);
    const avail = availableTypes.get(t);
    let status;
    if (avail) status = 'AVAILABLE_PROOF';
    else if (req) status = 'PROOF_GAP';
    else status = 'UNKNOWN';
    items.push(deepFreeze({
      schema_version: 'ucdm-positioning-offer-1.0.0', kind: 'ProofStrategyItem',
      proof_type: t, status,
      required_by_customer: !!req,
      available_from_business: !!avail,
      fabricated: false,
      evidence_refs: [...new Set([...(req ? req.evidence_refs : []), ...(avail ? avail.evidence_refs : [])])].sort(),
      proof_item_id: 'psi_' + sha256Hex(canonicalize({ t, status, req: !!req, avail: !!avail })),
    }));
  }
  return deepFreeze({
    schema_version: 'ucdm-positioning-offer-1.0.0', kind: 'ProofStrategy',
    items,
    available: items.filter(i => i.status === 'AVAILABLE_PROOF'),
    required: items.filter(i => i.required_by_customer),
    gaps: items.filter(i => i.status === 'PROOF_GAP'),
    note: 'proof assets are USER_PROVIDED only; ASTRA-11I never fabricates a testimonial or result',
    generated_by: 'deterministic:ucdm/positioning_offer',
  });
}

function validateProofStrategy(ps) {
  const errors = [];
  for (const i of ps.items) {
    if (!PROOF_ITEM_STATUS.includes(i.status)) errors.push(`bad proof item status "${i.status}"`);
    if (i.fabricated !== false) errors.push('a proof item must never be fabricated');
    if (i.status === 'AVAILABLE_PROOF' && !i.available_from_business) errors.push('AVAILABLE_PROOF requires a business-supplied asset');
  }
  return { valid: errors.length === 0, errors };
}

module.exports = { PROOF_TYPES, PROOF_ITEM_STATUS, buildProofStrategy, validateProofStrategy };
