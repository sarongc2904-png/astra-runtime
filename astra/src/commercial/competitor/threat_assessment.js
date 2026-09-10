'use strict';
// [ASTRA-11E §Q] CompetitorThreatAssessment. Deterministic, configurable weights.
// Competitor SIZE is never automatically threat. Output LOW|MEDIUM|HIGH|UNKNOWN.
// No LLM, no web, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const THREAT_LEVELS = Object.freeze(['LOW', 'MEDIUM', 'HIGH', 'UNKNOWN']);

const DEFAULT_WEIGHTS = Object.freeze({
  audience_overlap: 0.20,
  offer_overlap: 0.16,
  geographic_overlap: 0.16,
  price_overlap: 0.12,
  proof_strength: 0.12,
  channel_overlap: 0.10,
  review_signal: 0.08,
  differentiation_overlap: 0.06,
});
const WEIGHTS_VERSION = 'ucdm-competitor-threat-w1';

function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

// assessThreat({ subject, competitor, byCompetitor, subjectContext, weights })
//   subjectContext (about "us", the business commissioning the analysis): { audience, geography, price_band, channels[], offer_components[] }
//   competitor: a CompetitorProfile ; b = byCompetitor[ref]
function assessThreat({ competitor, b = {}, subjectContext = {}, weights, priceRatio = null }) {
  const w = weights || DEFAULT_WEIGHTS;
  const signals = {};
  let knownCount = 0;

  const setSig = (k, v) => { if (v == null) { signals[k] = null; } else { signals[k] = clamp01(v); knownCount++; } };

  // audience overlap
  setSig('audience_overlap', subjectContext.audience && competitor.audience && competitor.audience !== 'UNKNOWN'
    ? (String(subjectContext.audience).toLowerCase() === String(competitor.audience).toLowerCase() ? 1 : 0.3) : null);
  // offer overlap = jaccard of observed offer components
  const subjOffers = new Set((subjectContext.offer_components || []).map(String));
  const compOffers = new Set((b.offerProfile ? b.offerProfile.offers.flatMap(o => Object.entries(o.fields).filter(([, v]) => !v.status).map(([k]) => k)) : []));
  setSig('offer_overlap', (subjOffers.size && compOffers.size) ? jaccard(subjOffers, compOffers) : (compOffers.size ? 0.4 : null));
  // geo overlap
  setSig('geographic_overlap', subjectContext.geography && competitor.geography && competitor.geography !== 'UNKNOWN'
    ? (JSON.stringify(subjectContext.geography) === JSON.stringify(competitor.geography) ? 1 : 0.2) : null);
  // price overlap
  setSig('price_overlap', priceRatio == null ? null : clamp01(1 - Math.min(1, Math.abs(Math.log(priceRatio || 1)))));
  // proof strength
  setSig('proof_strength', b.proofProfile ? clamp01((b.proofProfile.proof_count / 4) + (b.proofProfile.has_independent_evidence ? 0.3 : 0)) : null);
  // channel overlap
  const subjCh = new Set((subjectContext.channels || []).map(String));
  const compCh = new Set(competitor.channels || []);
  setSig('channel_overlap', (subjCh.size && compCh.size) ? jaccard(subjCh, compCh) : null);
  // review signal
  const rc = b.proofProfile ? b.proofProfile.items.find(i => i.proof_type === 'review') : null;
  setSig('review_signal', rc && rc.quantity ? clamp01(Number(rc.quantity) / 100) : null);
  // differentiation overlap (both undifferentiated -> higher threat)
  const compDiff = (b.attributes || []).some(a => a.attribute === 'differentiator' && a.kind === 'OBSERVED');
  setSig('differentiation_overlap', compDiff === false ? 0.6 : 0.3);

  let score = 0, wsum = 0;
  for (const k of Object.keys(DEFAULT_WEIGHTS)) if (signals[k] != null) { score += signals[k] * (w[k] || 0); wsum += (w[k] || 0); }
  const norm = wsum > 0 ? score / wsum : null;

  let level;
  if (knownCount < 3 || norm == null) level = 'UNKNOWN';
  else level = norm >= 0.66 ? 'HIGH' : norm >= 0.4 ? 'MEDIUM' : 'LOW';

  const body = {
    schema_version: 'ucdm-competitor-1.0.0',
    competitor_ref: competitor.competitor_ref,
    level,
    score: norm == null ? null : Number(norm.toFixed(6)),
    known_signal_count: knownCount,
    signals,
    weights_version: weights ? 'custom' : WEIGHTS_VERSION,
    weights: w,
    note: 'deterministic; competitor size is NOT automatically threat; UNKNOWN when < 3 signals known',
    produced_by: 'deterministic:ucdm/competitor/threat',
  };
  body.threat_id = 'cmthr_' + sha256Hex(canonicalize({ ...body, threat_id: undefined }));
  return deepFreeze(body);
}
function jaccard(a, b) { const inter = [...a].filter(x => b.has(x)).length; const uni = new Set([...a, ...b]).size; return uni ? inter / uni : 0; }

function validateThreat(t) {
  const errors = [];
  if (!THREAT_LEVELS.includes(t.level)) errors.push(`bad threat level "${t.level}"`);
  if (t.known_signal_count < 3 && t.level !== 'UNKNOWN') errors.push('< 3 known signals must yield UNKNOWN');
  return { valid: errors.length === 0, errors };
}

module.exports = { THREAT_LEVELS, DEFAULT_WEIGHTS, WEIGHTS_VERSION, assessThreat, validateThreat };
