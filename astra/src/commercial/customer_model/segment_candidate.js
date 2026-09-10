'use strict';
// [ASTRA-11G §D] SegmentCandidate. Deterministic, evidence-grounded. A segment label may be
// descriptive but must NEVER imply an unsupported demographic fact. Status:
// SUPPORTED / PARTIAL / HYPOTHESIS / INSUFFICIENT. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const { assess } = require('../validation/confidence');
const ST = require('./segment_taxonomy');
const { classifyUrgency } = require('./urgency');
const { classifyAwareness } = require('./awareness');
const { classifyBudgetSignal } = require('./budget_signal');

const SEGMENT_STATUS = Object.freeze(['SUPPORTED', 'PARTIAL', 'HYPOTHESIS', 'INSUFFICIENT']);

// Controlled concept -> descriptive (non-demographic) label.
const CONCEPT_LABEL = Object.freeze({
  PRICE_CONCERN: 'Price-sensitive customers', PRICE_ACCEPTANCE: 'Value-over-price customers',
  PAIN_FEAR: 'Customers anxious about the procedure', PAIN_EXPERIENCED: 'Customers with an active unresolved pain',
  SPEED_NEED: 'Speed-driven customers', SLOW_SERVICE: 'Customers frustrated by slow service',
  RESPONSIVENESS_COMPLAINT: 'Customers frustrated by poor responsiveness',
  TRUST_CONCERN: 'Trust-cautious customers', RESULTS_DESIRED: 'Results-focused customers',
  RESULTS_UNCERTAINTY: 'Customers uncertain results will work', PROCESS_UNCLEAR: 'Customers confused by the process',
  FINANCING_DEMAND: 'Customers needing financing', GUARANTEE_DEMAND: 'Customers needing a guarantee',
  QUALITY_PRAISE: 'Quality-satisfied customers', CONVENIENCE_VALUE: 'Convenience-driven customers',
});
// A label must not assert demographics.
const DEMOGRAPHIC_LABEL_RE = /\b(women|men|woman|man|mujeres|hombres|young|older adults?|younger|j[oó]venes|mayores de|millennial|gen[ -]?z|boomer|wealthy|upper[- ]class|working[- ]class|low[- ]income|high[- ]income|middle[- ]income|married|divorced|widowed|moms?|dads?|mothers?|fathers?|retirees?|latino|hispanic|caucasian|ethnicity)\b/i;

// primary "problem" concept groups (pains + objections + fears feed the problem dimension;
// desires/outcomes feed the desired_outcome dimension).
const PROBLEM_ASPECTS = new Set(['PAIN', 'OBJECTION', 'FEAR', 'COMPLAINT', 'FRUSTRATION', 'BARRIER', 'RISK', 'UNCERTAINTY']);
const OUTCOME_ASPECTS = new Set(['DESIRE', 'OUTCOME', 'EXPECTATION', 'BENEFIT', 'REASON_TO_BUY']);

