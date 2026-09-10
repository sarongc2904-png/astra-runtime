'use strict';
// [ASTRA-11I §F] Positioning distinctiveness — deterministic comparison of a positioning
// territory's differentiation basis against OBSERVED competitor messages/offers.
// Returns overlap / whitespace / contested / unknown_coverage. NEVER claims market-wide
// uniqueness from an incomplete sample. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const { classifyType } = require('./differentiation');

// assessDistinctiveness({ differentiationTypes, researchResult, competitorResult }) -> frozen
function assessDistinctiveness({ differentiationTypes = [], researchResult = null, competitorResult = null }) {
  const competitorTexts = [
    ...((researchResult && researchResult.message_observations) || []).map(m => m.verbatim_text || m.text || m.message || ''),
    ...((researchResult && researchResult.offer_items) || []).map(o => o.component || o.text || ''),
  ];
  const competitorTypes = {};
  for (const t of competitorTexts.map(classifyType)) if (t !== 'UNKNOWN') competitorTypes[t] = (competitorTypes[t] || 0) + 1;
  const sampleSize = competitorTexts.length;

  const overlap = [], whitespace = [], contested = [];
  for (const t of [...new Set(differentiationTypes)].sort()) {
    if (sampleSize === 0) continue;
    const n = competitorTypes[t] || 0;
    if (n === 0) whitespace.push(t);
    else if (n === 1) overlap.push(t);
    else contested.push(t);
  }

  const body = {
    schema_version: 'ucdm-positioning-offer-1.0.0', kind: 'PositioningDistinctiveness',
    competitor_sample_size: sampleSize,
    overlap, whitespace, contested,
    unknown_coverage: sampleSize === 0
      ? { status: 'NO_COMPETITOR_SAMPLE', note: 'no observed competitor messages/offers — distinctiveness cannot be assessed' }
      : { status: 'PARTIAL_SAMPLE', note: `assessed against ${sampleSize} observed competitor items only — NOT market-wide` },
    market_wide_uniqueness_claim: 'NOT_ASSERTED',
    generated_by: 'deterministic:ucdm/positioning_offer',
  };
  body.distinctiveness_id = 'pd_' + sha256Hex(canonicalize({ ...body, distinctiveness_id: undefined }));
  return deepFreeze(body);
}

function validateDistinctiveness(d) {
  const errors = [];
  if (d.market_wide_uniqueness_claim !== 'NOT_ASSERTED') errors.push('market-wide uniqueness must never be asserted');
  if (d.competitor_sample_size === 0 && (d.overlap.length || d.contested.length)) errors.push('cannot report overlap/contested with no competitor sample');
  return { valid: errors.length === 0, errors };
}

module.exports = { assessDistinctiveness, validateDistinctiveness };
