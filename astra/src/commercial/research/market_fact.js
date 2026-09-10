'use strict';
// [ASTRA-11D] MarketFact (spec section D). A MarketFact is OBSERVED or COMPUTED — never
// INFERRED. Model knowledge is NEVER a market fact. Deterministic extraction from
// ASTRA-11C NormalizedObservation objects only. No LLM, no web, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const { assess } = require('../validation/confidence');
const { CANONICAL_NUMERIC_CLASSES } = require('../provenance/provenance');

const FACT_TYPES = Object.freeze([
  'COMPETITOR_PRICE', 'ADVERTISED_PROMISE', 'OFFER_COMPONENT', 'REVIEW_COMPLAINT', 'REVIEW_DESIRE',
  'REVIEW_STATEMENT', 'LOCATION_SERVED', 'PRODUCT_CATEGORY', 'OBSERVED_CTA', 'OBSERVED_GUARANTEE',
  'RATING', 'REVIEW_COUNT', 'PUBLISHED_CLAIM',
]);
const FACT_STATUS = Object.freeze(['OBSERVED', 'COMPUTED']);
// Observation provenance classes that may become an OBSERVED MarketFact.
const OBSERVED_FACT_CLASSES = Object.freeze(['OBSERVED', 'USER_PROVIDED']);

const ASPECT_TO_FACT = { OBJECTION: 'REVIEW_COMPLAINT', PAIN: 'REVIEW_COMPLAINT', COMPLAINT: 'REVIEW_COMPLAINT', DESIRE: 'REVIEW_DESIRE', REASON_TO_BUY: 'REVIEW_DESIRE' };

function subjectKey(subject) {
  if (!subject || subject.__ucdm_unknown) return 'subject:UNKNOWN';
  if (subject.state === 'RESOLVED') return `subject:${subject.subject_type || '?'}:${subject.subject_id}`;
  return `subject:${subject.subject_type || '?'}:${subject.label || 'UNRESOLVED'}`;
}

function factConfidence(observation, referenceTime) {
  const q = observation.quality || {};
  const ageDays = (() => {
    const t = observation.temporal || {};
    const ts = t.event_time || t.publication_time || t.capture_time;
    if (!ts || !referenceTime) return null;
    const d = (Date.parse(referenceTime) - Date.parse(ts)) / 86400000;
    return Number.isFinite(d) ? d : null;
  })();
  return assess({
    evidence_count: (observation.provenance && observation.provenance.evidence_refs.length) || 1,
    distinct_sources: 1,
    newest_evidence_age_days: ageDays == null ? 400 : ageDays,
    coverage: 1,
    agree_count: 1, conflict_count: 0,
    data_quality: q.attestation != null ? q.attestation : 0.5,
  });
}

