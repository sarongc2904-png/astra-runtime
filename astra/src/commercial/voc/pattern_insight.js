'use strict';
// [ASTRA-11F §R §T §U] Contradiction/polarization, VocPattern, CustomerInsight.
// Contradictions are preserved (CONSENSUS/MIXED/POLARIZED/INSUFFICIENT). Patterns are
// evidence-backed. Insights are ANALYTICAL and never facts, never recommendations.
// No LLM, no web, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const { assess } = require('../validation/confidence');

const CONTRADICTION_STATUS = Object.freeze(['CONSENSUS', 'MIXED', 'POLARIZED', 'INSUFFICIENT']);
const PATTERN_STATUS = Object.freeze(['SUPPORTED', 'PARTIAL', 'MIXED', 'INSUFFICIENT']);

// §R — per cluster, classify agreement from the polarity mix.
function classifyContradiction(cluster) {
  const m = cluster.polarity_mix;
  const pos = m.POSITIVE || 0, neg = m.NEGATIVE || 0, total = pos + neg;
  let status;
  if (total < 3) status = 'INSUFFICIENT';
  else if (pos === 0 || neg === 0) status = 'CONSENSUS';
  else {
    const minor = Math.min(pos, neg) / total;
    status = minor >= 0.35 ? 'POLARIZED' : 'MIXED';
  }
  return deepFreeze({
    schema_version: 'ucdm-voc-1.0.0',
    aspect: cluster.aspect, canonical_concept: cluster.canonical_concept,
    status, positive: pos, negative: neg,
    evidence_refs: cluster.representative_quotes.flatMap(r => r.evidence_refs).sort(),
    cluster_ref: cluster.cluster_id,
    generated_by: 'deterministic:ucdm/voc',
  });
}

// §R — cross-concept polarization: opposing concepts about the same theme both present in
// the sample => customers disagree. Preserved, never collapsed.
const OPPOSING_PAIRS = Object.freeze([
  { theme: 'price', a: 'PRICE_CONCERN', b: 'PRICE_ACCEPTANCE' },
  { theme: 'pain', a: 'PAIN_FEAR', b: 'PAIN_EXPERIENCED' },
  { theme: 'responsiveness', a: 'RESPONSIVENESS_COMPLAINT', b: 'QUALITY_PRAISE' },
]);
function crossConceptContradictions(clusters) {
  const byConcept = Object.fromEntries(clusters.map(c => [c.canonical_concept, c]));
  const out = [];
  for (const p of OPPOSING_PAIRS) {
    const ca = byConcept[p.a], cb = byConcept[p.b];
    if (!ca || !cb) continue;
    const na = ca.frequency.deduped_observation_count, nb = cb.frequency.deduped_observation_count;
    const total = na + nb;
    if (total < 3) continue;
    const minor = Math.min(na, nb) / total;
    out.push(deepFreeze({
      schema_version: 'ucdm-voc-1.0.0',
      kind: 'CROSS_CONCEPT',
      theme: p.theme,
      canonical_concept: `${p.a}__VS__${p.b}`,
      aspect: 'OBJECTION',
      status: minor >= 0.35 ? 'POLARIZED' : 'MIXED',
      positive: nb, negative: na,
      cluster_refs: [ca.cluster_id, cb.cluster_id],
      evidence_refs: [...ca.representative_quotes, ...cb.representative_quotes].flatMap(r => r.evidence_refs).sort(),
      generated_by: 'deterministic:ucdm/voc',
    }));
  }
  return out;
}

