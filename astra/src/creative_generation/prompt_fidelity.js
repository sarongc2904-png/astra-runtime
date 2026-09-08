'use strict';
// PROMPT_FIDELITY — machine-readable check that the generation prompt preserves the approved Creative
// Director direction. The generator must not silently drop a difficult constraint to improve aesthetics.
// Compares the built prompt package against the CD direction's must-preserve elements.

function has(text, term) { return String(text || '').toLowerCase().includes(String(term || '').toLowerCase()); }
function tokens(s) { return String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 3); }
function containsAny(text, source, min = 1) {
  const t = String(text || '').toLowerCase();
  const ws = tokens(source);
  if (!ws.length) return true;
  let hit = 0; for (const w of ws) if (t.includes(w)) hit++;
  return hit >= Math.min(min, Math.ceil(ws.length * 0.25));
}

// direction: CD output. pkg: image_prompt_package. promptString: full prompt. negative: negative prompt.
function validate(direction, pkg, promptString, negative) {
  const checks = [];
  const add = (element, ok, detail) => checks.push({ element, preserved: !!ok, detail });
  const blob = [promptString, JSON.stringify(pkg)].join(' ');

  add('core_proposition', containsAny(blob, direction.smp_or_core_proposition) || containsAny(pkg.subject + pkg.environment, direction.smp_or_core_proposition), 'SMP concept words present in prompt/subject');
  add('concept', containsAny(blob, direction.creative_concept, 2), 'creative concept reflected');
  add('visual_mechanism', containsAny(blob, direction.visual_metaphor_or_mechanism, 2), 'approved visual mechanism reflected');
  add('composition_intent', has(blob, 'composition') || has(pkg.composition, 'focal'), 'composition intent carried');
  add('focal_hierarchy', has(blob, 'hierarchy') || has(pkg.visual_hierarchy, 'reading order') || has(pkg.composition, 'focal'), 'focal hierarchy carried');
  add('copy_zones', has(blob, 'typography') || has(pkg.typography_placement_zones, 'headline'), 'clean copy/typography zones reserved');
  add('brand_constraints', pkg.brand_constraints != null, 'brand constraints present');
  add('aspect_ratio', String(pkg.aspect_ratio) === String(direction.aspect_ratio) && has(blob, direction.aspect_ratio), 'aspect ratio matches direction');
  add('safe_zones', pkg.safe_zones != null, 'safe zones present');
  add('prohibited_elements', Array.isArray(pkg.prohibited_elements) && pkg.prohibited_elements.length > 0 && /no fabricated|no invented|no fake/i.test(negative || pkg.prohibited_elements.join(' ')), 'prohibited elements + negative guidance present');

  const dropped = checks.filter(c => !c.preserved).map(c => c.element);
  return {
    valid: dropped.length === 0,
    score: Number((checks.filter(c => c.preserved).length / checks.length).toFixed(3)),
    checks,
    dropped_constraints: dropped,
    silent_constraint_drop: dropped.length > 0,
  };
}

module.exports = { validate };
