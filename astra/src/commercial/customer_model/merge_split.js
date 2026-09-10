'use strict';
// [ASTRA-11G §V] Persona merge / split. Personas are NOT merged because labels sound
// similar. Similarity is computed deterministically over CANONICAL ATTRIBUTES only. If
// meaningful conflicts exist, separate persona candidates are preserved. No automatic
// destructive merge — the strongest outcome is a suggestion. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const MERGE_STATUS = Object.freeze(['KEEP_SEPARATE', 'MERGE_SUPPORTED', 'REVIEW_REQUIRED']);

const CANONICAL_ATTR_FIELDS = ['primary_problem', 'functional_pains', 'emotional_pains', 'desired_outcomes', 'fears', 'objections', 'decision_criteria', 'triggers', 'alternatives', 'reasons_to_buy', 'reasons_not_to_buy'];

function conceptSet(persona, field) {
  const f = persona[field];
  if (!f || f.status === 'UNKNOWN') return new Set();
  if (Array.isArray(f)) return new Set(f.map(x => x.concept || x).filter(Boolean));
  return new Set([f.concept].filter(Boolean));
}

// assessMergeSplit(personaA, personaB, { conflicts }) -> frozen MergeSplitAssessment
function assessMergeSplit(personaA, personaB, { conflicts = [] } = {}) {
  let inter = 0, uni = 0;
  const perField = {};
  for (const field of CANONICAL_ATTR_FIELDS) {
    const a = conceptSet(personaA, field), b = conceptSet(personaB, field);
    const i = [...a].filter(x => b.has(x)).length;
    const u = new Set([...a, ...b]).size;
    perField[field] = { intersection: i, union: u, jaccard: u ? Number((i / u).toFixed(3)) : null };
    inter += i; uni += u;
  }
  const attribute_similarity = uni ? Number((inter / uni).toFixed(4)) : 0;
  const label_similarity = tokenJaccard(personaA.label, personaB.label);

  // meaningful conflict between the two = any MIXED/POLARIZED persona conflict
  const materialConflict = conflicts.some(c => ['MIXED', 'POLARIZED'].includes(c.status));

  let status, reason;
  if (materialConflict) { status = 'REVIEW_REQUIRED'; reason = 'meaningful persona conflict present — separate candidates preserved, human review required'; }
  else if (attribute_similarity >= 0.6) { status = 'MERGE_SUPPORTED'; reason = 'high canonical-attribute overlap and no material conflict'; }
  else { status = 'KEEP_SEPARATE'; reason = 'insufficient canonical-attribute overlap'; }

  const body = {
    schema_version: 'ucdm-customer-model-1.0.0', kind: 'MergeSplitAssessment',
    persona_a: personaA.persona_id, persona_b: personaB.persona_id,
    attribute_similarity, label_similarity, per_field: perField,
    material_conflict: materialConflict,
    status, reason,
    destructive_merge_performed: false,
    note: 'label similarity is reported but never drives the decision; no persona is merged automatically',
    generated_by: 'deterministic:ucdm/customer_model/merge_split',
  };
  body.assessment_id = 'pms_' + sha256Hex(canonicalize({ ...body, assessment_id: undefined }));
  return deepFreeze(body);
}

function tokenJaccard(a, b) {
  const ta = new Set(String(a).toLowerCase().split(/\W+/).filter(Boolean));
  const tb = new Set(String(b).toLowerCase().split(/\W+/).filter(Boolean));
  const i = [...ta].filter(x => tb.has(x)).length;
  const u = new Set([...ta, ...tb]).size;
  return u ? Number((i / u).toFixed(4)) : 0;
}

function validateMergeSplit(m) {
  const errors = [];
  if (!MERGE_STATUS.includes(m.status)) errors.push(`bad merge status "${m.status}"`);
  if (m.material_conflict && m.status !== 'REVIEW_REQUIRED') errors.push('a material conflict must yield REVIEW_REQUIRED');
  if (m.destructive_merge_performed !== false) errors.push('no destructive merge may be performed');
  if (m.status === 'MERGE_SUPPORTED' && m.attribute_similarity < 0.6) errors.push('MERGE_SUPPORTED requires real canonical-attribute overlap, not label similarity');
  return { valid: errors.length === 0, errors };
}

module.exports = { MERGE_STATUS, CANONICAL_ATTR_FIELDS, assessMergeSplit, validateMergeSplit };