// §T — VocPattern from a cluster + its contradiction status.
function buildPattern(cluster, contradiction, { minObservations = 3, minSources = 2 } = {}) {
  const f = cluster.frequency;
  let status;
  if (f.deduped_observation_count < minObservations || f.unique_source_count < minSources) status = 'INSUFFICIENT';
  else if (contradiction.status === 'POLARIZED') status = 'MIXED';
  else if (contradiction.status === 'MIXED') status = 'PARTIAL';
  else status = 'SUPPORTED';

  const body = {
    schema_version: 'ucdm-voc-1.0.0',
    pattern: labelFor(cluster.aspect, cluster.canonical_concept),
    aspect: cluster.aspect,
    canonical_concept: cluster.canonical_concept,
    cluster_refs: [cluster.cluster_id],
    supporting_observations: cluster.observation_refs,
    contradicting_observations: contradiction.status === 'CONSENSUS' ? [] : cluster.observation_refs.slice(0, contradiction.negative),
    coverage: { deduped_observation_count: f.deduped_observation_count, unique_source_count: f.unique_source_count, unique_speaker_count: f.unique_speaker_count, denominator_note: f.denominator_note },
    frequency: { observation_count: f.observation_count, deduped_observation_count: f.deduped_observation_count, unique_source_count: f.unique_source_count },
    confidence: cluster.confidence,
    scope: 'SAMPLE',
    status,
  };
  body.pattern_id = 'vocp_' + sha256Hex(canonicalize({ ...body, pattern_id: undefined, confidence: cluster.confidence.content_hash }));
  return deepFreeze(body);
}

const CONCEPT_LABEL = {
  PRICE_CONCERN: 'price concern', PRICE_ACCEPTANCE: 'price acceptance', PAIN_FEAR: 'fear of pain',
  PAIN_EXPERIENCED: 'pain experience (actual)', SPEED_NEED: 'need for speed', SLOW_SERVICE: 'slow service complaint',
  RESPONSIVENESS_COMPLAINT: 'unresponsiveness complaint', TRUST_CONCERN: 'lack of trust', RESULTS_DESIRED: 'desire for results',
  RESULTS_UNCERTAINTY: 'results uncertainty', PROCESS_UNCLEAR: 'unclear process', FINANCING_DEMAND: 'financing demand',
  GUARANTEE_DEMAND: 'guarantee demand', QUALITY_PRAISE: 'quality praise', CONVENIENCE_VALUE: 'convenience value',
};
function labelFor(aspect, concept) { return CONCEPT_LABEL[concept] || `${aspect.toLowerCase()} (${concept.toLowerCase()})`; }

// §U — CustomerInsight, analytical.
function buildInsights(patterns, { minSupported = 1 } = {}) {
  const out = [];
  for (const p of patterns) {
    if (p.status === 'INSUFFICIENT') continue;
    const qualifier = p.status === 'MIXED' ? 'Customers are split on: ' : p.status === 'PARTIAL' ? 'Some but not all customers express: ' : 'Customers repeatedly express: ';
    const body = {
      schema_version: 'ucdm-voc-1.0.0',
      statement: `${qualifier}${p.pattern} (${p.coverage.deduped_observation_count} observations across ${p.coverage.unique_source_count} sources; ${p.coverage.denominator_note}).`,
      statement_source: 'deterministic:ucdm/voc',
      supporting_pattern_refs: [p.pattern_id],
      contradicting_refs: [],
      scope: p.scope,
      confidence: p.confidence,
      confidence_band: p.confidence.band,
      is_fact: false,
      is_recommendation: false,
    };
    body.insight_id = 'voci_' + sha256Hex(canonicalize({ ...body, insight_id: undefined, confidence: p.confidence.content_hash }));
    out.push(deepFreeze(body));
  }
  return out;
}

function validatePattern(p) {
  const errors = [];
  if (!PATTERN_STATUS.includes(p.status)) errors.push(`bad pattern status "${p.status}"`);
  if (p.status !== 'INSUFFICIENT' && p.supporting_observations.length === 0) errors.push('a non-INSUFFICIENT pattern needs supporting observations');
  return { valid: errors.length === 0, errors };
}
function validateInsight(i) {
  const errors = [];
  if (i.is_fact !== false) errors.push('a CustomerInsight is never a fact');
  if (i.is_recommendation !== false) errors.push('ASTRA-11F insights are not recommendations');
  if (i.statement_source !== 'deterministic:ucdm/voc') errors.push('insight statement must be deterministic in this gate');
  if (i.supporting_pattern_refs.length === 0) errors.push('insight needs supporting_pattern_refs');
  return { valid: errors.length === 0, errors };
}

module.exports = { CONTRADICTION_STATUS, PATTERN_STATUS, OPPOSING_PAIRS, classifyContradiction, crossConceptContradictions, buildPattern, buildInsights, validatePattern, validateInsight, labelFor };
