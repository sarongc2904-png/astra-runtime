'use strict';
// [ASTRA-11I §M] RiskReversalCandidate. Derived from evidenced customer fears / frictions.
// ANALYTICAL only. ASTRA does NOT assert legal or financial viability of any reversal.
// No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const REVERSAL_TYPES = Object.freeze([
  'GUARANTEE', 'TRIAL', 'STAGED_COMMITMENT', 'CANCELABILITY', 'MILESTONE_PAYMENT',
  'TRANSPARENT_SCOPE', 'PROOF_BEFORE_PURCHASE',
]);

// concept / friction -> candidate reversal
const SIGNAL_REVERSAL = Object.freeze({
  PAIN_FEAR: ['PROOF_BEFORE_PURCHASE', 'TRIAL'],
  RESULTS_UNCERTAINTY: ['GUARANTEE', 'MILESTONE_PAYMENT', 'PROOF_BEFORE_PURCHASE'],
  TRUST_CONCERN: ['STAGED_COMMITMENT', 'TRANSPARENT_SCOPE'],
  GUARANTEE_DEMAND: ['GUARANTEE'],
  PRICE_CONCERN: ['MILESTONE_PAYMENT', 'STAGED_COMMITMENT'],
  PROCESS_UNCLEAR: ['TRANSPARENT_SCOPE'],
});

function buildRiskReversalCandidates({ vocResult = {}, journeyResult = null }) {
  const obs = (vocResult.observations || []).filter(o => o.status === 'OBSERVED');
  const rows = new Map();
  const add = (type, concept, evidence_refs) => {
    const cur = rows.get(type) || { type, driven_by: new Set(), evidence_refs: new Set() };
    cur.driven_by.add(concept);
    for (const er of evidence_refs) cur.evidence_refs.add(er);
    rows.set(type, cur);
  };
  for (const o of obs) for (const t of (SIGNAL_REVERSAL[o.normalized_concept] || [])) add(t, o.normalized_concept, o.evidence_refs);
  for (const f of ((journeyResult && journeyResult.frictions) || [])) {
    if (f.category === 'RISK') { add('PROOF_BEFORE_PURCHASE', 'friction:RISK', f.evidence_refs); }
    if (f.category === 'TRUST') { add('STAGED_COMMITMENT', 'friction:TRUST', f.evidence_refs); }
  }

  return [...rows.values()].map(r => {
    const body = {
      schema_version: 'ucdm-positioning-offer-1.0.0', kind: 'RiskReversalCandidate',
      reversal_type: r.type,
      status: 'ANALYTICAL',
      driven_by: [...r.driven_by].sort(),
      evidence_refs: [...r.evidence_refs].sort(),
      legal_financial_viability: 'NOT_ASSESSED',
      is_recommendation: false,
      note: 'analytical candidate derived from evidenced customer fear/friction — business must confirm feasibility',
      generated_by: 'deterministic:ucdm/positioning_offer',
    };
    body.reversal_id = 'rr_' + sha256Hex(canonicalize({ ...body, reversal_id: undefined }));
    return deepFreeze(body);
  }).sort((a, b) => (a.reversal_type < b.reversal_type ? -1 : 1));
}

function validateRiskReversal(r) {
  const errors = [];
  if (!REVERSAL_TYPES.includes(r.reversal_type)) errors.push(`bad reversal_type "${r.reversal_type}"`);
  if (r.status !== 'ANALYTICAL') errors.push('a risk reversal candidate is ANALYTICAL only');
  if (r.legal_financial_viability !== 'NOT_ASSESSED') errors.push('ASTRA must not assert legal/financial viability');
  if (r.evidence_refs.length === 0) errors.push('a risk reversal candidate must be driven by evidenced fear/friction');
  return { valid: errors.length === 0, errors };
}

module.exports = { REVERSAL_TYPES, buildRiskReversalCandidates, validateRiskReversal };
