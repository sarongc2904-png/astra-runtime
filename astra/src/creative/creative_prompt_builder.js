'use strict';
// CREATIVE_PROMPT_BUILDER — assembles an OPERATIONAL image-generation prompt package from a
// creative direction. Deterministic. Does NOT call any image provider (ASTRA-08B prohibition):
// the output is a prompt package for later generation (ASTRA-08C), nothing more.
// Prompts must not encode unsupported factual claims (no invented logos/certifications/stats).

const ASPECT_BY_FORMAT = {
  meta_feed: '1:1', meta_story: '9:16', reel: '9:16', story: '9:16', square: '1:1',
  landscape: '16:9', portrait: '4:5', print_poster: '2:3', print_a4: '210:297', banner: '16:9',
};

// Fields that would be factual claims if invented — stripped from the visual prompt unless USER_PROVIDED.
const CLAIM_RISK = [/\b\d+%\b/, /\bguarantee\b/i, /\bcertified\b/i, /\baward[- ]winning\b/i, /\bnº?\s?1\b/i, /\bnumber one\b/i, /\bclinically proven\b/i, /\btestimonial\b/i];

function aspectFor(format) {
  const k = String(format || '').toLowerCase().replace(/\s+/g, '_');
  return ASPECT_BY_FORMAT[k] || (k.includes('story') || k.includes('reel') ? '9:16' : '1:1');
}

function safeText(s, max = 240) { return String(s || '').replace(/\s+/g, ' ').trim().slice(0, max); }

// Scrub claim-risk phrases from a subject/environment line unless flagged user-provided.
function scrubClaims(text, userFacts) {
  let t = String(text || '');
  if (userFacts && userFacts.allow_claims) return t;
  const found = [];
  for (const re of CLAIM_RISK) if (re.test(t)) { found.push(re.source); t = t.replace(re, '[CLAIM_REQUIRES_SUBSTANTIATION]'); }
  return { text: t, scrubbed: found };
}

// direction: the assembled creative direction object. constraints: merged creative constraints.
function build(direction, constraints = {}, opts = {}) {
  const d = direction || {};
  const format = d.format || constraints.format || 'meta_feed';
  const aspect = d.aspect_ratio || aspectFor(format);
  const subjectRaw = d.image_direction || d.visual_metaphor_or_mechanism || d.creative_concept || 'primary subject expressing the core idea';
  const subjectScrub = scrubClaims(subjectRaw, opts.user_facts);
  const prohibited = []
    .concat(constraints.prohibited_elements || [])
    .concat(['fabricated logos', 'invented certifications or awards', 'fake testimonials', 'unverified statistics', 'competitor trademarks', 'text claims not provided by the user']);

  const pkg = {
    // operational fields
    subject: safeText(subjectScrub.text),
    environment: safeText(d.environment || d.art_direction || 'context that reinforces the single-minded proposition'),
    composition: safeText(d.composition || 'balanced composition with one clear focal point'),
    framing: safeText(constraints.framing || d.framing || 'medium shot, product/subject prominent'),
    camera_perspective: safeText(d.camera_perspective || (constraints.framing === 'direct_to_camera' ? 'eye-level, subject facing camera' : 'eye-level, slight hero angle')),
    lighting: safeText(d.lighting || 'clean directional key light with soft fill; high subject separation'),
    palette: safeText(d.color_direction || 'brand-aligned palette with strong tonal contrast'),
    materials_textures: safeText(d.materials_textures || 'realistic materials consistent with the product category'),
    visual_hierarchy: safeText(d.visual_hierarchy || 'subject → headline → CTA reading order'),
    negative_space: safeText(d.negative_space_strategy || 'deliberate negative space reserved for headline and CTA'),
    typography_placement_zones: safeText(d.typography_zones || 'headline top-third; CTA lower-third; keep type clear of the subject'),
    aspect_ratio: aspect,
    brand_constraints: safeText((constraints.brand && JSON.stringify(constraints.brand)) || d.brand_constraints || 'follow supplied brand guide; do not invent brand marks'),
    safe_zones: (constraints.safe_zones || /story|reel|9:16/.test(aspect)) ? 'reserve top 250px and bottom 320px UI-safe margins; keep key content centered' : 'reserve standard edge margins',
    prohibited_elements: Array.from(new Set(prohibited)),
    style: safeText(constraints.style || d.style || 'clean advertising art direction'),
  };

  // Compose a single operational prompt string (order matters for most image models).
  const promptString = [
    pkg.style && `${pkg.style} advertising image`,
    `subject: ${pkg.subject}`,
    `environment: ${pkg.environment}`,
    `composition: ${pkg.composition}, ${pkg.framing}, ${pkg.camera_perspective}`,
    `lighting: ${pkg.lighting}`,
    `color palette: ${pkg.palette}`,
    `materials: ${pkg.materials_textures}`,
    `visual hierarchy: ${pkg.visual_hierarchy}`,
    `negative space: ${pkg.negative_space}`,
    `typography zones (leave empty for later type): ${pkg.typography_placement_zones}`,
    `aspect ratio ${pkg.aspect_ratio}`,
  ].filter(Boolean).join('; ');

  const negativePrompt = [
    'no fabricated logos', 'no invented certifications or awards', 'no fake testimonials',
    'no unverified statistics or claims', 'no competitor trademarks', 'no illegible text',
    'no cluttered composition', 'no low-contrast subject/background',
    constraints.information_density === 'minimal' || constraints.information_density === 'low' ? 'no dense copy blocks' : null,
  ].filter(Boolean).join(', ');

  return {
    image_generation_prompt: promptString,
    prompt_package: pkg,
    negative_prompt_or_avoidance_guidance: negativePrompt,
    claim_safety: { scrubbed_from_subject: subjectScrub.scrubbed, policy: 'no unsupported factual claims embedded in prompt' },
    provider_invoked: false, // ASTRA-08B never generates images
    ready_for_generation_note: 'This is a prompt package only; image generation is deferred to ASTRA-08C under separate authorization.',
  };
}

module.exports = { build, aspectFor, ASPECT_BY_FORMAT, scrubClaims, CLAIM_RISK };
