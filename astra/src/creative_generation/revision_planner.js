'use strict';
// REVISION_PLANNER — targeted, bounded revision. Maps failed QA remediation targets to concrete,
// minimal prompt/overlay deltas. Never rewrites the whole creative direction (unless the CD output
// itself is invalid, which is out of this planner's scope — that fails closed upstream).
const MAX_REVISIONS = 2; // initial generation + up to 2 revisions

// remediation_target -> { describe(), apply(pkg, overlay, constraints) -> {pkg, overlay, notes} }
const PLAYBOOK = {
  LOW_CONTRAST: {
    describe: 'modify lighting/background separation/typography zone contrast',
    apply(pkg, overlay) {
      const p = Object.assign({}, pkg, { lighting: (pkg.lighting || '') + '; increase directional contrast for stronger subject separation', palette: (pkg.palette || '') + '; higher tonal contrast' });
      return { pkg: p, overlay, added: ['stronger lighting contrast', 'higher tonal contrast palette'], removed: [] };
    },
  },
  VISUAL_CLUTTER: {
    describe: 'reduce secondary objects, simplify composition, preserve the big idea',
    apply(pkg, overlay) {
      const p = Object.assign({}, pkg, { composition: (pkg.composition || '') + '; remove secondary objects, isolate the single hero subject' });
      return { pkg: p, overlay, added: ['simplified composition instruction'], removed: ['secondary objects'] };
    },
  },
  WEAK_CTA: {
    describe: 'strengthen CTA zone/prominence in the overlay spec; do not invent new CTA copy',
    apply(pkg, overlay) {
      const o = overlay ? Object.assign({}, overlay, { cta: Object.assign({}, overlay.cta, { relative_prominence: 'maximum (isolated CTA zone)' }) }) : overlay;
      return { pkg, overlay: o, added: ['CTA zone prominence increased'], removed: [] };
    },
  },
  OFF_BRIEF_VISUAL: {
    describe: 'restore the approved subject/composition/visual mechanism',
    apply(pkg, overlay, ctx) {
      const p = Object.assign({}, pkg, { subject: (ctx && ctx.direction && ctx.direction.visual_metaphor_or_mechanism) || pkg.subject });
      return { pkg: p, overlay, added: ['restored approved visual mechanism as subject'], removed: ['off-brief subject drift'] };
    },
  },
  UNSAFE_TEXT_PLACEMENT: {
    describe: 'move the reserved typography area; preserve safe zones',
    apply(pkg, overlay) {
      const o = overlay ? Object.assign({}, overlay, { safe_zone_constraints: Array.from(new Set([...(overlay.safe_zone_constraints || []), 'moved text zone away from edges/UI overlays'])) }) : overlay;
      const p = Object.assign({}, pkg, { typography_placement_zones: 'moved inward from edges; ' + (pkg.typography_placement_zones || '') });
      return { pkg: p, overlay: o, added: ['moved reserved text zone inward'], removed: [] };
    },
  },
  MOBILE_UNREADABLE: {
    describe: 'increase type scale and simplify for small-screen legibility',
    apply(pkg, overlay) {
      const o = overlay ? Object.assign({}, overlay, { headline: Object.assign({}, overlay.headline, { legibility: 'large / high-contrast for small screens (revised)' }) }) : overlay;
      return { pkg, overlay: o, added: ['larger mobile type scale instruction'], removed: [] };
    },
  },
  BROKEN_TYPOGRAPHY: {
    describe: 'reserve a clean empty text zone instead of relying on AI-rendered text',
    apply(pkg, overlay) {
      const p = Object.assign({}, pkg, { typography_placement_zones: 'reserve CLEAN EMPTY zones for headline/CTA; do not render final text in-image' });
      return { pkg: p, overlay, added: ['clean empty text zone reservation'], removed: ['reliance on AI-rendered in-image text'] };
    },
  },
  FABRICATED_CLAIM: {
    describe: 'strip unsupported claim language from the prompt; keep only approved copy',
    apply(pkg, overlay) {
      const p = Object.assign({}, pkg, { subject: String(pkg.subject || '').replace(/guarantee|certified|100%|award-winning/gi, '[CLAIM_REQUIRES_SUBSTANTIATION]') });
      return { pkg: p, overlay, added: ['claim scrub reinforced'], removed: ['unsupported claim language'] };
    },
  },
};

function rebuildPromptString(pkg) {
  return [
    pkg.style && `${pkg.style} advertising image`,
    `subject: ${pkg.subject}`, `environment: ${pkg.environment}`,
    `composition: ${pkg.composition}, ${pkg.framing}, ${pkg.camera_perspective}`,
    `lighting: ${pkg.lighting}`, `color palette: ${pkg.palette}`, `materials: ${pkg.materials_textures}`,
    `visual hierarchy: ${pkg.visual_hierarchy}`, `negative space: ${pkg.negative_space}`,
    `typography zones (leave empty for later type): ${pkg.typography_placement_zones}`,
    `aspect ratio ${pkg.aspect_ratio}`,
  ].filter(Boolean).join('; ');
}

// Plan + apply a revision for one or more remediation targets. Returns a revision record.
function planRevision({ attempt, failedCriteria, remediationTargets, pkg, overlay, direction, reason }) {
  let curPkg = pkg, curOverlay = overlay;
  const added = [], removed = [], appliedTargets = [];
  for (const target of remediationTargets) {
    const play = PLAYBOOK[target];
    if (!play) continue;
    const r = play.apply(curPkg, curOverlay, { direction });
    curPkg = r.pkg; curOverlay = r.overlay;
    added.push(...r.added); removed.push(...r.removed);
    appliedTargets.push(target);
  }
  return {
    attempt_number: attempt,
    failed_qa_criteria: failedCriteria,
    revision_reason: reason || appliedTargets.join(', '),
    remediation_targets_applied: appliedTargets,
    prompt_changes: { elements_added: added, elements_removed: removed },
    preserved_constraints: ['aspect_ratio', 'safe_zones', 'brand_constraints', 'prohibited_elements'],
    revised_prompt_package: curPkg,
    revised_prompt_string: rebuildPromptString(curPkg),
    revised_overlay: curOverlay,
  };
}

module.exports = { MAX_REVISIONS, PLAYBOOK, planRevision, rebuildPromptString };
