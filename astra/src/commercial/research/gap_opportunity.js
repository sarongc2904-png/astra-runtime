'use strict';
// [ASTRA-11D remediation §8 §9] MarketGapCandidate (a HYPOTHESIS, never a MarketFact) and
// MarketOpportunity (recommendation-level, but never autonomous, no fabricated numbers).
// A gap is NEVER CONFIRMED just because a heuristic proposed it. No LLM, no web, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const { assess } = require('../validation/confidence');

const GAP_TYPES = Object.freeze(['underserved_promise', 'missing_guarantee', 'weak_proof', 'unaddressed_segment', 'pricing_gap', 'channel_gap', 'service_speed_gap', 'message_saturation_opportunity']);
const GAP_STATUS = Object.freeze(['HYPOTHESIS', 'VALIDATION_NEEDED']); // NEVER 'CONFIRMED' in ASTRA-11D
const PRODUCER = 'deterministic:ucdm/research';

function makeMarketGapCandidate(input) {
  const gap_type = GAP_TYPES.includes(input.gap_type) ? input.gap_type : null;
  if (!gap_type) throw new Error(`[ASTRA-11D] unknown gap_type "${input.gap_type}"`);
  if (!Array.isArray(input.supporting_evidence_refs) || input.supporting_evidence_refs.length === 0) throw new Error('[ASTRA-11D] gap candidate needs supporting_evidence_refs');
  const body = {
    schema_version: 'ucdm-research-1.0.0',
    kind: 'MarketGapCandidate',
    is_market_fact: false,
    gap_type,
    hypothesis: String(input.hypothesis || ''),
    supporting_evidence_refs: [...input.supporting_evidence_refs].sort(),
    contradicting_evidence_refs: [...(input.contradicting_evidence_refs || [])].sort(),
    confidence: input.confidence,
    potential_value: input.potential_value != null ? String(input.potential_value) : 'UNKNOWN', // band/label only, never a number
    validation_needed: [...(input.validation_needed || ['direct market test', 'larger competitor sample'])],
    status: GAP_STATUS.includes(input.status) ? input.status : 'VALIDATION_NEEDED',
    produced_by: input.produced_by || PRODUCER,
  };
  body.gap_id = 'mgap_' + sha256Hex(canonicalize({ ...body, gap_id: undefined, confidence: body.confidence && body.confidence.content_hash }));
  return deepFreeze(body);
}

function validateGapCandidate(g) {
  const errors = [];
  if (g.kind !== 'MarketGapCandidate') errors.push('not a MarketGapCandidate');
  if (g.is_market_fact !== false) errors.push('a gap candidate is never a MarketFact');
  if (!GAP_STATUS.includes(g.status)) errors.push(`gap status "${g.status}" is not allowed (CONFIRMED is forbidden in ASTRA-11D)`);
  if (typeof g.potential_value === 'number') errors.push('potential_value must be a band/label, never a fabricated number');
  if (!g.confidence || g.confidence.produced_by !== 'deterministic:ucdm/confidence') errors.push('gap needs a deterministic ConfidenceAssessment');
  return { valid: errors.length === 0, errors };
}