// buildSegmentCandidates({ vocResult, attributeEvidence, businessInput })
function buildSegmentCandidates({ vocResult, businessInput = {} }) {
  const observations = (vocResult.observations || []).filter(o => o.status === 'OBSERVED');
  const contradictionByConcept = {};
  for (const c of (vocResult.contradictions || [])) {
    for (const cc of [c.canonical_concept, ...(c.cluster_refs ? [] : [])]) contradictionByConcept[cc] = c.status;
  }
  // also per-cluster contradiction keyed by concept
  for (const c of (vocResult.contradictions || [])) if (c.canonical_concept && !c.kind) contradictionByConcept[c.canonical_concept] = c.status;

  // group observations by (dimension, concept)
  const groups = new Map();
  for (const o of observations) {
    const dim = PROBLEM_ASPECTS.has(o.aspect) ? 'problem' : OUTCOME_ASPECTS.has(o.aspect) ? 'desired_outcome' : null;
    if (!dim) continue;
    if (o.normalized_concept === 'UNKNOWN_CONCEPT') continue;
    const key = `${dim}::${o.normalized_concept}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(o);
  }

  const candidates = [];
  for (const [key, obs] of [...groups.entries()].sort()) {
    const [dim, concept] = key.split('::');
    const sourceRefs = [...new Set(obs.map(o => o.source_ref).filter(Boolean))].sort();
    const speakerIds = [...new Set(obs.map(o => o.speaker_pseudonym).filter(Boolean))].sort();
    const dedup = new Set(obs.map(o => `${o.source_ref}::${o.exact_span.text.toLowerCase()}`)).size;
    const evidence_refs = [...new Set(obs.flatMap(o => o.evidence_refs))].sort();

    // co-occurring secondary dimensions, computed from the SAME observation subset (sample scope)
    const urg = classifyUrgency({ triggers: vocResult.triggers || [], observations: obs });
    const awr = classifyAwareness(obs);
    const bud = classifyBudgetSignal({ observations: obs });

    const dimension_values = [
      { dimension: dim, value: concept, scope: 'SEGMENT', evidence_refs },
      { dimension: 'urgency', value: urg.level, scope: 'SAMPLE', evidence_refs: urg.evidence_refs },
      { dimension: 'awareness', value: awr.stage, scope: 'SAMPLE', evidence_refs: awr.evidence_refs },
      { dimension: 'budget_signal', value: bud.signal, scope: 'SAMPLE', evidence_refs: bud.evidence_refs },
    ].map(dv => ({ ...dv, ...ST.normalizeDimensionValue(dv.dimension, dv.value), evidence_refs: dv.evidence_refs, scope: dv.scope }));

    const contradiction = contradictionByConcept[concept] || 'NONE';
    let status;
    if (dedup < 2 || sourceRefs.length < 1) status = 'INSUFFICIENT';
    else if (speakerIds.length === 0) status = 'HYPOTHESIS';
    else if (['MIXED', 'POLARIZED'].includes(contradiction)) status = 'PARTIAL';
    else status = 'SUPPORTED';

    const confidence = assess({ evidence_count: evidence_refs.length, distinct_sources: sourceRefs.length, coverage: 0.5, agree_count: obs.length, conflict_count: ['MIXED', 'POLARIZED'].includes(contradiction) ? 1 : 0, newest_evidence_age_days: 90 });

    const body = {
      schema_version: 'ucdm-customer-model-1.0.0',
      kind: 'SegmentCandidate',
      dimension_taxonomy_version: ST.SEGMENT_DIMENSION_TAXONOMY_VERSION,
      label: CONCEPT_LABEL[concept] || `Customers expressing ${concept.toLowerCase().replace(/_/g, ' ')}`,
      primary_dimension: dim,
      primary_concept: concept,
      dimension_values,
      supporting_evidence_refs: evidence_refs,
      contradicting_evidence_refs: [...new Set((vocResult.contradictions || []).filter(c => c.canonical_concept === concept).flatMap(c => c.evidence_refs || []))].sort(),
      observed_sample: {
        observation_count: obs.length,
        deduped_observation_count: dedup,
        unique_source_count: sourceRefs.length,
        known_customer_count: speakerIds.length || null,
        source_refs: sourceRefs,
        speaker_pseudonyms: speakerIds,
      },
      contradiction_status: contradiction,
      scope: 'SAMPLE',
      status,
      confidence,
    };
    body.segment_id = 'seg_' + sha256Hex(canonicalize({ ...body, segment_id: undefined, confidence: confidence.content_hash }));
    candidates.push(deepFreeze(body));
  }

  // explicit business-declared segments (USER_PROVIDED) — kept as-is, status per evidence
  for (const s of (businessInput.declared_segments || [])) {
    const evidence_refs = [...new Set(s.evidence_refs || [])].sort();
    const body = {
      schema_version: 'ucdm-customer-model-1.0.0', kind: 'SegmentCandidate',
      dimension_taxonomy_version: ST.SEGMENT_DIMENSION_TAXONOMY_VERSION,
      label: String(s.label || 'Business-declared segment'),
      primary_dimension: 'problem', primary_concept: s.primary_concept || 'UNKNOWN_CONCEPT',
      dimension_values: (s.dimension_values || []).map(dv => ({ ...ST.normalizeDimensionValue(dv.dimension, dv.value), scope: 'ACCOUNT', evidence_refs: dv.evidence_refs || [] })),
      supporting_evidence_refs: evidence_refs, contradicting_evidence_refs: [],
      observed_sample: { observation_count: 0, deduped_observation_count: 0, unique_source_count: 0, known_customer_count: s.known_customer_count != null ? s.known_customer_count : null, source_refs: [], speaker_pseudonyms: [] },
      contradiction_status: 'NONE', scope: 'BUSINESS_DECLARED',
      status: evidence_refs.length ? 'PARTIAL' : 'HYPOTHESIS',
      confidence: assess({ evidence_count: evidence_refs.length, distinct_sources: evidence_refs.length, coverage: 0.3 }),
    };
    body.segment_id = 'seg_' + sha256Hex(canonicalize({ ...body, segment_id: undefined, confidence: body.confidence.content_hash }));
    candidates.push(deepFreeze(body));
  }

  return candidates;
}

function validateSegmentCandidate(s) {
  const errors = [];
  if (!SEGMENT_STATUS.includes(s.status)) errors.push(`bad segment status "${s.status}"`);
  if (DEMOGRAPHIC_LABEL_RE.test(s.label)) errors.push(`segment label "${s.label}" implies an unsupported demographic fact`);
  for (const dv of s.dimension_values) if (!ST.isDimension(dv.dimension)) errors.push(`uncontrolled segment dimension "${dv.dimension}"`);
  if (s.status !== 'INSUFFICIENT' && s.status !== 'HYPOTHESIS' && s.supporting_evidence_refs.length === 0) errors.push('a SUPPORTED/PARTIAL segment needs supporting evidence');
  return { valid: errors.length === 0, errors };
}

module.exports = { SEGMENT_STATUS, CONCEPT_LABEL, DEMOGRAPHIC_LABEL_RE, buildSegmentCandidates, validateSegmentCandidate };
