'use strict';
// [ASTRA-11E §G] Competitor proof mechanisms. The engine NEVER validates the truth of a
// proof just because the competitor publishes it. Every proof carries a veracity label:
//   PUBLISHED_PROOF        — the competitor asserts it (default for competitor-sourced)
//   INDEPENDENT_EVIDENCE   — corroborated by a non-competitor source (e.g. a platform rating)
//   UNKNOWN_VERACITY       — present but not independently checkable
// No LLM, no web, no I/O.
const { canonicalize, sha256Hex, deepFreeze, nfcLF } = require('../validation/canonical');

const PROOF_TYPES = Object.freeze(['testimonial', 'review', 'rating', 'case_study', 'client_logo', 'before_after', 'quantified_result', 'credential', 'certification', 'guarantee', 'social_proof', 'authority', 'demonstration']);
const VERACITY = Object.freeze(['PUBLISHED_PROOF', 'INDEPENDENT_EVIDENCE', 'UNKNOWN_VERACITY']);

const QUANT_RE = /(\+?\s?\d[\d.,]*)\s*(pacientes|clientes|alumnos|casos|años|anos|reseñas|resenas|estrellas)/i;

// buildProofProfile({ profile, messageObs, facts, envelopesBySource })
function buildProofProfile({ profile, messageObs = [], facts = [], envelopesBySource = {} }) {
  const ref = profile.competitor_ref;
  const items = [];

  // proof-typed message fields (competitor-published)
  for (const m of messageObs.filter(x => x.subject_ref === ref && x.message_field === 'proof')) {
    const t = nfcLF(m.verbatim_text || '');
    const qm = QUANT_RE.exec(t);
    items.push(mk({
      proof_type: /antes y después|antes y despues/i.test(t) ? 'before_after' : qm ? 'quantified_result' : /años|anos|experiencia/i.test(t) ? 'authority' : 'testimonial',
      claim: m.verbatim_text,
      source_ref: m.source_ref,
      evidence_refs: m.evidence_refs,
      quantity: qm ? qm[1].replace(/\s/g, '') : null,
      veracity: 'PUBLISHED_PROOF',
    }));
  }
  // ratings/review counts — from a REVIEW-category source => INDEPENDENT of the competitor's own page
  for (const f of facts.filter(x => x.subject_ref === ref && (x.fact_type === 'RATING' || x.fact_type === 'REVIEW_COUNT'))) {
    const env = envelopesBySource[f.source_ref];
    const independent = env && env.source_category === 'REVIEW';
    items.push(mk({
      proof_type: f.fact_type === 'RATING' ? 'rating' : 'review',
      claim: f.value,
      source_ref: f.source_ref,
      evidence_refs: f.evidence_refs,
      quantity: f.fact_type === 'RATING' ? (f.value && f.value.score) : (f.value && f.value.count),
      veracity: independent ? 'INDEPENDENT_EVIDENCE' : 'UNKNOWN_VERACITY',
      observed_at: f.observed_at,
    }));
  }
  // guarantee as a proof/risk mechanism
  for (const f of facts.filter(x => x.subject_ref === ref && x.fact_type === 'OBSERVED_GUARANTEE')) {
    items.push(mk({ proof_type: 'guarantee', claim: f.value, source_ref: f.source_ref, evidence_refs: f.evidence_refs, quantity: null, veracity: 'PUBLISHED_PROOF' }));
  }

  const body = {
    schema_version: 'ucdm-competitor-1.0.0',
    competitor_ref: ref,
    proof_count: items.length,
    items,
    proof_types_present: [...new Set(items.map(i => i.proof_type))].sort(),
    has_independent_evidence: items.some(i => i.veracity === 'INDEPENDENT_EVIDENCE'),
    note: 'presence of a proof is observed; its truth is NOT asserted',
  };
  body.proof_profile_id = 'cmprf_' + sha256Hex(canonicalize({ ...body, proof_profile_id: undefined }));
  return deepFreeze(body);

  function mk(p) {
    const b = { schema_version: 'ucdm-competitor-1.0.0', ...p, evidence_refs: [...new Set(p.evidence_refs || [])].sort(), freshness: p.observed_at || null };
    b.proof_id = 'cmproof_' + sha256Hex(canonicalize({ ...b, proof_id: undefined }));
    return deepFreeze(b);
  }
}

function validateProofItem(p) {
  const errors = [];
  if (!PROOF_TYPES.includes(p.proof_type)) errors.push(`unknown proof_type "${p.proof_type}"`);
  if (!VERACITY.includes(p.veracity)) errors.push(`bad veracity "${p.veracity}"`);
  if (p.veracity === 'INDEPENDENT_EVIDENCE' && p.evidence_refs.length === 0) errors.push('INDEPENDENT_EVIDENCE needs evidence_refs');
  if ('truth' in p || 'is_true' in p || 'verified_true' in p) errors.push('a proof profile must not assert the truth of a proof');
  return { valid: errors.length === 0, errors };
}

module.exports = { PROOF_TYPES, VERACITY, buildProofProfile, validateProofItem };
