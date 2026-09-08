'use strict';
// TYPOGRAPHY_OVERLAY_SPEC — AI-rendered text is NOT automatically final typography. This separates the
// VISUAL_GENERATION_PROMPT (which may reserve clean text zones) from an exact, machine-readable overlay
// spec applied deterministically after generation. It never invents copy: headline/supporting/CTA come
// from the Creative Director direction (or USER_PROVIDED_FACTS), verbatim.

function strip(s, max = 240) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, max); }

// Extract the exact copy the Creative Director approved. The CD stores directions as sentences; the
// operator supplies the exact final strings via user_facts.copy when available. We do not fabricate.
function extractCopy(direction, userFacts) {
  const uc = (userFacts && userFacts.copy) || {};
  return {
    headline: strip(uc.headline || direction.headline_direction),
    supporting_copy: strip(uc.supporting_copy || direction.supporting_copy_direction),
    cta: strip(uc.cta || direction.cta_direction),
    copy_source: uc.headline || uc.cta ? 'USER_PROVIDED_FACTS' : 'CREATIVE_DIRECTOR_DECISION',
  };
}

// Build the overlay spec from an approved Creative Director direction + constraints.
function build(direction, constraints = {}, userFacts) {
  const copy = extractCopy(direction, userFacts);
  const aspect = direction.aspect_ratio || '1:1';
  const mobile = constraints.primary_surface === 'mobile' || /9:16|4:5/.test(aspect);
  const safe = constraints.safe_zones || /9:16/.test(aspect);
  return {
    headline: { text: copy.headline, hierarchy_level: 1, placement: 'top-third', alignment: 'left', relative_prominence: 'dominant', legibility: mobile ? 'large / high-contrast for small screens' : 'high', source: copy.copy_source },
    supporting_copy: { text: copy.supporting_copy, hierarchy_level: 2, placement: 'below-headline', alignment: 'left', relative_prominence: constraints.information_density === 'minimal' ? 'suppressed' : 'secondary', legibility: 'clear', source: copy.copy_source },
    cta: { text: copy.cta, hierarchy_level: 2, placement: 'lower-third', alignment: 'center', relative_prominence: 'high (single primary CTA)', legibility: 'high', source: copy.copy_source },
    safe_zone_constraints: safe ? ['top UI-safe margin', 'bottom UI-safe margin', 'keep headline+CTA inside safe area'] : ['standard edge margins'],
    reserve_clean_text_zones: true,
    note: 'AI-rendered in-image text is a placeholder only; final typography is applied from this spec. Do not treat garbled generated text as final.',
  };
}

// Validate that an overlay spec is complete + honest (no missing exact copy where required).
function validate(spec) {
  const errors = [];
  for (const k of ['headline', 'cta']) { if (!spec[k] || !spec[k].text) errors.push('missing overlay ' + k + ' text'); }
  if (!spec.safe_zone_constraints || !spec.safe_zone_constraints.length) errors.push('missing safe_zone_constraints');
  return { valid: errors.length === 0, errors };
}

module.exports = { build, validate, extractCopy };
