'use strict';
// [ASTRA-11H §J] Journey alternatives. Reuses ASTRA-11F VocAlternative — NO parallel system.
// Competitor consideration is NEVER assumed without evidence. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const ALTERNATIVE_TYPES = Object.freeze(['COMPETITOR', 'DIY', 'DO_NOTHING', 'DELAY', 'INTERNAL_SOLUTION', 'OTHER_CATEGORY', 'UNKNOWN']);

const VOC_ALT_MAP = Object.freeze({
  competitor: 'COMPETITOR', diy: 'DIY', do_nothing: 'DO_NOTHING', wait: 'DELAY',
  cheaper_option: 'COMPETITOR', different_category: 'OTHER_CATEGORY', existing_provider: 'INTERNAL_SOLUTION',
  referral: 'COMPETITOR', manual_process: 'DIY',
});

function buildAlternatives({ vocResult }) {
  const out = [];
  for (const a of (vocResult.alternatives || [])) {
    const type = VOC_ALT_MAP[a.alternative_type] || 'UNKNOWN';
    const body = {
      schema_version: 'ucdm-journey-1.0.0', kind: 'JourneyAlternative',
      alternative_type: type, voc_alternative_type: a.alternative_type,
      verbatim_span: a.verbatim_span || null,
      resolved_competitor_id: null, // never auto-resolved (inherited from ASTRA-11F rule)
      stage: 'ALTERNATIVE_COMPARISON',
      evidence_refs: [...new Set(a.evidence_refs || [])].sort(),
      source_ref: a.source_ref || null, speaker_pseudonym: a.speaker_pseudonym || null,
      status: ['CUSTOMER', 'PROSPECT', 'FORMER_CUSTOMER'].includes(a.speaker_role) ? 'OBSERVED' : 'ANALYTICAL',
      grounded_in_evidence: (a.evidence_refs || []).length > 0,
      generated_by: 'deterministic:ucdm/journey',
    };
    body.alternative_id = 'jal_' + sha256Hex(canonicalize({ ...body, alternative_id: undefined }));
    out.push(deepFreeze(body));
  }
  return out;
}

function validateAlternative(a) {
  const errors = [];
  if (!ALTERNATIVE_TYPES.includes(a.alternative_type)) errors.push(`bad alternative_type "${a.alternative_type}"`);
  if (a.alternative_type !== 'UNKNOWN' && (!a.grounded_in_evidence || a.evidence_refs.length === 0)) errors.push('a known alternative must be evidence-backed (no assumed competitor consideration)');
  if (a.resolved_competitor_id) errors.push('competitor identity must not be auto-resolved');
  return { valid: errors.length === 0, errors };
}

module.exports = { ALTERNATIVE_TYPES, VOC_ALT_MAP, buildAlternatives, validateAlternative };