// deriveGapCandidates — conservative deterministic heuristics over the landscapes.
// Every candidate is VALIDATION_NEEDED; none is asserted as fact.
function deriveGapCandidates({ offerFrequencies, messageFrequencies, pricingStats, customerSignals, competitorCount = 0 }) {
  const cands = [];
  const compN = competitorCount || 1;
  const offerFrac = (c) => { const f = (offerFrequencies && offerFrequencies.frequencies || []).find(x => x.component === c); return f ? f.fraction : 0; };
  const msgFrac = (m) => { const f = (messageFrequencies && messageFrequencies.frequencies || []).find(x => x.message_field === m); return f ? f.fraction : 0; };

  const guaranteeFrac = offerFrac('guarantee');
  const fearSignals = customerSignals.filter(s => s.signal_type === 'fear' || s.signal_type === 'purchase_barrier');
  if (guaranteeFrac < 0.34 && fearSignals.length >= 1 && competitorCount >= 3) {
    cands.push(makeMarketGapCandidate({
      gap_type: 'missing_guarantee',
      hypothesis: `Guarantee/risk-reversal is present in only ${(guaranteeFrac * 100).toFixed(0)}% of ${competitorCount} observed competitors while customers voice risk/fear — a risk-reversal offer may be underserved.`,
      supporting_evidence_refs: [...new Set([...(offerFrequencies && offerFrequencies.frequencies || []).flatMap(f => []), ...fearSignals.flatMap(s => s.evidence_refs)])],
      confidence: assess({ evidence_count: fearSignals.length + 1, distinct_sources: Math.min(competitorCount, 3), newest_evidence_age_days: 90, coverage: 0.4, agree_count: 1, conflict_count: 0, data_quality: 0.5 }),
      validation_needed: ['A/B test a strong guarantee', 'confirm the fear signal is representative'],
    }));
  }
  const proofFrac = msgFrac('proof');
  if (proofFrac < 0.34 && competitorCount >= 3) {
    cands.push(makeMarketGapCandidate({
      gap_type: 'weak_proof',
      hypothesis: `Proof/evidence messaging appears in only ${(proofFrac * 100).toFixed(0)}% of ${competitorCount} observed competitors — a proof-led position may be differentiating.`,
      supporting_evidence_refs: (messageFrequencies && messageFrequencies.frequencies || []).flatMap(f => []).concat(['MESSAGE_LANDSCAPE']),
      confidence: assess({ evidence_count: 2, distinct_sources: Math.min(competitorCount, 3), newest_evidence_age_days: 90, coverage: 0.4, agree_count: 1, conflict_count: 0, data_quality: 0.5 }),
    }));
  }
  const speedComplaints = customerSignals.filter(s => /respond|lent|tard|slow|days|dias/i.test(s.verbatim_text || ''));
  if (speedComplaints.length >= 2 && offerFrac('delivery_time') < 0.5) {
    cands.push(makeMarketGapCandidate({
      gap_type: 'service_speed_gap',
      hypothesis: `Multiple customers cite slow response/service while few observed competitors advertise speed — a speed-of-service position may be underserved.`,
      supporting_evidence_refs: [...new Set(speedComplaints.flatMap(s => s.evidence_refs))],
      confidence: assess({ evidence_count: speedComplaints.length, distinct_sources: new Set(speedComplaints.map(s => s.source_ref)).size, newest_evidence_age_days: 90, coverage: 0.5, agree_count: speedComplaints.length, conflict_count: 0, data_quality: 0.6 }),
    }));
  }
  if (pricingStats && pricingStats.currencies.length === 1) {
    const cur = pricingStats.currencies[0]; const s = pricingStats.by_currency[cur];
    if (s && s.sample_size >= 3 && s.max / (s.min || 1) >= 2) {
      cands.push(makeMarketGapCandidate({
        gap_type: 'pricing_gap',
        hypothesis: `Observed ${cur} prices span ${s.min}-${s.max} (>=2x) across ${s.sample_size} data points — a clearly-positioned price tier may be open.`,
        supporting_evidence_refs: ['PRICING_STATS'],
        confidence: s.confidence,
      }));
    }
  }
  return cands;
}

// ---------- MarketOpportunity (§9) ----------
function makeMarketOpportunity(input) {
  if (!Array.isArray(input.supporting_claim_refs) || input.supporting_claim_refs.length === 0) throw new Error('[ASTRA-11D] opportunity needs supporting_claim_refs');
  const body = {
    schema_version: 'ucdm-research-1.0.0',
    kind: 'MarketOpportunity',
    level: 'RECOMMENDATION',
    opportunity: String(input.opportunity || ''),
    problem: String(input.problem || ''),
    target_segment: input.target_segment != null ? String(input.target_segment) : 'UNKNOWN',
    supporting_claim_refs: [...input.supporting_claim_refs].sort(),
    gap_refs: [...(input.gap_refs || [])].sort(),
    expected_mechanism: input.expected_mechanism != null ? String(input.expected_mechanism) : null,
    uncertainty: input.uncertainty != null ? String(input.uncertainty) : 'HIGH',
    recommended_validation: [...(input.recommended_validation || ['run a controlled experiment before acting'])],
    priority_inputs: {
      impact_hint: input.priority_inputs && input.priority_inputs.impact_hint || 'UNKNOWN',
      effort_hint: input.priority_inputs && input.priority_inputs.effort_hint || 'UNKNOWN',
      confidence_band: (input.confidence && input.confidence.band) || 'UNKNOWN',
    },
    confidence: input.confidence || null,
    expected_lift: 'NOT_ESTIMATED',           // numeric business lift is NEVER fabricated
    requires_human_validation: true,
    autonomous: false,
    produced_by: PRODUCER,
  };
  body.opportunity_id = 'mopp_' + sha256Hex(canonicalize({ ...body, opportunity_id: undefined, confidence: body.confidence && body.confidence.content_hash }));
  return deepFreeze(body);
}

