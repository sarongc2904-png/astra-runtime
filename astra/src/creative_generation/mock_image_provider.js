'use strict';
// MOCK_IMAGE_PROVIDER — deterministic, offline. Produces a structured GENERATED_CREATIVE *descriptor*
// (no pixels) with a machine-readable `qa_features` vector derived from the prompt package, so Visual QA
// is deterministic and can genuinely FAIL. Controllable via a `defect_profile` to build QA fixtures and
// force revisions. It never claims to be a live render.
const crypto = require('crypto');

// Known controllable defects (map to Visual QA criteria / fixtures).
const DEFECTS = ['CLUTTERED_LAYOUT', 'LOW_CONTRAST', 'UNSAFE_TEXT_PLACEMENT', 'WEAK_CTA', 'OFF_BRIEF_VISUAL',
  'FABRICATED_CLAIM', 'MOBILE_UNREADABLE', 'BROKEN_TYPOGRAPHY', 'MISSING_REFERENCE_IDENTITY'];

function hash(obj) { return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex').slice(0, 16); }

// Derive baseline (defect-free) qa_features from the prompt package text (all satisfied by default).
function baselineFeatures(req) {
  const p = (req.prompt || '').toLowerCase();
  const aspect = req.aspect_ratio || '1:1';
  const mobile = /9:16|4:5/.test(aspect) || (req.constraints && req.constraints.primary_surface === 'mobile');
  return {
    dominant_focal_point: /focal point|hero subject|one clear/.test(p) ? 1 : 0.8,
    hierarchy_clarity: /hierarchy|reading order/.test(p) ? 1 : 0.85,
    contrast: /contrast|separation/.test(p) ? 1 : 0.85,
    clutter: 0.1, // low is good
    cta_visibility: 0.9,
    composition_quality: 0.9,
    balance: 0.85,
    readability: 0.9,
    safe_zones_ok: true,
    mobile_readable: mobile ? 0.85 : 0.9,
    copy_density: (req.constraints && (req.constraints.information_density === 'minimal' || req.constraints.information_density === 'low')) ? 0.2 : 0.4,
    brand_adherence: 1,
    prompt_adherence: 1,
    concept_fidelity: 1,
    typography_zone_integrity: 1,
    offer_alignment: 1,
    audience_alignment: 0.9,
    visual_clutter: 0.1,
  };
}

// Apply a defect profile → degrade specific features + emit simulated generated_text where relevant.
function applyDefects(features, defects, req) {
  const f = Object.assign({}, features);
  const generated_text = []; // simulated AI-rendered text baked into the image
  const active = new Set(defects || []);
  // headline text the model "tried" to render (from overlay if present)
  const headlineObj = (req.metadata && req.metadata.overlay && req.metadata.overlay.headline);
  const headline = (headlineObj && typeof headlineObj === 'object' ? headlineObj.text : headlineObj) || 'YOUR HEADLINE';
  if (active.has('CLUTTERED_LAYOUT')) { f.clutter = 0.8; f.visual_clutter = 0.8; f.composition_quality = 0.4; f.dominant_focal_point = 0.4; }
  if (active.has('LOW_CONTRAST')) { f.contrast = 0.3; f.readability = 0.4; }
  if (active.has('UNSAFE_TEXT_PLACEMENT')) { f.safe_zones_ok = false; f.typography_zone_integrity = 0.3; }
  if (active.has('WEAK_CTA')) { f.cta_visibility = 0.3; }
  if (active.has('OFF_BRIEF_VISUAL')) { f.concept_fidelity = 0.3; f.prompt_adherence = 0.35; f.offer_alignment = 0.4; }
  if (active.has('MOBILE_UNREADABLE')) { f.mobile_readable = 0.3; f.readability = 0.45; }
  if (active.has('BROKEN_TYPOGRAPHY')) { f.typography_zone_integrity = 0.4; generated_text.push({ text: 'YOUOR HEADLIN3', garbled: true }); }
  if (active.has('FABRICATED_CLAIM')) { generated_text.push({ text: '100% GUARANTEED — CERTIFIED #1 CLINIC', garbled: false, claim_like: true }); }
  else if (!active.has('BROKEN_TYPOGRAPHY')) { generated_text.push({ text: headline, garbled: false }); }
  return { features: f, generated_text };
}

function makeProvider(opts = {}) {
  const state = { calls: 0 };
  return {
    provider: 'mock_image_provider',
    model: opts.model || 'mock-diffusion-v0',
    is_mock: true,
    async healthCheck() { return { provider: 'mock_image_provider', ok: true, status: 'READY', is_mock: true }; },
    // request: { prompt, negative_prompt, aspect_ratio, format, constraints, reference_assets, metadata }
    // metadata may carry { defect_profile:[...], overlay:{...}, attempt } to drive deterministic fixtures.
    async generateCreative(req) {
      state.calls++;
      if (!req || !req.prompt) return { status: 'MALFORMED', provider: 'mock_image_provider', errors: ['missing prompt'], calls: state.calls };
      const defects = (req.metadata && req.metadata.defect_profile) || opts.defect_profile || [];
      const base = baselineFeatures(req);
      const { features, generated_text } = applyDefects(base, defects, req);
      const reserved = (req.constraints && req.constraints.safe_zones) || /9:16/.test(req.aspect_ratio || '')
        ? ['top-250px', 'bottom-320px'] : ['standard-margins'];
      return {
        status: 'GENERATED', provider: 'mock_image_provider', model: this.model, is_mock: true,
        asset_id: 'mock_' + hash({ p: req.prompt, a: req.aspect_ratio, attempt: req.metadata && req.metadata.attempt, defects }),
        aspect_ratio: req.aspect_ratio, format: req.format,
        prompt_used: req.prompt, negative_prompt_used: req.negative_prompt || '',
        reserved_text_zones: reserved,
        generated_text,
        qa_features: features,
        reference_assets_used: (req.reference_assets || []).map(r => ({ id: r.id, type: r.type, provenance: r.provenance || 'USER_PROVIDED' })),
        metadata: { seed: hash(req.prompt), defect_profile: defects, calls: state.calls, cost: null },
        rendered_pixels: false, // it is a descriptor, not a real image
      };
    },
    _state: state,
  };
}

module.exports = { makeProvider, DEFECTS, baselineFeatures };
