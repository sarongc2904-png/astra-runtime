'use strict';
// [ASTRA-11G §U] Persona conflicts. Meaningful differences are NOT averaged away. A conflict
// may indicate that there are actually multiple segments. Reuses the ASTRA-11F contradiction
// signal — it does not build a parallel one. CONSISTENT / MIXED / POLARIZED / INSUFFICIENT.
// No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const PERSONA_CONFLICT_STATUS = Object.freeze(['CONSISTENT', 'MIXED', 'POLARIZED', 'INSUFFICIENT']);

// Opposing concept themes for persona-level conflict (superset of ASTRA-11F pairs).
const CONFLICT_THEMES = Object.freeze([
  { theme: 'price', a: 'PRICE_CONCERN', b: 'PRICE_ACCEPTANCE', a_label: 'price sensitive', b_label: 'premium / value seeking' },
  { theme: 'pain', a: 'PAIN_FEAR', b: 'PAIN_EXPERIENCED', a_label: 'anticipated pain', b_label: 'actual experience' },
  { theme: 'results', a: 'RESULTS_UNCERTAINTY', b: 'QUALITY_PRAISE', a_label: 'doubts results', b_label: 'satisfied with results' },
  { theme: 'responsiveness', a: 'RESPONSIVENESS_COMPLAINT', b: 'QUALITY_PRAISE', a_label: 'poor responsiveness', b_label: 'positive experience' },
]);

// detectPersonaConflicts({ vocResult }) -> [PersonaConflict]
function detectPersonaConflicts({ vocResult = {} }) {
  const obs = (vocResult.observations || []).filter(o => o.status === 'OBSERVED');
  const byConcept = {};
  for (const o of obs) (byConcept[o.normalized_concept] = byConcept[o.normalized_concept] || []).push(o);

  const out = [];
  for (const t of CONFLICT_THEMES) {
    const A = byConcept[t.a] || [], B = byConcept[t.b] || [];
    const na = new Set(A.map(o => `${o.source_ref}::${o.exact_span.text.toLowerCase()}`)).size;
    const nb = new Set(B.map(o => `${o.source_ref}::${o.exact_span.text.toLowerCase()}`)).size;
    const total = na + nb;
    let status;
    if (total < 3) status = 'INSUFFICIENT';
    else if (na === 0 || nb === 0) status = 'CONSISTENT';
    else {
      const minor = Math.min(na, nb) / total;
      status = minor >= 0.35 ? 'POLARIZED' : 'MIXED';
    }
    if (status === 'CONSISTENT' && total === 0) continue;
    const speakersA = new Set(A.map(o => o.speaker_pseudonym).filter(Boolean));
    const speakersB = new Set(B.map(o => o.speaker_pseudonym).filter(Boolean));
    const body = {
      schema_version: 'ucdm-customer-model-1.0.0', kind: 'PersonaConflict',
      theme: t.theme, side_a: { concept: t.a, label: t.a_label, count: na, speakers: [...speakersA].sort() },
      side_b: { concept: t.b, label: t.b_label, count: nb, speakers: [...speakersB].sort() },
      status,
      likely_multiple_segments: ['MIXED', 'POLARIZED'].includes(status),
      evidence_refs: [...new Set([...A, ...B].flatMap(o => o.evidence_refs))].sort(),
      note: ['MIXED', 'POLARIZED'].includes(status)
        ? 'meaningful disagreement preserved — do NOT average; this likely indicates 2+ distinct segments'
        : 'no material conflict on this theme',
      source: 'reuses ASTRA-11F contradiction signal',
      generated_by: 'deterministic:ucdm/customer_model/conflicts',
    };
    body.conflict_id = 'pconf_' + sha256Hex(canonicalize({ ...body, conflict_id: undefined }));
    out.push(deepFreeze(body));
  }
  return out;
}

function validatePersonaConflict(c) {
  const errors = [];
  if (!PERSONA_CONFLICT_STATUS.includes(c.status)) errors.push(`bad conflict status "${c.status}"`);
  if (['MIXED', 'POLARIZED'].includes(c.status) && c.evidence_refs.length === 0) errors.push('a material conflict needs evidence');
  if (['MIXED', 'POLARIZED'].includes(c.status) && c.likely_multiple_segments !== true) errors.push('a material conflict must be flagged as likely multiple segments');
  return { valid: errors.length === 0, errors };
}

module.exports = { PERSONA_CONFLICT_STATUS, CONFLICT_THEMES, detectPersonaConflicts, validatePersonaConflict };
