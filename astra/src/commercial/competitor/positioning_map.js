'use strict';
// [ASTRA-11E §O §P] PositioningMap (only with EXPLICITLY-DEFINED axes) + deterministic
// competitor clusters (taxonomy-based). If data is insufficient, placement is UNKNOWN.
// The engine NEVER invents an axis and treats it as canonical. No LLM, no web, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

// Default axes are OFFERED as options; a caller must pass them explicitly to place anyone.
const DEFAULT_AXES = Object.freeze([
  { id: 'price', left: 'economical', right: 'premium', rubric: 'competitor median price vs sample median: <=0.8x economical, >=1.25x premium, else mid' },
  { id: 'specialization', left: 'generalist', right: 'specialist', rubric: 'observed category/sub_category breadth (1 category = specialist)' },
  { id: 'speed_vs_customization', left: 'speed', right: 'customization', rubric: 'FAST message pattern -> speed; PERSONALIZED/mechanism -> customization' },
  { id: 'touch', left: 'self_service', right: 'high_touch', rubric: 'observed touchpoints requiring contact/call -> high_touch' },
]);

const CLUSTERS = Object.freeze(['price_led', 'technology_led', 'premium_service', 'specialist', 'convenience_led', 'results_led']);

function placeOnAxis(axis, b, ctx) {
  switch (axis.id) {
    case 'price': {
      const r = ctx.priceRatioByCompetitor[b.competitor_ref];
      if (r == null) return { position: 'UNKNOWN', reason: 'no observed price' };
      return { position: r <= 0.8 ? 'economical' : r >= 1.25 ? 'premium' : 'mid', score: Number(r.toFixed(4)) };
    }
    case 'specialization': {
      const cats = (b.profile && b.profile.products_services) || [];
      if (!cats.length) return { position: 'UNKNOWN', reason: 'no observed category' };
      return { position: cats.length === 1 ? 'specialist' : 'generalist' };
    }
    case 'speed_vs_customization': {
      const pats = (b.messageProfile && b.messageProfile.patterns_present) || [];
      if (pats.includes('FAST')) return { position: 'speed' };
      if (pats.includes('PERSONALIZED') || (b.attributes || []).some(a => a.attribute === 'mechanism' && a.kind === 'OBSERVED')) return { position: 'customization' };
      return { position: 'UNKNOWN', reason: 'no speed/customization signal' };
    }
    case 'touch': {
      const tp = (b.funnelProfile && b.funnelProfile.observed_touchpoints) || [];
      if (!tp.length) return { position: 'UNKNOWN', reason: 'no observed touchpoints' };
      return { position: tp.some(t => ['call', 'consultation', 'booking', 'whatsapp_contact'].includes(t)) ? 'high_touch' : 'self_service' };
    }
    default: return { position: 'UNKNOWN', reason: 'unknown axis' };
  }
}

// buildPositioningMap({ axes (REQUIRED, explicit), profiles, byCompetitor, priceRatioByCompetitor })
function buildPositioningMap({ axes, profiles, byCompetitor, priceRatioByCompetitor = {} }) {
  if (!Array.isArray(axes) || axes.length === 0) {
    return deepFreeze({ schema_version: 'ucdm-competitor-1.0.0', status: 'NO_AXES_DEFINED', note: 'a PositioningMap requires explicitly-defined axes; none supplied', axes: [], placements: [] });
  }
  const ctx = { priceRatioByCompetitor };
  const placements = profiles.map(p => {
    const b = { ...(byCompetitor[p.competitor_ref] || {}), profile: p, competitor_ref: p.competitor_ref };
    const axisPos = {};
    for (const ax of axes) axisPos[ax.id] = { ...placeOnAxis(ax, b, ctx), axis: { id: ax.id, left: ax.left, right: ax.right, rubric: ax.rubric } };
    return { competitor_ref: p.competitor_ref, name: p.name, axis_positions: axisPos, evidence_refs: p.evidence_refs };
  });
  const body = {
    schema_version: 'ucdm-competitor-1.0.0',
    axes: axes.map(a => ({ id: a.id, axis_definition: `${a.left} <-> ${a.right}`, rubric: a.rubric })),
    placements,
    generated_by: 'deterministic:ucdm/competitor',
    note: 'axes are caller-defined and explicit; unknown placements are preserved',
  };
  body.map_id = 'cmmap_' + sha256Hex(canonicalize({ ...body, map_id: undefined }));
  return deepFreeze(body);
}

// deterministic taxonomy-based clusters
function buildClusters({ profiles, byCompetitor, priceRatioByCompetitor = {} }) {
  const assign = (p) => {
    const b = byCompetitor[p.competitor_ref] || {};
    const pats = (b.messageProfile && b.messageProfile.patterns_present) || [];
    const r = priceRatioByCompetitor[p.competitor_ref];
    if (pats.includes('TECHNOLOGY')) return 'technology_led';
    if (r != null && r >= 1.25 && (b.proofProfile && b.proofProfile.proof_count >= 1)) return 'premium_service';
    if (pats.includes('BEST_PRICE') || (r != null && r <= 0.8)) return 'price_led';
    if (pats.includes('RESULTS')) return 'results_led';
    if (pats.includes('FAST')) return 'convenience_led';
    if ((p.products_services || []).length === 1) return 'specialist';
    return 'UNCLASSIFIED';
  };
  const groups = {};
  for (const p of profiles) { const c = assign(p); (groups[c] = groups[c] || []).push(p.competitor_ref); }
  return deepFreeze({
    schema_version: 'ucdm-competitor-1.0.0',
    method: 'deterministic-taxonomy', taxonomy: CLUSTERS,
    clusters: Object.entries(groups).sort().map(([cluster, members]) => ({ cluster, members: members.sort(), size: members.length })),
    analytical: true, generated_by: 'deterministic:ucdm/competitor',
  });
}

module.exports = { DEFAULT_AXES, CLUSTERS, buildPositioningMap, buildClusters };
