'use strict';
// [ASTRA-11E §J] Competitor strength / weakness HYPOTHESES — never facts. Absence of
// observed evidence is NEVER converted to "competitor lacks X" unless coverage supports it.
// No LLM, no web, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const { assess } = require('../validation/confidence');

const HYPO_STATUS = Object.freeze(['HYPOTHESIS']);

function mk(kind, input) {
  const b = {
    schema_version: 'ucdm-competitor-1.0.0',
    kind, // 'CompetitorStrengthHypothesis' | 'CompetitorWeaknessHypothesis'
    is_fact: false,
    competitor_ref: input.competitor_ref,
    statement: String(input.statement || ''),
    supporting_evidence_refs: [...new Set(input.supporting_evidence_refs || [])].sort(),
    contradicting_evidence_refs: [...new Set(input.contradicting_evidence_refs || [])].sort(),
    scope: input.scope || 'SAMPLE',
    confidence: input.confidence,
    validation_needed: [...(input.validation_needed || ['confirm against a larger competitor + surface sample'])],
    status: 'HYPOTHESIS',
    coverage_supports_absence: input.coverage_supports_absence == null ? null : !!input.coverage_supports_absence,
    produced_by: 'deterministic:ucdm/competitor',
  };
  b.hypothesis_id = 'cmhyp_' + sha256Hex(canonicalize({ ...b, hypothesis_id: undefined, confidence: b.confidence && b.confidence.content_hash }));
  return deepFreeze(b);
}

// deriveHypotheses({ profile, attributes, proofProfile, messageProfile, offerProfile, matrixCoverageOk })
//   matrixCoverageOk: deterministic flag — is the sample big enough to reason about absence?
function deriveHypotheses({ profile, attributes = [], proofProfile, messageProfile, offerProfile, coverageSupportsAbsence = false }) {
  const ref = profile.competitor_ref;
  const out = [];
  const evAll = profile.evidence_refs;
  const conf = (cov) => assess({ evidence_count: evAll.length, distinct_sources: profile.source_refs.length, newest_evidence_age_days: 90, coverage: cov, agree_count: 1, conflict_count: 0, data_quality: 0.55 });

  // STRENGTH: strong proof architecture
  if (proofProfile && proofProfile.proof_count >= 2) {
    out.push(mk('CompetitorStrengthHypothesis', { competitor_ref: ref, statement: `${profile.name} shows a multi-element proof architecture (${proofProfile.proof_types_present.join(', ')}).`, supporting_evidence_refs: proofProfile.items.flatMap(i => i.evidence_refs), confidence: conf(0.7), validation_needed: ['compare proof depth to the full competitor set'] }));
  }
  // STRENGTH: high review volume (independent)
  const indep = (proofProfile && proofProfile.items || []).filter(i => i.veracity === 'INDEPENDENT_EVIDENCE');
  if (indep.length) out.push(mk('CompetitorStrengthHypothesis', { competitor_ref: ref, statement: `${profile.name} has independently-verifiable review/rating signal.`, supporting_evidence_refs: indep.flatMap(i => i.evidence_refs), confidence: conf(0.6) }));
  // STRENGTH: price transparency
  if (attributes.some(a => a.attribute === 'price' && a.kind === 'OBSERVED')) out.push(mk('CompetitorStrengthHypothesis', { competitor_ref: ref, statement: `${profile.name} publishes price (price transparency).`, supporting_evidence_refs: attributes.filter(a => a.attribute === 'price').flatMap(a => a.evidence_refs), confidence: conf(0.6) }));

  // WEAKNESS (only when coverage supports absence): weak differentiation
  if (coverageSupportsAbsence && !attributes.some(a => a.attribute === 'differentiator' && a.kind === 'OBSERVED') && !attributes.some(a => a.attribute === 'mechanism' && a.kind === 'OBSERVED')) {
    out.push(mk('CompetitorWeaknessHypothesis', { competitor_ref: ref, statement: `No differentiator or mechanism messaging observed for ${profile.name} across a sample where peers show it — possible weak differentiation.`, supporting_evidence_refs: evAll, contradicting_evidence_refs: [], confidence: conf(0.4), coverage_supports_absence: true, validation_needed: ['review the full site, not just the observed surface'] }));
  }
  // WEAKNESS: weak CTA clarity
  const ctaMsgs = (messageProfile && messageProfile.items || []).filter(i => i.message_field === 'cta');
  if (coverageSupportsAbsence && ctaMsgs.length === 0) out.push(mk('CompetitorWeaknessHypothesis', { competitor_ref: ref, statement: `No CTA observed for ${profile.name} in a sample where peers show one — possible weak CTA clarity.`, supporting_evidence_refs: evAll, confidence: conf(0.35), coverage_supports_absence: true }));
  // WEAKNESS: limited offer variety
  if (offerProfile && offerProfile.offer_count === 1) out.push(mk('CompetitorWeaknessHypothesis', { competitor_ref: ref, statement: `Only one offer surface observed for ${profile.name} — possible limited offer variety (sample-bounded).`, supporting_evidence_refs: (offerProfile.offers[0] || {}).evidence_refs || [], confidence: conf(0.4) }));

  return out;
}

function validateHypothesis(h) {
  const errors = [];
  if (h.is_fact !== false) errors.push('a strength/weakness hypothesis is never a fact');
  if (h.status !== 'HYPOTHESIS') errors.push(`status must be HYPOTHESIS (got "${h.status}")`);
  if (/lacks|does not have|missing/i.test(h.statement) && h.coverage_supports_absence !== true) errors.push('an absence claim requires coverage_supports_absence = true');
  if (!h.confidence || h.confidence.produced_by !== 'deterministic:ucdm/confidence') errors.push('hypothesis needs a deterministic ConfidenceAssessment');
  return { valid: errors.length === 0, errors };
}

module.exports = { HYPO_STATUS, deriveHypotheses, validateHypothesis };
