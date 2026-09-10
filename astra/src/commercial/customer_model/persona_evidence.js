'use strict';
// [ASTRA-11G §I] Persona Evidence Map. Every material Persona property traces backward:
//   Persona field -> CustomerAttributeEvidence / VOC Pattern -> Observation -> Utterance
//   -> Evidence -> Source. Fail closed on dangling refs. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const MATERIAL_FIELDS = Object.freeze([
  'current_situation', 'desired_situation', 'primary_problem', 'secondary_problems',
  'functional_pains', 'emotional_pains', 'desired_outcomes', 'fears', 'objections',
  'reasons_to_buy', 'reasons_not_to_buy', 'awareness', 'urgency', 'budget_signal',
  'proof_needed', 'friction', 'buying_language_refs',
]);

// buildPersonaEvidenceMap(persona, { observations, utterances, vocResult })
function buildPersonaEvidenceMap(persona, { observations = [], utterances = [], vocResult = {} }) {
  const obsById = Object.fromEntries(observations.map(o => [o.observation_id, o]));
  const obsByEvidence = {};
  for (const o of observations) for (const er of o.evidence_refs) (obsByEvidence[er] = obsByEvidence[er] || []).push(o);
  const uttByHash = Object.fromEntries(utterances.map(u => [u.content_hash, u]));

  const chains = [];
  const dangling = [];
  for (const field of MATERIAL_FIELDS) {
    const f = persona[field];
    if (!f || f.status === 'UNKNOWN') continue;
    const rows = Array.isArray(f) ? f : [f];
    for (const r of rows) {
      for (const er of (r.evidence_refs || [])) {
        const os = obsByEvidence[er] || [];
        if (os.length === 0) { dangling.push(`${field} -> evidence ${er} resolves to no observation`); continue; }
        for (const o of os) {
          const u = uttByHash[o.utterance_ref] || null;
          if (!u) { dangling.push(`${field} -> observation ${o.observation_id} -> missing utterance ${o.utterance_ref}`); continue; }
          chains.push({
            persona_field: field,
            value: r.concept || r.stage || r.signal || r.level || null,
            attribute_or_pattern: r.concept ? `concept:${r.concept}` : `field:${field}`,
            observation_id: o.observation_id,
            utterance_ref: o.utterance_ref,
            evidence_ref: er,
            source_ref: o.source_ref || u.source_ref || null,
            span: o.exact_span ? o.exact_span.text : null,
          });
        }
      }
    }
  }
  chains.sort((a, b) => (a.persona_field + a.evidence_ref < b.persona_field + b.evidence_ref ? -1 : 1));
  const body = {
    schema_version: 'ucdm-customer-model-1.0.0', kind: 'PersonaEvidenceMap',
    persona_ref: persona.persona_id,
    chain_count: chains.length,
    chains,
    dangling_refs: dangling.sort(),
    evidence_graph_valid: dangling.length === 0,
    generated_by: 'deterministic:ucdm/customer_model/persona_evidence',
  };
  body.evidence_map_id = 'pem_' + sha256Hex(canonicalize({ ...body, evidence_map_id: undefined }));
  return deepFreeze(body);
}

function validatePersonaEvidenceMap(m) {
  const errors = [];
  if (!m.evidence_graph_valid) errors.push(`persona evidence graph invalid: ${m.dangling_refs.join(' | ')}`);
  return { valid: errors.length === 0, errors };
}

module.exports = { MATERIAL_FIELDS, buildPersonaEvidenceMap, validatePersonaEvidenceMap };
