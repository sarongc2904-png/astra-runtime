'use strict';
// [ASTRA-11E §N] CompetitorDifferentiationGap — a HYPOTHESIS, never a fact. White space is
// NEVER labeled profitable without validation. No LLM, no web, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const { assess } = require('../validation/confidence');

const GAP_TYPES = Object.freeze(['message_gap', 'offer_gap', 'proof_gap', 'audience_gap', 'mechanism_gap', 'channel_gap', 'price_position_gap', 'service_gap', 'experience_gap']);
const GAP_STATUS = Object.freeze(['HYPOTHESIS', 'VALIDATION_NEEDED']);

function mk(input) {
  const b = {
    schema_version: 'ucdm-competitor-1.0.0',
    kind: 'CompetitorDifferentiationGap',
    is_fact: false,
    gap_type: input.gap_type,
    hypothesis: String(input.hypothesis || ''),
    supporting_evidence_refs: [...new Set(input.supporting_evidence_refs || [])].sort(),
    contradicting_evidence_refs: [...new Set(input.contradicting_evidence_refs || [])].sort(),
    sample_coverage: input.sample_coverage,
    confidence: input.confidence,
    profitability: 'UNVALIDATED',            // never "profitable" without validation
    validation_needed: [...(input.validation_needed || ['test demand for the un-occupied position before acting'])],
    status: 'VALIDATION_NEEDED',
    produced_by: 'deterministic:ucdm/competitor',
  };
  b.gap_id = 'cmdgap_' + sha256Hex(canonicalize({ ...b, gap_id: undefined, confidence: b.confidence && b.confidence.content_hash }));
  return deepFreeze(b);
}

// deriveDifferentiationGaps({ profiles, marketSaturation, messageSaturation, matrix, coverage })
// Conservative deterministic heuristics over the saturation frequencies. A pattern that is
// rare across the observed sample (< 34%) is a candidate white space — hypothesis only.
function deriveDifferentiationGaps({ marketSaturation, messageSaturation, coverage }) {
  const n = marketSaturation.sample_size;
  const cov = coverage ? coverage.competitors_observed : n;
  const out = [];
  const sampleCoverage = { competitors_observed: cov, note: cov < 4 ? 'thin sample — gap is low-confidence' : 'moderate sample' };

  for (const p of marketSaturation.patterns) {
    if (p.frequency < 0.34) {
      out.push(mk({
        gap_type: mapPatternToGapType(p.pattern),
        hypothesis: `Only ${p.competitor_count}/${p.sample_size} observed competitors use "${p.pattern}" — possible un-occupied position.`,
        supporting_evidence_refs: p.evidence_refs,
        sample_coverage: sampleCoverage,
        confidence: assess({ evidence_count: Math.max(2, p.evidence_refs.length), distinct_sources: Math.min(cov, 3), newest_evidence_age_days: 90, coverage: p.frequency < 0.15 ? 0.5 : 0.35, agree_count: 1, conflict_count: 0, data_quality: 0.5 }),
      }));
    }
  }
  // message-pattern gaps
  for (const p of messageSaturation.patterns) {
    if (p.label !== 'UNKNOWN' && p.frequency < 0.34) {
      out.push(mk({
        gap_type: 'message_gap',
        hypothesis: `Message pattern "${p.label}" appears for only ${p.competitor_count}/${p.sample_size} observed competitors.`,
        supporting_evidence_refs: p.evidence_refs,
        sample_coverage: sampleCoverage,
        confidence: assess({ evidence_count: Math.max(2, p.evidence_refs.length), distinct_sources: Math.min(cov, 3), newest_evidence_age_days: 90, coverage: 0.35, agree_count: 1, conflict_count: 0, data_quality: 0.5 }),
      }));
    }
  }
  return out;
}
function mapPatternToGapType(pattern) {
  const m = { price_messaging: 'price_position_gap', discount_led: 'price_position_gap', financing: 'offer_gap', guarantee: 'offer_gap', same_day_messaging: 'service_gap', free_consultation: 'offer_gap', testimonial_use: 'proof_gap', before_after_use: 'proof_gap', whatsapp_cta: 'channel_gap', technology_led: 'mechanism_gap' };
  return m[pattern] || 'message_gap';
}

function validateGap(g) {
  const errors = [];
  if (g.is_fact !== false) errors.push('a differentiation gap is never a fact');
  if (!GAP_TYPES.includes(g.gap_type)) errors.push(`unknown gap_type "${g.gap_type}"`);
  if (!GAP_STATUS.includes(g.status)) errors.push(`status "${g.status}" not allowed`);
  if (g.profitability !== 'UNVALIDATED') errors.push('white space must not be labeled profitable without validation');
  return { valid: errors.length === 0, errors };
}

module.exports = { GAP_TYPES, GAP_STATUS, deriveDifferentiationGaps, validateGap };
