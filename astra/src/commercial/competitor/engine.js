'use strict';
// [ASTRA-11E] Competitor Intelligence Engine — deterministic pipeline orchestrator.
//   COMPETITOR OBSERVATIONS (from ASTRA-11D) -> IDENTITY/SCOPE -> ATTRIBUTES -> AGGREGATION
//   -> POSITIONING -> OFFER -> MESSAGE -> PROOF -> FUNNEL/CTA -> CREATIVE
//   -> STRENGTH/WEAKNESS -> COMPETITIVE MATRIX -> SATURATION/WHITE-SPACE -> REPORT
// Fully deterministic. NO LLM, NO web, NO I/O, NO clock (referenceTime is caller-supplied).
// No ASTRA-11E output may feed production routing or autonomous action.
const CP = require('./competitor_profile');
const AM = require('./attribute_model');
const TS = require('./temporal_state');
const POS = require('./positioning');
const OFF = require('./offer_profile');
const MSG = require('./message_profile');
const PRF = require('./proof_profile');
const FUN = require('./funnel_profile');
const CRV = require('./creative_profile');
const HYP = require('./hypotheses');
const MX = require('./competitive_matrix');
const SAT = require('./saturation');
const PMAP = require('./positioning_map');
const THR = require('./threat_assessment');
const DGAP = require('./differentiation_gap');
const OPP = require('./opportunity');
const COV = require('./coverage');
const REP = require('./report');
const { detectConflicts } = require('../research/conflict');