function validateOpportunity(o) {
  const errors = [];
  if (o.kind !== 'MarketOpportunity') errors.push('not a MarketOpportunity');
  if (o.autonomous !== false || o.requires_human_validation !== true) errors.push('opportunity must be non-autonomous and require human validation');
  if (typeof o.expected_lift === 'number' || o.expected_lift !== 'NOT_ESTIMATED') errors.push('expected_lift must not be a fabricated number');
  if (!Array.isArray(o.supporting_claim_refs) || o.supporting_claim_refs.length === 0) errors.push('opportunity needs supporting_claim_refs');
  if (!o.recommended_validation || o.recommended_validation.length === 0) errors.push('opportunity must carry recommended_validation');
  return { valid: errors.length === 0, errors };
}

function deriveOpportunities({ gapCandidates, claims, request }) {
  const supportedClaims = claims.filter(c => c.status === 'SUPPORTED' || c.status === 'PARTIALLY_SUPPORTED');
  const out = [];
  for (const g of gapCandidates) {
    // tie a gap to any supported claim about a related fact_type
    const related = supportedClaims.filter(c => relatedFactType(g.gap_type, c.fact_type));
    if (related.length === 0) continue;
    out.push(makeMarketOpportunity({
      opportunity: `Position against: ${g.hypothesis}`,
      problem: g.hypothesis,
      target_segment: request.target_customer || 'UNKNOWN',
      supporting_claim_refs: related.map(c => c.claim_id),
      gap_refs: [g.gap_id],
      expected_mechanism: mechanismFor(g.gap_type),
      uncertainty: g.confidence && g.confidence.band === 'HIGH' ? 'MEDIUM' : 'HIGH',
      recommended_validation: g.validation_needed,
      confidence: g.confidence,
      priority_inputs: { impact_hint: 'UNKNOWN', effort_hint: 'UNKNOWN' },
    }));
  }
  return out;
}
function relatedFactType(gapType, factType) {
  const m = {
    missing_guarantee: ['OBSERVED_GUARANTEE', 'OFFER_COMPONENT', 'ADVERTISED_PROMISE'],
    weak_proof: ['PUBLISHED_CLAIM', 'ADVERTISED_PROMISE'],
    service_speed_gap: ['REVIEW_COMPLAINT', 'REVIEW_STATEMENT'],
    pricing_gap: ['COMPETITOR_PRICE'],
    underserved_promise: ['ADVERTISED_PROMISE'],
    message_saturation_opportunity: ['ADVERTISED_PROMISE', 'PUBLISHED_CLAIM'],
    unaddressed_segment: ['REVIEW_STATEMENT'],
    channel_gap: ['OBSERVED_CTA'],
  };
  return (m[gapType] || []).includes(factType);
}
function mechanismFor(gapType) {
  return {
    missing_guarantee: 'reduce perceived purchase risk -> higher lead->sale conversion',
    weak_proof: 'increase message credibility -> higher CTR / lead quality',
    service_speed_gap: 'faster response -> fewer drop-offs between lead and appointment',
    pricing_gap: 'clearer price positioning -> better qualified demand',
  }[gapType] || 'differentiation on an under-served dimension';
}

module.exports = { GAP_TYPES, GAP_STATUS, makeMarketGapCandidate, validateGapCandidate, deriveGapCandidates, makeMarketOpportunity, validateOpportunity, deriveOpportunities };
