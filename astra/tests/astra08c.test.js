'use strict';
// ASTRA-08C test suite. Provider-neutral; mock mandatory; deterministic visual QA with fixtures.
const assert = require('assert');
const S = '../src/creative_generation/';
const O = require(S + 'creative_generation_orchestrator');
const prov = require(S + 'image_provider');
const mock = require(S + 'mock_image_provider');
const qa = require(S + 'visual_creative_qa');
const overlay = require(S + 'typography_overlay_spec');
const claim = require(S + 'claim_guard');
const fidelity = require(S + 'prompt_fidelity');
const revision = require(S + 'revision_planner');

let pass = 0, fail = 0; const fails = [];
const tests = [];
function t(name, fn) { tests.push({ name, fn }); }

// ===== PROVIDER ABSTRACTION =====
t('image_provider createProvider(mock)', () => { const p = prov.createProvider({ kind: 'mock' }); assert(p.is_mock && p.provider && p.healthCheck); });
t('image_provider createProvider(live) returns ENVIRONMENT_NOT_AVAILABLE', async () => { const p = prov.createProvider({ kind: 'live', cfg: {} }); const h = await p.healthCheck(); assert(h.status === 'ENVIRONMENT_NOT_AVAILABLE' && !h.ok); });
t('mock provider validates request', async () => { const p = mock.makeProvider(); const r = await p.generateCreative({ prompt: null }); assert(r.status === 'MALFORMED'); });
t('mock provider generates deterministic asset', async () => { const p = mock.makeProvider(); const r = await p.generateCreative({ prompt: 'test', negative_prompt: '', aspect_ratio: '1:1', format: 'meta_feed', constraints: {}, reference_assets: [], metadata: {} }); assert(r.status === 'GENERATED' && r.asset_id && r.qa_features); });
t('mock provider respects defect_profile', async () => { const p = mock.makeProvider(); const r = await p.generateCreative({ prompt: 'test', aspect_ratio: '1:1', format: 'meta_feed', constraints: {}, reference_assets: [], metadata: { defect_profile: ['LOW_CONTRAST'] } }); assert(r.qa_features.contrast <= 0.3); });

// ===== VISUAL QA =====
t('visual_qa evaluate PASS', () => { const asset = { status: 'GENERATED', asset_id: 'a1', aspect_ratio: '1:1', format: 'meta', qa_features: { dominant_focal_point: 1, hierarchy_clarity: 1, contrast: 1, cta_visibility: 1, concept_fidelity: 1, prompt_adherence: 1, offer_alignment: 1, audience_alignment: 1, brand_adherence: 1, composition_quality: 1, balance: 0.85, readability: 1, safe_zones_ok: true, mobile_readable: 1, copy_density: 0.2, typography_zone_integrity: 1, clutter: 0.1, visual_clutter: 0.1 }, generated_text: [] }; const r = qa.evaluate(asset, {}); assert(r.status === 'PASS'); });
t('visual_qa evaluate FAIL on low contrast', () => { const asset = Object.assign({}, { status: 'GENERATED', asset_id: 'a1', qa_features: { contrast: 0.2, clutter: 0.1, cta_visibility: 1, safe_zones_ok: true } }, { generated_text: [] }); const r = qa.evaluate(asset, {}); assert(r.status === 'FAIL' && r.failures.some(f => f.criterion === 'contrast')); });
t('visual_qa detects unsupported claims via claim_guard', () => { const asset = { status: 'GENERATED', qa_features: {}, generated_text: [{ text: 'FDA CERTIFIED #1 CLINIC', claim_like: true }] }; const r = qa.evaluate(asset, {}); assert(r.status === 'FAIL' && r.failures.some(f => f.criterion === 'unsupported_text_or_claim_risk')); });

// ===== TYPOGRAPHY OVERLAY =====
t('typography_overlay_spec build', () => { const dir = { headline_direction: 'Test Headline', supporting_copy_direction: 'Support', cta_direction: 'Click Here', aspect_ratio: '1:1' }; const o = overlay.build(dir, {}, {}); assert(o.headline && o.headline.text === 'Test Headline' && o.cta); });
t('typography_overlay_spec validate', () => { const o = { headline: { text: 'h' }, cta: { text: 'cta' }, safe_zone_constraints: ['x'] }; const v = overlay.validate(o); assert(v.valid); });

// ===== CLAIM GUARD =====
t('claim_guard scan detects medical claim', () => { const r = claim.scan('clinically proven results', {}); assert(r.violations.length > 0 && r.violations[0].category === 'medical'); });
t('claim_guard scan passes approved claims', () => { const r = claim.scan('clinically proven', { approved_claims: ['clinically proven'] }); assert(r.clean); });
t('claim_guard guard detects fabricated testimonials', () => { const r = claim.guard({ generated_text: [{ text: '"Best clinic ever" — Sarah W.' }] }); assert(r.violations.some(v => v.category === 'testimonial')); });

