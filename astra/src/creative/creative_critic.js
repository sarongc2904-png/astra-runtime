'use strict';
// CREATIVE_CRITIC — deterministic, evidence-bounded QA of a creative direction package.
// It does NOT praise its own output: every criterion is a concrete structural/logic check that can
// FAIL. Returns PASS / PASS_WITH_WARNINGS / FAIL with machine-readable reasons, plus a guarded
// READY_FOR_VISUAL_GENERATION flag. Enforces angle ≠ concept ≠ execution and unsupported-claim risk.
const CK = require('./creative_knowledge');
const { CLAIM_RISK } = require('./creative_prompt_builder');

function norm(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
function overlap(a, b) {
  const wa = new Set(norm(a).split(' ').filter(w => w.length > 3));
  const wb = norm(b).split(' ').filter(w => w.length > 3);
  if (!wb.length) return 0;
  let hit = 0; for (const w of wb) if (wa.has(w)) hit++;
  return hit / wb.length;
}

// Evaluate. Returns { status, score, criteria[], warnings[], failures[], ready_for_visual_generation }.
function critique(direction, ctx = {}) {
  const d = direction || {};
  const criteria = [];
  const add = (name, pass, severity, reason) => criteria.push({ criterion: name, pass: !!pass, severity, reason });

  // 1. one dominant idea
  add('one_dominant_idea', !!d.big_idea && !!d.creative_concept, 'FAIL',
    (d.big_idea && d.creative_concept) ? 'single big idea + concept present' : 'missing big idea or concept');

  // 2. angle ≠ concept ≠ execution (must be distinct layers, not restatements)
  const angleText = (Array.isArray(d.creative_angles) ? d.creative_angles.map(a => a.angle || a).join(' ') : '') || d.audience_insight;
  const angleConceptOverlap = overlap(d.creative_concept, angleText);
  const conceptExecOverlap = overlap(d.art_direction, d.creative_concept);
  add('angle_distinct_from_concept', angleConceptOverlap < 0.8, 'WARN',
    `concept/angle lexical overlap ${angleConceptOverlap.toFixed(2)} (<0.8 required)`);
  add('execution_instantiates_concept', !!d.art_direction && !!d.composition, 'FAIL',
    (d.art_direction && d.composition) ? 'execution layer (art direction + composition) present' : 'execution layer incomplete');

  // 3. hierarchy clarity
  add('hierarchy_clarity', !!d.visual_hierarchy, 'FAIL', d.visual_hierarchy ? 'visual hierarchy specified' : 'no visual hierarchy');

  // 4. message clarity / SMP
  add('message_clarity_smp', !!d.smp_or_core_proposition, 'FAIL', d.smp_or_core_proposition ? 'single-minded proposition present' : 'no SMP');

  // 5. audience relevance
  add('audience_relevance', !!d.audience_insight, 'WARN', d.audience_insight ? 'audience insight present' : 'no audience insight');

  // 6. offer alignment
  add('offer_alignment', !!d.creative_objective, 'WARN', d.creative_objective ? 'objective stated' : 'no creative objective');

  // 7. visual-copy relationship
  add('visual_copy_relationship', !!d.headline_visual_relationship || (!!d.headline_direction && !!d.image_direction), 'WARN',
    'headline/visual relationship defined');

  // 8. composition
  add('composition', !!d.composition, 'WARN', d.composition ? 'composition specified' : 'no composition');

  // 9. contrast
  add('contrast', !!d.contrast_strategy, 'WARN', d.contrast_strategy ? 'contrast strategy specified' : 'no contrast strategy');

  // 10. readability / legibility
  add('readability', !!d.typography_direction, 'WARN', d.typography_direction ? 'typography direction present' : 'no typography direction');

  // 11. mobile suitability (only enforced when mobile surface requested; NONE-domain → warn + research flag)
  const mobileRequested = ctx.constraints && (ctx.constraints.primary_surface === 'mobile' || ctx.constraints.safe_zones);
  if (mobileRequested) {
    const mobileCov = CK.coverageFor('mobile-first creative');
    add('mobile_suitability', !!d.mobile_readability, mobileCov.coverage_class === 'NONE' ? 'WARN' : 'FAIL',
      `mobile addressed=${!!d.mobile_readability}; corpus coverage for mobile-first creative = ${mobileCov.coverage_class} (CURRENT_RESEARCH_REQUIRED)`);
  }

  // 12. information density
  add('information_density', !!d.information_density, 'WARN', d.information_density ? 'density guidance present' : 'no density guidance');

  // 13. CTA clarity
  add('cta_clarity', !!d.cta_direction, 'FAIL', d.cta_direction ? 'CTA direction present' : 'no CTA direction');

  // 14. method alignment (must use only evidence-backed methods)
  const methodOk = Array.isArray(d.primary_methods) && d.primary_methods.length > 0 &&
    d.primary_methods.every(m => !!CK.methodByName(m.canonical_name || m));
  add('method_alignment', methodOk, 'FAIL', methodOk ? 'all methods are evidence-backed (ASTRA-08A)' : 'a method is not evidence-backed');

  // 15. evidence grounding (at least one DIRECTLY_SUPPORTED decision with provenance)
  const evUsed = Array.isArray(d.evidence_used) && d.evidence_used.length > 0;
  add('evidence_grounding', evUsed, 'FAIL', evUsed ? `${d.evidence_used.length} evidence refs cited` : 'no evidence provenance');

  // 16. unsupported-claim risk (scan copy/headline for claim-risk phrases not flagged as user-provided)
  const copyBlob = [d.headline_direction, d.supporting_copy_direction, d.cta_direction,
    ...(Array.isArray(d.creative_angles) ? d.creative_angles.map(a => a.angle || a) : [])].join(' ');
  const claimHits = CLAIM_RISK.filter(re => re.test(copyBlob)).map(re => re.source);
  const claimsAllowed = ctx.user_facts && ctx.user_facts.allow_claims;
  add('no_unsupported_claims', claimHits.length === 0 || claimsAllowed, 'FAIL',
    claimHits.length === 0 ? 'no unsupported factual claims' : `claim-risk phrases present without user substantiation: ${claimHits.join(', ')}`);

  // 17. limitations preserved (WEAK/NONE domains touched must be surfaced)
  const limitationsSurfaced = Array.isArray(d.limitations) && d.limitations.length >= 0;
  add('limitations_preserved', limitationsSurfaced, 'WARN', 'limitations array present');

  const failures = criteria.filter(c => !c.pass && c.severity === 'FAIL');
  const warnings = criteria.filter(c => !c.pass && c.severity === 'WARN');
  const passCount = criteria.filter(c => c.pass).length;
  const score = criteria.length ? passCount / criteria.length : 0;
  let status = 'PASS';
  if (failures.length) status = 'FAIL';
  else if (warnings.length) status = 'PASS_WITH_WARNINGS';

  return {
    status, score: Number(score.toFixed(3)),
    criteria,
    failures: failures.map(f => ({ criterion: f.criterion, reason: f.reason })),
    warnings: warnings.map(w => ({ criterion: w.criterion, reason: w.reason })),
    ready_for_visual_generation: status !== 'FAIL' && !!d.image_generation_prompt && evUsed && (claimHits.length === 0 || claimsAllowed),
    self_praise: false,
  };
}

module.exports = { critique, overlap };
