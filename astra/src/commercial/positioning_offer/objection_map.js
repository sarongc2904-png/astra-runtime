'use strict';
// [ASTRA-11I §N] Objection-Offer map. OBJECTION -> OFFER COMPONENT / PROOF / POLICY / UNKNOWN.
// An objection is NOT marked ADDRESSED when only partially addressed. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const HANDLING_STATUS = Object.freeze(['ADDRESSED', 'PARTIALLY_ADDRESSED', 'UNADDRESSED', 'UNKNOWN']);

// objection concept -> what would fully address it (component types / proof types / policy)
const OBJECTION_REMEDY = Object.freeze({
  PRICE_CONCERN: { proof: ['PRICE_TRANSPARENCY'], component: ['FINANCING', 'PAYMENT_TERM'], reversal: ['MILESTONE_PAYMENT'] },
  TRUST_CONCERN: { proof: ['TESTIMONIAL', 'THIRD_PARTY_VALIDATION', 'CREDENTIAL'], reversal: ['STAGED_COMMITMENT', 'TRANSPARENT_SCOPE'] },
  RESULTS_UNCERTAINTY: { proof: ['CASE_STUDY', 'QUANTIFIED_RESULT', 'DEMONSTRATION'], reversal: ['GUARANTEE', 'PROOF_BEFORE_PURCHASE'] },
  PAIN_FEAR: { proof: ['DEMONSTRATION', 'PROCESS_TRANSPARENCY'], reversal: ['TRIAL', 'PROOF_BEFORE_PURCHASE'] },
  PROCESS_UNCLEAR: { proof: ['PROCESS_TRANSPARENCY'], component: ['ONBOARDING'] },
  GUARANTEE_DEMAND: { component: ['GUARANTEE'], reversal: ['GUARANTEE'] },
  FINANCING_DEMAND: { component: ['FINANCING', 'PAYMENT_TERM'] },
  RESPONSIVENESS_COMPLAINT: { component: ['SUPPORT'] },
  SLOW_SERVICE: { component: ['SUPPORT'] },
});

// buildObjectionMap({ vocResult, proofStrategy, offerComponents, riskReversals })
function buildObjectionMap({ vocResult = {}, proofStrategy = null, offerComponents = [], riskReversals = [] }) {
  const objectionConcepts = new Map();
  for (const c of (vocResult.clusters || [])) {
    if (!['OBJECTION', 'REASON_NOT_TO_BUY', 'FEAR', 'BARRIER'].includes(c.aspect)) continue;
    const cur = objectionConcepts.get(c.canonical_concept) || { concept: c.canonical_concept, evidence_refs: new Set(), count: 0 };
    cur.count += c.frequency.deduped_observation_count;
    for (const q of c.representative_quotes) for (const er of q.evidence_refs) cur.evidence_refs.add(er);
    objectionConcepts.set(c.canonical_concept, cur);
  }
  const availProof = new Set((proofStrategy ? proofStrategy.available : []).map(p => p.proof_type));
  const compTypes = new Set(offerComponents.filter(c => ['USER_PROVIDED', 'OBSERVED'].includes(c.status)).map(c => c.component_type));
  const reversalTypes = new Set(riskReversals.map(r => r.reversal_type));

  const rows = [];
  for (const [concept, info] of [...objectionConcepts.entries()].sort()) {
    const remedy = OBJECTION_REMEDY[concept] || {};
    const proofHit = (remedy.proof || []).filter(t => availProof.has(t));
    const compHit = (remedy.component || []).filter(t => compTypes.has(t));
    const revHit = (remedy.reversal || []).filter(t => reversalTypes.has(t));
    const needed = (remedy.proof || []).length + (remedy.component || []).length;
    const covered = proofHit.length + compHit.length;
    let status;
    if (needed === 0) status = 'UNKNOWN';
    else if (covered === 0 && revHit.length === 0) status = 'UNADDRESSED';
    else if (covered >= needed) status = 'ADDRESSED';
    else status = 'PARTIALLY_ADDRESSED';
    rows.push(deepFreeze({
      schema_version: 'ucdm-positioning-offer-1.0.0', kind: 'ObjectionMapping',
      objection_concept: concept,
      evidence_refs: [...info.evidence_refs].sort(),
      addressed_by: { proof: proofHit.sort(), components: compHit.sort(), risk_reversal_candidates: revHit.sort() },
      remaining_gap: [...(remedy.proof || []).filter(t => !availProof.has(t)), ...(remedy.component || []).filter(t => !compTypes.has(t))].sort(),
      handling_status: status,
      objection_mapping_id: 'om_' + sha256Hex(canonicalize({ concept, status, proofHit, compHit })),
    }));
  }
  return rows;
}

function validateObjectionMapping(m) {
  const errors = [];
  if (!HANDLING_STATUS.includes(m.handling_status)) errors.push(`bad handling_status "${m.handling_status}"`);
  if (m.handling_status === 'ADDRESSED' && m.remaining_gap.length > 0) errors.push('cannot mark ADDRESSED while a remedy gap remains');
  if (['ADDRESSED', 'PARTIALLY_ADDRESSED', 'UNADDRESSED'].includes(m.handling_status) && m.evidence_refs.length === 0) errors.push('an objection mapping needs the objection evidence');
  return { valid: errors.length === 0, errors };
}

module.exports = { HANDLING_STATUS, OBJECTION_REMEDY, buildObjectionMap, validateObjectionMapping };
