'use strict';
// VISUAL_CREATIVE_QA — evaluates a GENERATED_CREATIVE descriptor against 20 criteria and returns
// PASS / PASS_WITH_WARNINGS / FAIL with machine-readable reasons + remediation targets. It MUST be able
// to reject generated work. Preserves QA source separation and never converts VISUAL_INFERENCE into
// evidence. Unsupported generated text is caught via claim_guard.
const claimGuard = require('./claim_guard');

const SOURCE_CLASSES = ['DESIGN_EVIDENCE', 'CREATIVE_DIRECTOR_DECISION', 'USER_CONSTRAINT', 'VISUAL_INFERENCE', 'CURRENT_RESEARCH_REQUIRED'];

// higher-is-better feature check → PASS/WARN/FAIL
function hi(v, warn = 0.7, fail = 0.5) { const x = typeof v === 'number' ? v : (v ? 1 : 0); return x >= warn ? 'PASS' : (x >= fail ? 'WARN' : 'FAIL'); }
// lower-is-better feature check
function lo(v, warn = 0.3, fail = 0.5) { const x = typeof v === 'number' ? v : 0; return x <= warn ? 'PASS' : (x <= fail ? 'WARN' : 'FAIL'); }

// asset: GENERATED_CREATIVE descriptor. ctx: { direction, constraints, overlay, user_facts }.
function evaluate(asset, ctx = {}) {
  if (!asset || asset.status !== 'GENERATED') {
    return { status: 'FAIL', reason: 'no_generated_asset', asset_status: asset && asset.status, criteria: [], remediation_targets: [] };
  }
  const f = asset.qa_features || {};
  const constraints = ctx.constraints || {};
  const mobileReq = constraints.primary_surface === 'mobile' || /9:16|4:5/.test(asset.aspect_ratio || '');
  const criteria = [];
  const add = (name, verdict, source, detail, remediation) => criteria.push({ criterion: name, verdict, source_class: source, detail, remediation_target: remediation || null });

  add('dominant_focal_point', hi(f.dominant_focal_point), 'CREATIVE_DIRECTOR_DECISION', 'focal strength', 'OFF_BRIEF_VISUAL');
  add('hierarchy_clarity', hi(f.hierarchy_clarity), 'CREATIVE_DIRECTOR_DECISION', 'reading order clarity', 'VISUAL_CLUTTER');
  add('message_clarity', hi(f.concept_fidelity), 'CREATIVE_DIRECTOR_DECISION', 'single message legible', 'OFF_BRIEF_VISUAL');
  add('headline_prominence', hi(f.typography_zone_integrity), 'CREATIVE_DIRECTOR_DECISION', 'headline zone prominence', 'BROKEN_TYPOGRAPHY');
  add('copy_density', lo(f.copy_density), 'USER_CONSTRAINT', 'not over-dense', 'VISUAL_CLUTTER');
  add('cta_visibility', hi(f.cta_visibility), 'CREATIVE_DIRECTOR_DECISION', 'CTA prominence', 'WEAK_CTA');
  add('composition', hi(f.composition_quality), 'DESIGN_EVIDENCE', 'composition quality', 'VISUAL_CLUTTER');
  add('balance', hi(f.balance, 0.65, 0.45), 'VISUAL_INFERENCE', 'visual balance (WEAK design domain → inference only)', 'VISUAL_CLUTTER');
  add('contrast', hi(f.contrast), 'DESIGN_EVIDENCE', 'foreground/background separation', 'LOW_CONTRAST');
  add('readability', hi(f.readability), 'DESIGN_EVIDENCE', 'legibility', 'LOW_CONTRAST');
  add('safe_zones', f.safe_zones_ok ? 'PASS' : 'FAIL', 'USER_CONSTRAINT', 'safe zones respected', 'UNSAFE_TEXT_PLACEMENT');
  if (mobileReq) add('mobile_suitability', hi(f.mobile_readable), 'CURRENT_RESEARCH_REQUIRED', 'mobile-first creative is NONE-coverage → verify externally', 'MOBILE_UNREADABLE');
  add('offer_alignment', hi(f.offer_alignment), 'CREATIVE_DIRECTOR_DECISION', 'matches approved offer', 'OFF_BRIEF_VISUAL');
  add('audience_alignment', hi(f.audience_alignment, 0.65, 0.45), 'CREATIVE_DIRECTOR_DECISION', 'matches ICP', 'OFF_BRIEF_VISUAL');
  add('brand_constraint_adherence', hi(f.brand_adherence), 'USER_CONSTRAINT', 'brand rules followed', 'OFF_BRIEF_VISUAL');
  add('prompt_adherence', hi(f.prompt_adherence), 'CREATIVE_DIRECTOR_DECISION', 'follows the approved prompt', 'OFF_BRIEF_VISUAL');
  add('concept_fidelity', hi(f.concept_fidelity), 'CREATIVE_DIRECTOR_DECISION', 'stays true to concept/mechanism', 'OFF_BRIEF_VISUAL');
  add('visual_clutter', lo(f.visual_clutter), 'VISUAL_INFERENCE', 'clutter level', 'VISUAL_CLUTTER');
  add('typography_zone_integrity', hi(f.typography_zone_integrity), 'CREATIVE_DIRECTOR_DECISION', 'clean reserved text zones', 'UNSAFE_TEXT_PLACEMENT');

  // 18. unsupported text / claim risk (via claim_guard on generated in-image text + overlay)
  const cg = claimGuard.guard({ generated_text: asset.generated_text, overlay: ctx.overlay, user_facts: ctx.user_facts });
  // broken/garbled generated text must not be accepted as final typography
  const garbled = (asset.generated_text || []).some(g => g.garbled);
  add('unsupported_text_or_claim_risk', cg.clean ? 'PASS' : 'FAIL', 'USER_CONSTRAINT',
    cg.clean ? 'no unsupported generated claims' : ('blocked: ' + cg.blocked_categories.join(',')), 'FABRICATED_CLAIM');
  if (garbled) add('generated_text_integrity', 'FAIL', 'VISUAL_INFERENCE', 'AI-rendered text garbled; not final typography', 'BROKEN_TYPOGRAPHY');

  const failures = criteria.filter(c => c.verdict === 'FAIL');
  const warnings = criteria.filter(c => c.verdict === 'WARN');
  let status = 'PASS';
  if (failures.length) status = 'FAIL';
  else if (warnings.length) status = 'PASS_WITH_WARNINGS';
  const remediation_targets = Array.from(new Set(failures.map(c => c.remediation_target).filter(Boolean)));

  const passCount = criteria.filter(c => c.verdict === 'PASS').length;
  return {
    status, score: Number((passCount / criteria.length).toFixed(3)),
    criteria,
    failures: failures.map(c => ({ criterion: c.criterion, source_class: c.source_class, detail: c.detail, remediation_target: c.remediation_target })),
    warnings: warnings.map(c => ({ criterion: c.criterion, detail: c.detail })),
    remediation_targets,
    claim_guard: cg,
    visual_inference_is_not_evidence: true,
    can_reject: true,
  };
}

module.exports = { evaluate, SOURCE_CLASSES };