// extractFacts(observations, { referenceTime, geography }) -> { facts[], excluded_inferred[], skipped[] }
function extractFacts(observations, { referenceTime = null, geography = 'UNKNOWN' } = {}) {
  const facts = [];
  const excluded_inferred = [];
  const skipped = [];

  for (const o of observations) {
    const cls = o.provenance && o.provenance.source_class;
    if (cls === 'INFERRED') { excluded_inferred.push({ source_ref: o.source_ref, content_hash: o.content_hash, reason: 'INFERRED observation cannot become a MarketFact' }); continue; }
    if (!OBSERVED_FACT_CLASSES.includes(cls)) { skipped.push({ source_ref: o.source_ref, reason: `unsupported observation source_class ${cls}` }); continue; }

    const sv = o.structured_values || {};
    const candidates = [];

    if (o.observation_type === 'RATING' && o.numeric) candidates.push({ fact_type: 'RATING', value: { score: o.numeric.value, unit: o.numeric.unit } });
    if ((o.observation_type === 'TRANSACTION' || o.observation_type === 'METRIC') && o.numeric && o.numeric.currency) candidates.push({ fact_type: 'COMPETITOR_PRICE', value: { amount: o.numeric.value, currency: o.numeric.currency } });
    if (o.observation_type === 'METRIC' && o.numeric && !o.numeric.currency && /count/i.test(sv.metric_kind || '')) candidates.push({ fact_type: 'REVIEW_COUNT', value: { count: o.numeric.value } });

    if (o.observation_type === 'CLAIM' && o.verbatim) {
      const actor = (o.verbatim.actor || '').toLowerCase();
      candidates.push({ fact_type: actor === 'advertiser' ? 'ADVERTISED_PROMISE' : 'PUBLISHED_CLAIM', value: { text: o.verbatim.verbatim_text } });
    }
    if (o.observation_type === 'QUOTE' && o.verbatim) {
      const aspect = String(sv.aspect || '').toUpperCase();
      const ft = ASPECT_TO_FACT[aspect] || 'REVIEW_STATEMENT';
      candidates.push({ fact_type: ft, value: { text: o.verbatim.verbatim_text, aspect: aspect || null } });
    }
    // structured attributes
    if (sv.cta != null) candidates.push({ fact_type: 'OBSERVED_CTA', value: { cta: String(sv.cta) } });
    if (sv.guarantee != null) candidates.push({ fact_type: 'OBSERVED_GUARANTEE', value: { guarantee: String(sv.guarantee) } });
    if (sv.offer_component != null) candidates.push({ fact_type: 'OFFER_COMPONENT', value: { component: String(sv.offer_component) } });
    if (sv.location_served != null) candidates.push({ fact_type: 'LOCATION_SERVED', value: { location: String(sv.location_served) } });
    if (sv.product_category != null) candidates.push({ fact_type: 'PRODUCT_CATEGORY', value: { category: String(sv.product_category) } });

    if (candidates.length === 0) { skipped.push({ source_ref: o.source_ref, reason: `no deterministic fact extractor for ${o.observation_type}` }); continue; }

    for (const c of candidates) {
      const conf = factConfidence(o, referenceTime);
      const body = {
        schema_version: 'ucdm-research-1.0.0',
        fact_type: c.fact_type,
        value: c.value,
        evidence_refs: [...((o.provenance && o.provenance.evidence_refs) || [])],
        source_classes: [cls],
        source_ref: o.source_ref,
        subject_ref: subjectKey(o.subject),
        observation_window: (o.temporal && o.temporal.observation_window) || null,
        observed_at: (o.temporal && (o.temporal.event_time || o.temporal.publication_time || o.temporal.capture_time)) || null,
        geography: (o.structured_values && o.structured_values.geography) || geography || 'UNKNOWN',
        confidence: conf,
        status: 'OBSERVED',
        observation_hash: o.content_hash,
      };
      body.fact_id = 'mf_' + sha256Hex(canonicalize({ ...body, fact_id: undefined, confidence: conf.content_hash }));
      facts.push(deepFreeze(body));
    }
  }
  return { facts, excluded_inferred, skipped };
}

// Build a COMPUTED MarketFact (a deterministic aggregate). status is always COMPUTED and it
// names the deterministic producer.
function makeComputedFact({ fact_type, value, evidence_refs, subject_ref, geography, confidence, contributing_fact_ids }) {
  const body = {
    schema_version: 'ucdm-research-1.0.0',
    fact_type, value,
    evidence_refs: [...(evidence_refs || [])].sort(),
    source_classes: ['COMPUTED'],
    source_ref: null,
    subject_ref: subject_ref || 'subject:UNKNOWN',
    observation_window: null,
    observed_at: null,
    geography: geography || 'UNKNOWN',
    confidence,
    status: 'COMPUTED',
    produced_by: 'deterministic:ucdm/research',
    contributing_fact_ids: [...(contributing_fact_ids || [])].sort(),
  };
  body.fact_id = 'mfc_' + sha256Hex(canonicalize({ ...body, fact_id: undefined, confidence: confidence && confidence.content_hash }));
  return deepFreeze(body);
}

function validateMarketFact(f) {
  const errors = [];
  if (!FACT_TYPES.includes(f.fact_type)) errors.push(`bad fact_type "${f.fact_type}"`);
  if (!FACT_STATUS.includes(f.status)) errors.push(`bad status "${f.status}" (only OBSERVED/COMPUTED)`);
  if (f.status === 'OBSERVED' && (!Array.isArray(f.evidence_refs) || f.evidence_refs.length === 0)) errors.push('OBSERVED fact needs evidence_refs');
  if (f.source_classes.includes('INFERRED')) errors.push('a MarketFact must not draw on INFERRED material');
  if (f.status === 'COMPUTED' && f.produced_by !== 'deterministic:ucdm/research') errors.push('COMPUTED fact must name the deterministic producer');
  if (!f.confidence || f.confidence.produced_by !== 'deterministic:ucdm/confidence') errors.push('fact confidence must be a deterministic ConfidenceAssessment');
  return { valid: errors.length === 0, errors };
}

module.exports = { FACT_TYPES, FACT_STATUS, extractFacts, makeComputedFact, validateMarketFact, subjectKey };
