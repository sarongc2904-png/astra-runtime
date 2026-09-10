'use strict';
// [ASTRA-11H §T] B2B buying-committee journeys. Reuses ASTRA-11G buying roles. Each role may
// have a DIFFERENT pain / trigger / proof requirement — ASTRA does not assume they share one.
// A role journey is only asserted where evidence attributes to it; otherwise UNKNOWN.
// No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

// buildBuyingCommitteeJourneys({ mode, buyingCommittee, journeyObservations, frictions, proofRequirements, triggers, businessInput })
function buildBuyingCommitteeJourneys(x) {
  const { mode = 'B2C', buyingCommittee = null, journeyObservations = [], frictions = [], proofRequirements = [], triggers = [], businessInput = {} } = x;
  if (mode !== 'B2B' || !buyingCommittee || buyingCommittee.status === 'NOT_APPLICABLE') {
    return deepFreeze({ schema_version: 'ucdm-journey-1.0.0', kind: 'BuyingCommitteeJourneys', status: 'NOT_APPLICABLE', mode, role_journeys: [] });
  }
  const roleEvidence = businessInput.role_journey_evidence || {}; // { <ROLE>: { evidence_refs, stages? } }
  const role_journeys = buyingCommittee.members.map(m => {
    const supplied = roleEvidence[m.role] || {};
    const ev = [...new Set([...(m.evidence_refs || []), ...(supplied.evidence_refs || [])])].sort();
    const relObs = journeyObservations.filter(o => ev.length && o.evidence_refs.some(er => ev.includes(er)));
    const relFric = frictions.filter(f => ev.length && f.evidence_refs.some(er => ev.includes(er)));
    const relProof = proofRequirements.filter(p => ev.length && p.evidence_refs.some(er => ev.includes(er)));
    const relTrig = triggers.filter(t => ev.length && t.evidence_refs.some(er => ev.includes(er)));
    const hasEvidence = ev.length > 0;
    const body = {
      schema_version: 'ucdm-journey-1.0.0', kind: 'RoleJourney',
      role: m.role, party_ref: m.party_ref,
      status: hasEvidence ? 'EVIDENCED' : 'UNKNOWN',
      stages: [...new Set(relObs.map(o => o.stage).filter(s => s !== 'UNKNOWN'))].sort(),
      frictions: [...new Set(relFric.map(f => f.category))].sort(),
      proof_requirements: [...new Set(relProof.map(p => p.proof_type))].sort(),
      triggers: [...new Set(relTrig.map(t => t.category))].sort(),
      evidence_refs: ev,
      note: hasEvidence ? 'role journey reconstructed from evidence attributed to this role' : 'no evidence attributed to this role — role journey UNKNOWN, NOT assumed to match other roles',
    };
    body.role_journey_id = 'jrj_' + sha256Hex(canonicalize({ ...body, role_journey_id: undefined }));
    return deepFreeze(body);
  });
  // difference flag: do roles differ on pain/trigger/proof?
  const evidenced = role_journeys.filter(r => r.status === 'EVIDENCED');
  const distinctFriction = new Set(evidenced.flatMap(r => r.frictions)).size;
  const distinctProof = new Set(evidenced.flatMap(r => r.proof_requirements)).size;
  return deepFreeze({
    schema_version: 'ucdm-journey-1.0.0', kind: 'BuyingCommitteeJourneys', status: 'ACTIVE', mode: 'B2B',
    role_journeys,
    roles_differ: evidenced.length >= 2 && (distinctFriction > 1 || distinctProof > 1),
    note: 'roles are NOT assumed to share pain, trigger, or proof requirements',
    generated_by: 'deterministic:ucdm/journey/committee',
  });
}

function validateRoleJourney(r) {
  const errors = [];
  if (r.status === 'EVIDENCED' && r.evidence_refs.length === 0) errors.push('an evidenced role journey needs evidence_refs');
  return { valid: errors.length === 0, errors };
}

module.exports = { buildBuyingCommitteeJourneys, validateRoleJourney };
