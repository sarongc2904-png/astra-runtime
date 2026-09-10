'use strict';
// [ASTRA-11E §A] Canonical CompetitorProfile. Built ONLY from ASTRA-11D evidence
// (MarketFacts + normalized observations). NO fuzzy / LLM identity resolution. Two distinct
// competitor subject_refs are NEVER merged on name similarity. Ambiguity is preserved.
// No LLM, no web, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const { assess } = require('../validation/confidence');

const COMPETITOR_SCHEMA_VERSION = 'ucdm-competitor-1.0.0';
const IDENTITY_STATUS = Object.freeze(['RESOLVED', 'UNRESOLVED', 'AMBIGUOUS']);

// subject_ref shapes from ASTRA-11D: "subject:Competitor:<id>" (resolved) |
// "subject:Competitor:<label>" | "subject:Competitor:UNRESOLVED".
function parseCompetitorRef(subject_ref) {
  const m = /^subject:Competitor:(.+)$/.exec(subject_ref || '');
  if (!m) return null;
  const tail = m[1];
  return { key: subject_ref, tail, resolved: tail !== 'UNRESOLVED' && !/^UNRESOLVED$/i.test(tail) };
}

// buildProfiles({ facts, observations, messageObs, offerItems, pricingObs, identityHints, referenceTime })
//   identityHints (optional, human-supplied, deterministic):
//     { ambiguous: [[refA, refB], ...], aliases: { <competitor_key>: ["alt name", ...] } }
function buildProfiles(input) {
  const { facts = [], observations = [], messageObs = [], offerItems = [], pricingObs = [], identityHints = {}, referenceTime = null } = input;
  const ambiguousPairs = (identityHints.ambiguous || []).map(p => [String(p[0]), String(p[1])]);
  const ambiguousMap = new Map();
  for (const [a, b] of ambiguousPairs) {
    (ambiguousMap.get(a) || ambiguousMap.set(a, new Set()).get(a)).add(b);
    (ambiguousMap.get(b) || ambiguousMap.set(b, new Set()).get(b)).add(a);
  }

  const groups = new Map(); // subject_ref -> { facts, obs, msg, offers, pricing }
  const touch = (ref) => { if (!groups.has(ref)) groups.set(ref, { facts: [], obs: [], msg: [], offers: [], pricing: [] }); return groups.get(ref); };
  for (const f of facts) if (parseCompetitorRef(f.subject_ref)) touch(f.subject_ref).facts.push(f);
  for (const o of observations) { const s = o.subject; const ref = s && s.state === 'RESOLVED' ? `subject:Competitor:${s.subject_id}` : (s && s.subject_type === 'Competitor' ? `subject:Competitor:${s.label || 'UNRESOLVED'}` : null); if (ref && parseCompetitorRef(ref)) touch(ref).obs.push(o); }
  for (const m of messageObs) if (parseCompetitorRef(m.subject_ref)) touch(m.subject_ref).msg.push(m);
  for (const it of offerItems) if (parseCompetitorRef(it.subject_ref)) touch(it.subject_ref).offers.push(it);
  for (const p of pricingObs) if (parseCompetitorRef(p.subject_ref)) touch(p.subject_ref).pricing.push(p);

  const profiles = [];
  for (const [ref, g] of [...groups.entries()].sort()) {
    const parsed = parseCompetitorRef(ref);
    const allEv = [...new Set([...g.facts, ...g.msg, ...g.offers, ...g.pricing].flatMap(x => x.evidence_refs || []))].sort();
    const sourceRefs = [...new Set([...g.facts, ...g.msg, ...g.offers, ...g.pricing, ...g.obs].map(x => x.source_ref).filter(Boolean))].sort();
    const geos = [...new Set(g.facts.map(f => f.geography).filter(x => x && x !== 'UNKNOWN').map(x => (typeof x === 'object' ? JSON.stringify(x) : String(x))))].sort();
    const channels = [...new Set(g.obs.map(o => (o.structured_values || {}).channel_class || (o.structured_values || {}).placement_class).filter(Boolean))].sort();
    const categories = [...new Set(g.obs.map(o => (o.structured_values || {}).product_category).filter(Boolean))].sort();

    let identity_status = parsed.resolved ? 'RESOLVED' : 'UNRESOLVED';
    let ambiguous_with = [];
    if (ambiguousMap.has(ref)) { identity_status = 'AMBIGUOUS'; ambiguous_with = [...ambiguousMap.get(ref)].sort(); }

    const confidence = assess({
      evidence_count: allEv.length, distinct_sources: sourceRefs.length,
      newest_evidence_age_days: 90, coverage: 0.5, agree_count: 1, conflict_count: 0, data_quality: 0.6,
    });

    const body = {
      schema_version: COMPETITOR_SCHEMA_VERSION,
      competitor_id: 'cmp_' + sha256Hex(ref).slice(0, 24),
      competitor_ref: ref,
      name: parsed.tail === 'UNRESOLVED' ? 'UNKNOWN' : parsed.tail,
      aliases: [...((identityHints.aliases && identityHints.aliases[ref]) || [])].map(String).sort(),
      category: categories[0] || 'UNKNOWN',
      sub_category: 'UNKNOWN',
      geography: geos.length === 1 ? tryParse(geos[0]) : (geos.length ? geos.map(tryParse) : 'UNKNOWN'),
      locations: [],
      business_model: 'UNKNOWN',
      audience: 'UNKNOWN',
      products_services: categories,
      channels,
      source_refs: sourceRefs,
      evidence_refs: allEv,
      identity_status,
      ambiguous_with,
      identity_resolution_method: 'EXPLICIT_ONLY',   // never FUZZY, never LLM
      confidence,
      fact_count: g.facts.length, message_count: g.msg.length, offer_item_count: g.offers.length, pricing_count: g.pricing.length,
    };
    body.profile_hash = 'cmpp_' + sha256Hex(canonicalize({ ...body, profile_hash: undefined, confidence: confidence.content_hash }));
    profiles.push(deepFreeze(body));
  }
  return profiles;
}
function tryParse(s) { try { return JSON.parse(s); } catch { return s; } }

function validateCompetitorProfile(p) {
  const errors = [];
  if (!IDENTITY_STATUS.includes(p.identity_status)) errors.push(`bad identity_status "${p.identity_status}"`);
  if (p.identity_resolution_method !== 'EXPLICIT_ONLY') errors.push('identity_resolution_method must be EXPLICIT_ONLY (no fuzzy/LLM)');
  if (p.identity_status === 'AMBIGUOUS' && (!p.ambiguous_with || p.ambiguous_with.length === 0)) errors.push('AMBIGUOUS profile must name ambiguous_with');
  if (p.identity_status === 'RESOLVED' && p.name === 'UNKNOWN') errors.push('RESOLVED profile should have a name');
  return { valid: errors.length === 0, errors };
}

module.exports = { COMPETITOR_SCHEMA_VERSION, IDENTITY_STATUS, buildProfiles, validateCompetitorProfile, parseCompetitorRef };
