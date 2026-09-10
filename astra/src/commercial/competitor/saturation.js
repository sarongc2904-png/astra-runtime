'use strict';
// [ASTRA-11E §L §M] Deterministic pattern-frequency (market saturation) + classified
// message-pattern counts (message saturation). NO semantic market-wide extrapolation beyond
// the sample — every output carries a coverage caveat. Message labels come from the
// CONTROLLED taxonomy in message_profile.js. No LLM, no web, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const { MESSAGE_PATTERNS } = require('./message_profile');

// §L market pattern -> deterministic detector over a competitor's evidence
const MARKET_PATTERNS = Object.freeze({
  price_messaging: (b) => b.messageProfile && b.messageProfile.patterns_present.includes('BEST_PRICE'),
  free_consultation: (b) => (b.funnelProfile && b.funnelProfile.observed_touchpoints.includes('consultation')),
  financing: (b) => (b.attributes || []).some(a => a.attribute === 'financing' && a.kind === 'OBSERVED'),
  guarantee: (b) => (b.attributes || []).some(a => a.attribute === 'guarantee' && a.kind === 'OBSERVED'),
  same_day_messaging: (b) => b.messageProfile && b.messageProfile.patterns_present.includes('FAST'),
  testimonial_use: (b) => b.proofProfile && b.proofProfile.proof_types_present.some(t => ['testimonial', 'review', 'rating'].includes(t)),
  before_after_use: (b) => b.proofProfile && b.proofProfile.proof_types_present.includes('before_after'),
  whatsapp_cta: (b) => b.funnelProfile && b.funnelProfile.observed_touchpoints.includes('whatsapp_contact'),
  discount_led: (b) => (b.attributes || []).some(a => a.attribute === 'offer' && /discount|descuento/i.test(JSON.stringify(a.value || ''))) || (b.messageProfile && b.messageProfile.patterns_present.includes('BEST_PRICE')),
  technology_led: (b) => b.messageProfile && b.messageProfile.patterns_present.includes('TECHNOLOGY'),
});

function evidenceForPattern(b) { return [...new Set([...(b.messageProfile ? b.messageProfile.items.flatMap(i => i.raw.evidence_refs) : []), ...(b.attributes || []).flatMap(a => a.evidence_refs)])].sort(); }

// buildMarketSaturation({ profiles, byCompetitor })
function buildMarketSaturation({ profiles, byCompetitor }) {
  const n = profiles.length || 1;
  const patterns = Object.entries(MARKET_PATTERNS).map(([pattern, fn]) => {
    const hits = profiles.filter(p => { try { return !!fn(byCompetitor[p.competitor_ref] || {}); } catch { return false; } });
    return {
      pattern,
      competitor_count: hits.length,
      sample_size: n,
      frequency: Number((hits.length / n).toFixed(6)),
      evidence_refs: [...new Set(hits.flatMap(p => evidenceForPattern(byCompetitor[p.competitor_ref] || {})))].sort(),
      coverage_caveat: `${hits.length}/${n} observed competitors — sample only, not a market-wide rate`,
    };
  });
  return deepFreeze({ schema_version: 'ucdm-competitor-1.0.0', sample_size: n, patterns, generated_by: 'deterministic:ucdm/competitor', extrapolation: 'NONE_BEYOND_SAMPLE' });
}

// §M message saturation — counts of controlled message patterns across competitors
function buildMessageSaturation({ profiles, byCompetitor }) {
  const n = profiles.length || 1;
  const labels = Object.keys(MESSAGE_PATTERNS).concat(['UNKNOWN']);
  const counts = Object.fromEntries(labels.map(l => [l, 0]));
  const evByLabel = Object.fromEntries(labels.map(l => [l, new Set()]));
  for (const p of profiles) {
    const b = byCompetitor[p.competitor_ref] || {};
    const seen = new Set(b.messageProfile ? b.messageProfile.patterns_present : ['UNKNOWN']);
    for (const l of seen) { if (l in counts) { counts[l] += 1; (b.messageProfile ? b.messageProfile.items : []).forEach(i => i.analysis.message_patterns.includes(l) && i.raw.evidence_refs.forEach(e => evByLabel[l].add(e))); } }
  }
  return deepFreeze({
    schema_version: 'ucdm-competitor-1.0.0',
    taxonomy: 'ucdm-competitor-message-v1',
    sample_size: n,
    patterns: labels.filter(l => counts[l] > 0).map(l => ({ label: l, competitor_count: counts[l], sample_size: n, frequency: Number((counts[l] / n).toFixed(6)), evidence_refs: [...evByLabel[l]].sort(), coverage_caveat: 'sample only' })),
    unknown_permitted: true,
    generated_by: 'deterministic:ucdm/competitor',
  });
}

module.exports = { MARKET_PATTERNS, buildMarketSaturation, buildMessageSaturation };