// ===== PROMPT FIDELITY =====
t('prompt_fidelity validate preserves constraints', () => { const dir = { image_generation_prompt: 'hero subject with high contrast and clear composition hierarchy', aspect_ratio: '1:1', visual_metaphor_or_mechanism: 'subject embodies outcome', smp_or_core_proposition: 'transformation', creative_concept: 'before and after', negative_prompt_or_avoidance_guidance: 'no fabricated claims' }; const pkg = { aspect_ratio: '1:1', subject: 'embodies outcome transformation', environment: 'before after setting', composition: 'focal hero with hierarchy', visual_hierarchy: 'reading order emphasis subject', typography_placement_zones: 'headline zone reserved', brand_constraints: { logo_placement: 'corner' }, safe_zones: { top: 20, bottom: 20 }, prohibited_elements: ['no fabricated', 'no invented claims'] }; const f = fidelity.validate(dir, pkg, dir.image_generation_prompt + ' transformation subject hierarchy', 'no fabricated claims'); assert(f.valid && f.score >= 0.6); });

// ===== REVISION PLANNER =====
t('revision_planner LOW_CONTRAST applies lighting delta', () => { const rev = revision.planRevision({ attempt: 2, failedCriteria: ['contrast'], remediationTargets: ['LOW_CONTRAST'], pkg: { lighting: 'soft' }, overlay: {}, direction: {} }); assert(rev.revised_prompt_package && rev.revised_prompt_package.lighting.includes('contrast')); });
t('revision_planner MAX_REVISIONS enforced', () => { assert(revision.MAX_REVISIONS === 2); });

// ===== ORCHESTRATOR: SINGLE_GENERATION =====
const brief = { task_id: 'T1', business_type: 'laser clinic', objective: 'conversion', offer: 'package', channels: ['meta_feed'], format: 'meta_feed' };
t('orchestrator SINGLE_GENERATION completes', async () => { const r = await O.run(brief, { mode: 'SINGLE_GENERATION', provider: mock.makeProvider() }); assert(r.status === 'COMPLETE' && r.final_approved_asset && r.generation_attempts >= 1); });
t('orchestrator VARIANT_GENERATION produces variants', async () => { const r = await O.run(brief, { mode: 'VARIANT_GENERATION', variant_count: 3, provider: mock.makeProvider() }); assert(r.status === 'COMPLETE' && r.generated_assets.length >= 2); });
t('orchestrator REVISION_GENERATION forces at least one revision', async () => { const r = await O.run(brief, { mode: 'REVISION_GENERATION', provider: mock.makeProvider(), force_revision: true }); assert(r.revision_history.length >= 1); });

// ===== FAIL-CLOSED SCENARIOS =====
t('orchestrator WAITING_FOR_INPUT on missing reference', async () => { const b = Object.assign({}, brief, { required_reference_kinds: ['logo'] }); const r = await O.run(b, { mode: 'SINGLE_GENERATION', provider: mock.makeProvider() }); assert(r.status === 'WAITING_FOR_INPUT' && r.missing_reference_kinds.includes('logo')); });
t('orchestrator detects unsupported claims in QA feedback', async () => { const r = await O.run(brief, { mode: 'SINGLE_GENERATION', provider: mock.makeProvider(), defect_profile: ['FABRICATED_CLAIM'] }); assert(r.visual_qa_results.length > 0 && r.revision_history.length >= 1); });
t('orchestrator FAILED when all QA attempts fail after revision budget', async () => { const r = await O.run(brief, { mode: 'SINGLE_GENERATION', provider: mock.makeProvider(), defect_profile: ['CLUTTERED_LAYOUT', 'OFF_BRIEF_VISUAL'], revision_defect_profile: { 2: ['CLUTTERED_LAYOUT', 'OFF_BRIEF_VISUAL'], 3: ['CLUTTERED_LAYOUT', 'OFF_BRIEF_VISUAL'] } }); assert(r.status === 'FAILED' && r.final_approved_asset === null); });

// ===== PROTECTION =====
t('orchestrator does not modify ASTRA-08B', async () => { const r = await O.run(brief, { mode: 'SINGLE_GENERATION', provider: mock.makeProvider() }); assert(r.creative_director_output && r.creative_director_output.specialist_type === 'CREATIVE_DIRECTOR'); });

(async () => {
  for (const { name, fn } of tests) {
    try { await fn(); pass++; console.log('PASS', name); } catch (e) { fail++; fails.push(name + ' :: ' + e.message); console.log('FAIL', name, '::', e.message); }
  }
  console.log(`\nASTRA08C_TEST_RESULT pass=${pass} fail=${fail}`);
  if (fail) { console.log('FAILURES:\n' + fails.join('\n')); process.exit(1); }
})();
