'use strict';
// [ASTRA-11E §I] Observed competitor creative patterns ONLY. This gate does NOT generate
// creative strategy. Attributes trace to ASTRA-11C verbatim. Analytical tags (angle, tone)
// come from a controlled mapping. No LLM, no web, no I/O.
const { canonicalize, sha256Hex, deepFreeze, nfcLF } = require('../validation/canonical');
const { classifyPattern } = require('./message_profile');

const CREATIVE_ATTRS = Object.freeze(['format', 'visual_concept', 'hook', 'headline', 'offer', 'cta', 'proof', 'pain', 'desire', 'mechanism', 'persona', 'tone', 'angle', 'platform_context']);

// controlled angle taxonomy (deterministic)
const ANGLE_MAP = {
  PRICE: /BEST_PRICE/, SPEED: /FAST/, OUTCOME: /RESULTS/, TECH: /TECHNOLOGY/, RISK_REVERSAL: /GUARANTEED/,
  STATUS: /PREMIUM/, PERSONALIZATION: /PERSONALIZED/, COMFORT: /PAIN_FREE/,
};

// buildCreativeProfile({ profile, messageObs, observations })
function buildCreativeProfile({ profile, messageObs = [], observations = [] }) {
  const ref = profile.competitor_ref;
  const mine = messageObs.filter(m => m.subject_ref === ref);
  const platformContext = [...new Set(observations
    .filter(o => o.subject && ((o.subject.state === 'RESOLVED' && `subject:Competitor:${o.subject.subject_id}` === ref) || (o.subject.label && `subject:Competitor:${o.subject.label}` === ref)))
    .map(o => (o.structured_values || {}).placement_class || (o.structured_values || {}).channel_class).filter(Boolean))].sort();

  const items = mine.map(m => {
    const patterns = classifyPattern(m.verbatim_text);
    const angles = Object.entries(ANGLE_MAP).filter(([, re]) => patterns.some(p => re.test(p))).map(([a]) => a);
    const it = {
      schema_version: 'ucdm-competitor-1.0.0',
      creative_field: m.message_field,
      raw: { verbatim_text: m.verbatim_text, verbatim_hash: m.verbatim_hash, evidence_refs: m.evidence_refs, source_ref: m.source_ref, source_class: 'OBSERVED' },
      analysis: { angles: angles.length ? angles : ['UNKNOWN'], message_patterns: patterns, taxonomy: 'ucdm-competitor-creative-v1', analytical: true, produced_by: 'deterministic:ucdm/competitor' },
    };
    it.creative_item_id = 'cmcrv_' + sha256Hex(canonicalize({ ...it, creative_item_id: undefined }));
    return deepFreeze(it);
  });

  const body = {
    schema_version: 'ucdm-competitor-1.0.0',
    competitor_ref: ref,
    platform_context: platformContext.length ? platformContext : ['UNKNOWN'],
    creative_count: items.length,
    items,
    angles_present: [...new Set(items.flatMap(i => i.analysis.angles))].sort(),
    formats_present: ['UNKNOWN'], // format is not observable from text-only fixtures
  };
  body.creative_profile_id = 'cmcrvp_' + sha256Hex(canonicalize({ ...body, creative_profile_id: undefined }));
  return deepFreeze(body);
}

module.exports = { CREATIVE_ATTRS, ANGLE_MAP, buildCreativeProfile };