// runCompetitorIntelligence({ researchResult, referenceTime, identityHints, positioningAxes,
//                             threatWeights, subjectContext })
function runCompetitorIntelligence(opts) {
  const rr = opts.researchResult;
  if (!rr || !rr.report || !Array.isArray(rr.facts)) throw new Error('[ASTRA-11E] runCompetitorIntelligence: an ASTRA-11D research result is required');
  const referenceTime = opts.referenceTime;
  if (!referenceTime) throw new Error('[ASTRA-11E] referenceTime is required (no implicit clock)');

  const facts = rr.facts;
  const observations = rr.observations || [];
  const messageObs = rr.message_observations || [];
  const offerItems = rr.offer_items || [];
  const pricingObs = rr.pricing_observations || [];
  const customerSignals = rr.customer_signals || [];
  const envelopesBySource = {};
  for (const e of (rr.ingestion && rr.ingestion.envelopes) || []) envelopesBySource[e.source_id] = e;

  // ---- IDENTITY / SCOPE ----
  const profiles = CP.buildProfiles({ facts, observations, messageObs, offerItems, pricingObs, identityHints: opts.identityHints || {}, referenceTime });
  for (const p of profiles) { const v = CP.validateCompetitorProfile(p); if (!v.valid) throw new Error(`[ASTRA-11E] invalid CompetitorProfile: ${v.errors.join(' | ')}`); }

  // sample medians per currency (for price_position / positioning map)
  const allPrices = {};
  for (const p of pricingObs) (allPrices[p.currency] = allPrices[p.currency] || []).push(p.amount);
  const sampleMedianByCurrency = {};
  for (const [cur, arr] of Object.entries(allPrices)) { const s = arr.slice().sort((a, b) => a - b); sampleMedianByCurrency[cur] = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; }
  const priceRatioByCompetitor = {};
  for (const p of profiles) {
    const mine = pricingObs.filter(x => x.subject_ref === p.competitor_ref);
    if (mine.length) { const cur = mine[0].currency; const s = mine.map(x => x.amount).sort((a, b) => a - b); const med = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; if (sampleMedianByCurrency[cur]) priceRatioByCompetitor[p.competitor_ref] = med / sampleMedianByCurrency[cur]; }
  }

  // ---- CONFLICTS (reuse ASTRA-11D deterministic conflict detection) ----
  // Only single-valued competitor attributes can genuinely conflict: a competitor should
  // have one price and one stated guarantee. Multiple promises/claims/messages per
  // competitor are normal, not contradictory.
  const CI_CONFLICT_TYPES = new Set(['COMPETITOR_PRICE', 'OBSERVED_GUARANTEE']);
  const dc = detectConflicts(facts.filter(f => CP.parseCompetitorRef(f.subject_ref) && CI_CONFLICT_TYPES.has(f.fact_type)));
  // Supplementary deterministic check: the SAME offer component observed for one competitor
  // with materially different detail text is a CATEGORICAL_CONFLICT (e.g. "30-day guarantee"
  // vs "no refunds").
  const offerConflicts = detectOfferComponentConflicts(offerItems.filter(o => CP.parseCompetitorRef(o.subject_ref)));
  const conflicts = [...dc.conflicts, ...offerConflicts].sort((a, b) => (a.conflict_id < b.conflict_id ? -1 : 1));
  const conflictRowsByCompetitor = {};
  for (const c of conflicts) { const row = ({ COMPETITOR_PRICE: 'price', OBSERVED_GUARANTEE: 'guarantee', OBSERVED_CTA: 'cta', OFFER_COMPONENT: 'offer', ADVERTISED_PROMISE: 'promise', PUBLISHED_CLAIM: 'promise' })[c.fact_type]; if (row) (conflictRowsByCompetitor[c.subject_ref] = conflictRowsByCompetitor[c.subject_ref] || []).push(row); }

  // ---- per-competitor models ----
  const byCompetitor = {};
  const sampleBigEnoughForAbsence = profiles.length >= 4;
  for (const p of profiles) {
    const ref = p.competitor_ref;
    const attributes = AM.extractAttributes({ profile: p, facts, messageObs, offerItems });
    for (const a of attributes) { const v = AM.validateAttribute(a); if (!v.valid) throw new Error(`[ASTRA-11E] invalid CompetitorAttribute: ${v.errors.join(' | ')}`); }

    const pricingDated = pricingObs.filter(x => x.subject_ref === ref).map(x => ({ observed_at: x.observed_at, evidence_refs: x.evidence_refs, source_ref: x.source_ref, payload: { amount: x.amount, currency: x.currency, kind: x.pricing_kind } }));
    const pricingSnapshots = TS.buildSnapshots({ competitor_ref: ref, domain: 'pricing', dated_items: pricingDated, referenceTime });

    const positioning = POS.buildPositioning({ profile: p, attributes, pricingObs, sampleMedianByCurrency });
    const offerProfile = OFF.buildOfferProfile({ profile: p, offerItems, pricingObs, referenceTime });
    const messageProfile = MSG.buildMessageProfile({ profile: p, messageObs });
    const proofProfile = PRF.buildProofProfile({ profile: p, messageObs, facts, envelopesBySource });
    const funnelProfile = FUN.buildFunnelProfile({ profile: p, observations, messageObs: messageProfile.items.map(i => ({ subject_ref: ref, message_field: i.message_field, verbatim_text: i.raw.verbatim_text, evidence_refs: i.raw.evidence_refs, source_ref: i.raw.source_ref, raw: i.raw })), pricingObs });
    const creativeProfile = CRV.buildCreativeProfile({ profile: p, messageObs, observations });

    byCompetitor[ref] = {
      profile: p, attributes, pricingSnapshots, pricingCount: pricingDated.length,
      positioning, offerProfile, messageProfile, proofProfile, funnelProfile, creativeProfile,
      conflictRows: conflictRowsByCompetitor[ref] || [],
    };
    const vpos = POS.validatePositioning(positioning); if (!vpos.valid) throw new Error(`[ASTRA-11E] invalid positioning: ${vpos.errors.join(' | ')}`);
    for (const it of messageProfile.items) { const v = MSG.validateMessageItem(it); if (!v.valid) throw new Error(`[ASTRA-11E] invalid message item: ${v.errors.join(' | ')}`); }
    for (const it of proofProfile.items) { const v = PRF.validateProofItem(it); if (!v.valid) throw new Error(`[ASTRA-11E] invalid proof item: ${v.errors.join(' | ')}`); }
    const vf = FUN.validateFunnelProfile(funnelProfile); if (!vf.valid) throw new Error(`[ASTRA-11E] invalid funnel: ${vf.errors.join(' | ')}`);
  }

  // ---- hypotheses / matrix / saturation / gaps / opportunities / threats ----
  const strengthHypotheses = [], weaknessHypotheses = [];
  for (const p of profiles) {
    const b = byCompetitor[p.competitor_ref];
    const hs = HYP.deriveHypotheses({ profile: p, attributes: b.attributes, proofProfile: b.proofProfile, messageProfile: b.messageProfile, offerProfile: b.offerProfile, coverageSupportsAbsence: sampleBigEnoughForAbsence });
    for (const h of hs) { const v = HYP.validateHypothesis(h); if (!v.valid) throw new Error(`[ASTRA-11E] invalid hypothesis: ${v.errors.join(' | ')}`); (h.kind === 'CompetitorStrengthHypothesis' ? strengthHypotheses : weaknessHypotheses).push(h); }
  }

  const matrix = MX.buildMatrix({ profiles, byCompetitor });
  MX.validateMatrix(matrix);
  const marketSaturation = SAT.buildMarketSaturation({ profiles, byCompetitor });
  const messageSaturation = SAT.buildMessageSaturation({ profiles, byCompetitor });

  const coverage = COV.computeCoverage({ profiles, byCompetitor, conflicts, ingestion: rr.ingestion, referenceTime });
  const completion = COV.assessCompletion({ coverage, conflicts, ingestion: rr.ingestion });

  const differentiationGaps = DGAP.deriveDifferentiationGaps({ marketSaturation, messageSaturation, coverage });
  for (const g of differentiationGaps) { const v = DGAP.validateGap(g); if (!v.valid) throw new Error(`[ASTRA-11E] invalid differentiation gap: ${v.errors.join(' | ')}`); }

  const opportunities = OPP.deriveOpportunities({ differentiationGaps, weaknessHypotheses });
  for (const o of opportunities) { const v = OPP.validateOpportunity(o); if (!v.valid) throw new Error(`[ASTRA-11E] invalid opportunity: ${v.errors.join(' | ')}`); }

  const threatAssessments = profiles.map(p => THR.assessThreat({ competitor: p, b: byCompetitor[p.competitor_ref], subjectContext: opts.subjectContext || {}, weights: opts.threatWeights, priceRatio: priceRatioByCompetitor[p.competitor_ref] || null }));
  for (const t of threatAssessments) { const v = THR.validateThreat(t); if (!v.valid) throw new Error(`[ASTRA-11E] invalid threat assessment: ${v.errors.join(' | ')}`); }

  const positioningMap = opts.positioningAxes ? PMAP.buildPositioningMap({ axes: opts.positioningAxes, profiles, byCompetitor, priceRatioByCompetitor }) : PMAP.buildPositioningMap({ axes: [], profiles, byCompetitor });
  const clusters = PMAP.buildClusters({ profiles, byCompetitor, priceRatioByCompetitor });

  const report = REP.buildReport({
    request: rr.request, referenceTime, profiles, byCompetitor,
    matrix, marketSaturation, messageSaturation, positioningMap, clusters,
    strengthHypotheses, weaknessHypotheses, threatAssessments, differentiationGaps, opportunities,
    conflicts, coverage, completion, excludedInferred: rr.excluded_inferred || [], ingestion: rr.ingestion,
  });

  return {
    report, profiles, byCompetitor,
    matrix, marketSaturation, messageSaturation, positioningMap, clusters,
    strengthHypotheses, weaknessHypotheses, threatAssessments, differentiationGaps, opportunities,
    conflicts, coverage, completion,
    priceRatioByCompetitor, sampleMedianByCurrency,
    provenance_note: 'ASTRA-11E deterministic pipeline. No LLM. No production routing. No autonomous action.',
  };
}

