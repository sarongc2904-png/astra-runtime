'use strict';
// [ASTRA-11G §O §P] B2B buying committee. Controlled role taxonomy. A role is explicit or
// analytical-with-evidence. Decision authority is NEVER derived from job title alone.
// One person does not automatically hold every role. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const BUYING_ROLES = Object.freeze(['DECISION_MAKER', 'ECONOMIC_BUYER', 'CHAMPION', 'END_USER', 'INFLUENCER', 'GATEKEEPER', 'BLOCKER', 'UNKNOWN']);
const ROLE_BASIS = Object.freeze(['OBSERVED', 'ANALYTICAL', 'UNKNOWN']);

// buildBuyingCommittee({ mode, businessInput })
//   businessInput.buying_roles: [{ role, party_ref, job_title?, authority_evidence_refs?, evidence_refs? }]
function buildBuyingCommittee({ mode = 'B2C', businessInput = {} }) {
  if (mode !== 'B2B') {
    return deepFreeze({ schema_version: 'ucdm-customer-model-1.0.0', kind: 'BuyingCommittee', status: 'NOT_APPLICABLE', mode, members: [], note: 'B2C — single individual buying unit' });
  }
  const members = [];
  for (const r of (businessInput.buying_roles || [])) {
    const role = BUYING_ROLES.includes(String(r.role).toUpperCase()) ? String(r.role).toUpperCase() : 'UNKNOWN';
    const authorityEv = [...new Set(r.authority_evidence_refs || [])].sort();
    const generalEv = [...new Set(r.evidence_refs || [])].sort();
    // authority-bearing roles need explicit authority evidence; title alone => ANALYTICAL
    const authorityRole = ['DECISION_MAKER', 'ECONOMIC_BUYER'].includes(role);
    let basis, authority_confirmed, note;
    if (authorityRole && authorityEv.length === 0) {
      basis = 'ANALYTICAL'; authority_confirmed = false;
      note = r.job_title ? `job title "${r.job_title}" alone does not prove decision authority` : 'no authority evidence supplied';
    } else if (generalEv.length || authorityEv.length) {
      basis = 'OBSERVED'; authority_confirmed = authorityRole ? authorityEv.length > 0 : null;
      note = 'role supported by explicit evidence';
    } else {
      basis = 'UNKNOWN'; authority_confirmed = false; note = 'role asserted without evidence';
    }
    const body = {
      schema_version: 'ucdm-customer-model-1.0.0', kind: 'BuyingRole',
      role, party_ref: r.party_ref == null ? null : String(r.party_ref),
      job_title: r.job_title == null ? null : String(r.job_title),
      basis, authority_confirmed,
      evidence_refs: [...new Set([...generalEv, ...authorityEv])].sort(),
      authority_evidence_refs: authorityEv,
      note,
    };
    body.role_id = 'brole_' + sha256Hex(canonicalize({ ...body, role_id: undefined }));
    members.push(deepFreeze(body));
  }
  // distinct parties -> committee is multi-person unless the business explicitly says otherwise
  const parties = new Set(members.map(m => m.party_ref).filter(Boolean));
  return deepFreeze({
    schema_version: 'ucdm-customer-model-1.0.0', kind: 'BuyingCommittee', status: 'ACTIVE', mode: 'B2B',
    members, distinct_parties: parties.size,
    single_person_committee: parties.size === 1 && members.length > 1 ? (businessInput.single_person_committee === true) : (parties.size <= 1 && members.length <= 1),
    roles_present: [...new Set(members.map(m => m.role))].sort(),
    note: 'multiple roles are supported; do not assume one person holds all roles',
    generated_by: 'deterministic:ucdm/customer_model/buying_roles',
  });
}

function validateBuyingRole(r) {
  const errors = [];
  if (!BUYING_ROLES.includes(r.role)) errors.push(`bad buying role "${r.role}"`);
  if (['DECISION_MAKER', 'ECONOMIC_BUYER'].includes(r.role) && r.authority_confirmed === true && r.authority_evidence_refs.length === 0) errors.push('confirmed decision authority needs authority_evidence_refs (job title is not enough)');
  if (r.basis === 'OBSERVED' && r.evidence_refs.length === 0) errors.push('OBSERVED role basis needs evidence_refs');
  return { valid: errors.length === 0, errors };
}

module.exports = { BUYING_ROLES, ROLE_BASIS, buildBuyingCommittee, validateBuyingRole };
