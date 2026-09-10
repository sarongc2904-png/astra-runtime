'use strict';
// [ASTRA-11J §H] Provider-neutral source / channel fields. The source field does NOT prove
// causal attribution (see attribution.js). No LLM, no I/O.
const CHANNELS = Object.freeze([
  'PAID_SOCIAL', 'PAID_SEARCH', 'ORGANIC', 'REFERRAL', 'EMAIL', 'WHATSAPP', 'DIRECT',
  'MARKETPLACE', 'OUTBOUND', 'PARTNER', 'OFFLINE', 'UNKNOWN',
]);

const ALIASES = Object.freeze({
  META: 'PAID_SOCIAL', FACEBOOK: 'PAID_SOCIAL', INSTAGRAM: 'PAID_SOCIAL', TIKTOK: 'PAID_SOCIAL', ADS_SOCIAL: 'PAID_SOCIAL',
  GOOGLE: 'PAID_SEARCH', SEM: 'PAID_SEARCH', GOOGLE_ADS: 'PAID_SEARCH',
  SEO: 'ORGANIC', ORGANIC_SOCIAL: 'ORGANIC', BLOG: 'ORGANIC',
  WORD_OF_MOUTH: 'REFERRAL', RECOMMENDATION: 'REFERRAL',
  WA: 'WHATSAPP', WHATS_APP: 'WHATSAPP',
  NEWSLETTER: 'EMAIL',
  COLD_OUTREACH: 'OUTBOUND', SDR: 'OUTBOUND',
  IN_PERSON: 'OFFLINE', FLYER: 'OFFLINE', EVENT: 'OFFLINE',
});

function normalizeChannel(c) {
  if (c == null) return 'UNKNOWN';
  const up = String(c).trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (CHANNELS.includes(up)) return up;
  if (ALIASES[up]) return ALIASES[up];
  return 'UNKNOWN';
}

function channelsComparable(a, b) {
  const na = normalizeChannel(a), nb = normalizeChannel(b);
  if (na === 'UNKNOWN' || nb === 'UNKNOWN') return { comparable: na === nb, reason: 'UNKNOWN_CHANNEL' };
  return { comparable: na === nb, reason: na === nb ? 'SAME_CHANNEL' : 'CHANNEL_MISMATCH' };
}

module.exports = { CHANNELS, normalizeChannel, channelsComparable };