// Deterministic: group OFFER_COMPONENT facts by (competitor, component); if a component has
// >= 2 distinct normalized detail strings, that is a CATEGORICAL_CONFLICT.
function detectOfferComponentConflicts(offerItems) {
  const { sha256Hex, canonicalize } = require('../validation/canonical');
  const groups = new Map();
  for (const it of offerItems) {
    const comp = it.component || 'offer';
    const detail = it.detail_text != null ? String(it.detail_text).trim().toLowerCase() : null;
    const key = `${it.subject_ref}::${comp}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ it, detail });
  }
  const out = [];
  for (const [key, arr] of [...groups.entries()].sort()) {
    const details = [...new Set(arr.map(x => x.detail).filter(Boolean))];
    if (details.length >= 2) {
      const [subject_ref, component] = key.split('::');
      const c = {
        schema_version: 'ucdm-research-1.0.0', kind: 'CATEGORICAL_CONFLICT',
        fact_type: 'OBSERVED_GUARANTEE', // reported under the guarantee/offer dimension
        offer_component: component, subject_ref,
        fact_refs: [...new Set(arr.map(x => x.it.offer_item_id))].sort(),
        source_refs: [...new Set(arr.map(x => x.it.source_ref).filter(Boolean))].sort(),
        detail: { component, values: details.sort() },
        status: 'OPEN', resolution: null,
      };
      c.conflict_id = 'mcf_' + sha256Hex(canonicalize({ ...c, conflict_id: undefined }));
      out.push(Object.freeze(c));
    }
  }
  return out;
}

module.exports = { runCompetitorIntelligence };
