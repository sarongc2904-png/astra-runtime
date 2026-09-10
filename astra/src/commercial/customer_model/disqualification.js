'use strict';
// [ASTRA-11G §T] Negative persona / disqualification. Evidence-backed AND commercially
// relevant only. Demographic / identity exclusion categories are REJECTED. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const DISQUALIFIER_TYPES = Object.freeze([
  'NO_PROBLEM_FIT', 'OUTSIDE_SERVICE_GEOGRAPHY', 'CANNOT_IMPLEMENT', 'WRONG_USE_CASE',
  'INCOMPATIBLE_BUDGET', 'REGULATORY_INCOMPATIBILITY', 'REQUIRED_FEATURE_UNAVAILABLE',
  'NO_DECISION_AUTHORITY_AND_NO_PATH', 'EXPLICITLY_INCOMPATIBLE',
]);

// Any disqualifier that reads as demographic / identity exclusion is invalid.
const DEMOGRAPHIC_EXCLUSION_RE = /\b(women|men|woman|man|mujer|hombre|age|edad|young|old|j[oó]ven|mayor|married|single|casad|solter|income|salary|ingreso|poor|rich|low[- ]income|students?|retirees?|race|ethnic|raza|etnia|religion|religi[oó]n|gay|straight|disab|pregnan)\b/i;

// buildDisqualifiers({ businessInput }) — disqualifiers are asserted by the business with
// evidence; ASTRA validates them, it does not invent exclusion rules.
function buildDisqualifiers({ businessInput = {} } = {}) {
  const out = [];
  for (const d of (businessInput.disqualifiers || [])) {
    const type = String(d.type || '').toUpperCase();
    const evidence_refs = [...new Set(d.evidence_refs || [])].sort();
    const body = {
      schema_version: 'ucdm-customer-model-1.0.0', kind: 'Disqualifier',
      disqualifier_type: DISQUALIFIER_TYPES.includes(type) ? type : 'UNRECOGNIZED',
      description: String(d.description || ''),
      evidence_refs,
      commercially_relevant: DISQUALIFIER_TYPES.includes(type),
      rejected: !DISQUALIFIER_TYPES.includes(type) || DEMOGRAPHIC_EXCLUSION_RE.test(String(d.description || '') + ' ' + type) || evidence_refs.length === 0,
      rejection_reason: null,
    };
    if (body.rejected) {
      body.rejection_reason = !DISQUALIFIER_TYPES.includes(type) ? 'unrecognized disqualifier type'
        : DEMOGRAPHIC_EXCLUSION_RE.test(String(d.description || '') + ' ' + type) ? 'demographic / identity exclusion is not permitted'
          : 'no supporting evidence';
    }
    body.disqualifier_id = 'dq_' + sha256Hex(canonicalize({ ...body, disqualifier_id: undefined }));
    out.push(deepFreeze(body));
  }
  return out;
}

function validateDisqualifier(d) {
  const errors = [];
  if (d.rejected && d.disqualifier_type !== 'UNRECOGNIZED' && !d.rejection_reason) errors.push('a rejected disqualifier must carry a rejection_reason');
  if (!d.rejected) {
    if (!DISQUALIFIER_TYPES.includes(d.disqualifier_type)) errors.push(`accepted disqualifier has bad type "${d.disqualifier_type}"`);
    if (d.evidence_refs.length === 0) errors.push('accepted disqualifier needs evidence');
    if (DEMOGRAPHIC_EXCLUSION_RE.test(d.description + ' ' + d.disqualifier_type)) errors.push('accepted disqualifier reads as demographic exclusion');
  }
  return { valid: errors.length === 0, errors };
}

module.exports = { DISQUALIFIER_TYPES, DEMOGRAPHIC_EXCLUSION_RE, buildDisqualifiers, validateDisqualifier };
