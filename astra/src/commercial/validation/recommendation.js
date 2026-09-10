'use strict';
// [ASTRA-11B] Recommendation contract (ASTRA-11B section J).
// Recommendation *text* may be LLM-authored. Its evidence/metric references and its
// prioritization inputs are validated + computed deterministically here.
// Pure functions. No I/O, no LLM, no network.
const { pv } = require('../provenance/provenance');
const { validateEntity } = require('./validate_entity');

const LEVEL = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4, UNKNOWN: 0, VERY_LOW: 0, VERY_HIGH: 4 };
const PRODUCER = 'deterministic:ucdm/recommendation';

// Deterministic priority: higher impact, lower effort, higher confidence, higher severity
// -> higher priority. Fixed formula; the weighting is documented and stable.
function computePriority({ impact, effort, severity, confidence_score }) {
  const i = LEVEL[String(impact).toUpperCase()] || 0;
  const e = LEVEL[String(effort).toUpperCase()] || 0;
  const s = LEVEL[String(severity).toUpperCase()] || 0;
  const c = typeof confidence_score === 'number' ? Math.max(0, Math.min(1, confidence_score)) : 0.5;
  // effort penalty: LOW effort (1) -> divisor ~1, HIGH effort (3) -> divisor ~2
  const effortDivisor = 1 + (e - 1) * 0.5;
  const raw = ((i * 2) + s) * (0.5 + c) / (effortDivisor || 1);
  const score = Number(raw.toFixed(6));
  return pv(score, 'COMPUTED', { produced_by: PRODUCER, transform: PRODUCER });
}

// Evidence integrity for a recommendation: every insight_ref must resolve to a registered
// Insight-like node in the evidence graph, and every evidence_ref must resolve. Fail closed.
function validateRecommendationIntegrity(rec, { evidenceGraph } = {}) {
  const errors = [];
  const structural = validateEntity('Recommendation', rec, { evidenceGraph });
  if (!structural.valid) errors.push(...structural.errors);

  if (evidenceGraph) {
    for (const r of rec.evidence_refs || []) {
      try { evidenceGraph.resolveRef(r); } catch (e) { errors.push(`evidence integrity: ${e.message}`); }
    }
    for (const iref of rec.insight_refs || []) {
      if (!evidenceGraph.entities.has(String(iref))) errors.push(`insight ref "${iref}" not registered in the evidence graph (fail closed)`);
    }
  }
  // priority, if present, must be a COMPUTED ProvenanceValue from this module (not LLM)
  if (rec.priority != null) {
    const p = rec.priority;
    if (!p || p.source_class !== 'COMPUTED' || !String(p.produced_by || '').startsWith('deterministic:')) {
      errors.push('priority must be a COMPUTED deterministic ProvenanceValue — never LLM-authored');
    }
  }
  return { valid: errors.length === 0, errors };
}

module.exports = { computePriority, validateRecommendationIntegrity, PRODUCER };
