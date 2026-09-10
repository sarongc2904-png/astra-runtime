'use strict';
// [ASTRA-11I §V] OfferOpportunity. Non-autonomous. `expected_lift: NOT_ESTIMATED` always.
// No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const { assess } = require('../validation/confidence');

// buildOfferOpportunities({ gaps, territories, offerSegmentFits, businessInput })
function buildOfferOpportunities({ gaps = [], territories = [], offerSegmentFits = [], businessInput = {} }) {
  const bySeg = {};
  for (const t of territories) for (const s of t.target_segment_refs) bySeg[s] = t;
  const fitBySeg = Object.fromEntries(offerSegmentFits.map(f => [f.segment_id, f]));
  const effortIn = businessInput.opportunity_effort || {};

  // group gaps by the remedy theme -> one opportunity per (segment, theme)
  const themes = new Map();
  for (const g of gaps) {
    const theme = g.gap_type;
    const cur = themes.get(theme) || { theme, gap_refs: [], evidence_refs: new Set() };
    cur.gap_refs.push(g.gap_id);
    for (const er of g.evidence_refs) cur.evidence_refs.add(er);
    themes.set(theme, cur);
  }

  const out = [];
  const targetSeg = territories.length ? territories.map(t => t.target_segment_refs[0]) : [null];
  for (const seg of targetSeg) {
    for (const [theme, info] of [...themes.entries()].sort()) {
      const body = {
        schema_version: 'ucdm-positioning-offer-1.0.0', kind: 'OfferOpportunity',
        opportunity_id: null,
        target_segment_ref: seg,
        theme,
        rationale: `close ${theme} for ${seg || 'the sample'} — evidenced gap`,
        gap_refs: [...info.gap_refs].sort(),
        positioning_refs: seg && bySeg[seg] ? [bySeg[seg].territory_id] : [],
        evidence_refs: [...info.evidence_refs].sort(),
        effort_complexity: effortIn[theme] != null ? String(effortIn[theme]) : 'NOT_SUPPLIED',
        current_offer_fit_band: seg && fitBySeg[seg] ? fitBySeg[seg].fit_band : 'UNKNOWN',
        confidence: assess({ evidence_count: info.evidence_refs.size, distinct_sources: info.gap_refs.length, coverage: 0.4 }),
        unknowns: [effortIn[theme] == null ? 'effort_complexity' : null].filter(Boolean),
        autonomous: false,
        expected_lift: 'NOT_ESTIMATED',
        note: 'analytical opportunity — non-autonomous; no expected lift or commercial outcome is estimated',
        generated_by: 'deterministic:ucdm/positioning_offer',
      };
      body.opportunity_id = 'oo_' + sha256Hex(canonicalize({ ...body, opportunity_id: undefined, confidence: body.confidence.content_hash }));
      out.push(deepFreeze(body));
    }
  }
  return out;
}

function validateOpportunity(o) {
  const errors = [];
  if (o.autonomous !== false) errors.push('an offer opportunity must be non-autonomous');
  if (o.expected_lift !== 'NOT_ESTIMATED') errors.push('expected_lift must be NOT_ESTIMATED');
  if (o.gap_refs.length === 0 && o.evidence_refs.length === 0) errors.push('an opportunity needs a gap or evidence');
  return { valid: errors.length === 0, errors };
}

module.exports = { buildOfferOpportunities, validateOpportunity };
