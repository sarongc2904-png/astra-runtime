'use strict';
// [ASTRA-11E §E] CompetitorOfferProfile. PRESERVES MULTIPLE SIMULTANEOUS OFFERS — the
// homepage offer is not assumed to be the only market offer. Each offer tracks
// source / channel / context and a recency label. No LLM, no web, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const OFFER_FIELDS = Object.freeze(['core_offer', 'price', 'price_type', 'financing', 'discount', 'bonus', 'guarantee', 'risk_reversal', 'trial', 'implementation', 'support', 'delivery_time', 'scarcity', 'urgency', 'bundle', 'cta']);

// buildOfferProfile({ profile, offerItems, pricingObs, snapshotsByDomain })
// One "Offer" per distinct source_ref (a source = one observed offer surface); multiple
// offers per competitor are all retained.
function buildOfferProfile({ profile, offerItems = [], pricingObs = [], referenceTime = null }) {
  const ref = profile.competitor_ref;
  const bySource = new Map(); // source_ref -> { fields:{}, evidence:Set, observed_at }
  const put = (src, field, value, evidence_refs, observed_at) => {
    if (!bySource.has(src)) bySource.set(src, { fields: {}, evidence: new Set(), observed_at: null });
    const s = bySource.get(src);
    if (!(field in s.fields)) s.fields[field] = value;
    for (const e of evidence_refs || []) s.evidence.add(e);
    if (observed_at && (!s.observed_at || Date.parse(observed_at) > Date.parse(s.observed_at))) s.observed_at = observed_at;
  };

  const OFFER_COMP_MAP = { core_product_service: 'core_offer', guarantee: 'guarantee', financing: 'financing', trial: 'trial', bonus: 'bonus', delivery_time: 'delivery_time', discount: 'discount', scarcity: 'scarcity', urgency: 'urgency', bundle: 'bundle', support: 'support', implementation: 'implementation' };
  for (const it of offerItems.filter(o => o.subject_ref === ref)) {
    const field = OFFER_COMP_MAP[it.component] || 'core_offer';
    put(it.source_ref, field, it.detail_text || true, it.evidence_refs, null);
  }
  for (const p of pricingObs.filter(x => x.subject_ref === ref)) {
    put(p.source_ref, 'price', { amount: p.amount, currency: p.currency }, p.evidence_refs, p.observed_at);
    put(p.source_ref, 'price_type', p.pricing_kind, p.evidence_refs, p.observed_at);
  }

  const offers = [...bySource.entries()].sort().map(([src, s]) => {
    const age = s.observed_at && referenceTime ? (Date.parse(referenceTime) - Date.parse(s.observed_at)) / 86400000 : null;
    const recency = age == null ? 'UNKNOWN_CURRENT' : (age <= 180 ? 'CURRENT' : 'HISTORICAL');
    const o = {
      schema_version: 'ucdm-competitor-1.0.0',
      competitor_ref: ref, source_ref: src, channel: 'UNKNOWN', context: 'observed offer surface',
      observed_at: s.observed_at || null, recency,
      fields: Object.fromEntries(OFFER_FIELDS.map(f => [f, f in s.fields ? { value: s.fields[f], source_class: 'OBSERVED' } : { status: 'NOT_OBSERVED_ON_THIS_SURFACE' }])),
      evidence_refs: [...s.evidence].sort(),
    };
    o.offer_id = 'cmoff_' + sha256Hex(canonicalize({ ...o, offer_id: undefined }));
    return deepFreeze(o);
  });

  const body = {
    schema_version: 'ucdm-competitor-1.0.0',
    competitor_ref: ref,
    offer_count: offers.length,
    offers,
    multiple_simultaneous_offers: offers.filter(o => o.recency !== 'HISTORICAL').length > 1,
    note: 'multiple observed offers retained; homepage offer is not assumed to be the only market offer',
  };
  body.offer_profile_id = 'cmoffp_' + sha256Hex(canonicalize({ ...body, offer_profile_id: undefined }));
  return deepFreeze(body);
}

function computeOfferFieldFrequencies(profiles, offerProfiles) {
  const competitorCount = profiles.length || 1;
  const present = {};
  for (const op of offerProfiles) {
    const fieldsSeen = new Set();
    for (const o of op.offers) for (const [f, v] of Object.entries(o.fields)) if (!v.status) fieldsSeen.add(f);
    for (const f of fieldsSeen) present[f] = (present[f] || 0) + 1;
  }
  return deepFreeze({
    schema_version: 'ucdm-competitor-1.0.0', competitor_count: competitorCount,
    frequencies: OFFER_FIELDS.filter(f => present[f]).map(f => ({ field: f, competitor_count: present[f], sample_size: competitorCount, frequency: Number((present[f] / competitorCount).toFixed(6)), status: 'COMPUTED', produced_by: 'deterministic:ucdm/competitor' })),
    coverage_caveat: `sample of ${competitorCount} observed competitors — not a market-wide claim`,
  });
}

module.exports = { OFFER_FIELDS, buildOfferProfile, computeOfferFieldFrequencies };
