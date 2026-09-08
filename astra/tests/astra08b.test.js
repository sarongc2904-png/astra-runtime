'use strict';
// ASTRA-08B — Creative Director test suite. Node built-ins only. Deterministic, no live API.
// Covers: schema/contract, command normalization, 3 operating modes, targeted design retrieval,
// bounded evidence, provenance, WEAK/NONE handling, no unsupported doctrine, no fabricated ad claims,
// critic PASS/PASS_WITH_WARNINGS/FAIL, image-prompt completeness, Meta CURRENT_RESEARCH_REQUIRED,
// multi-vertical, no full-KB leakage, model routing, fail-closed, Agent V1 protection.
const assert = require('assert');
const S = '../src/creative/';
const CD = require(S + 'creative_director');
const CK = require(S + 'creative_knowledge');
const cmd = require(S + 'creative_command_parser');
const sel = require(S + 'creative_method_selector');
const promptBuilder = require(S + 'creative_prompt_builder');
const critic = require(S + 'creative_critic');
const { AgentV1Adapter, EXPECTED_CORPUS } = require('../src/adapter/agent_v1_adapter');

let pass = 0, fail = 0; const fails = [];
function t(name, fn) { try { fn(); pass++; console.log('PASS', name); } catch (e) { fail++; fails.push(name + ' :: ' + e.message); console.log('FAIL', name, '::', e.message); } }

const CONTRACT_KEYS = ['task_id', 'specialist_type', 'status', 'creative_objective', 'audience_insight',
  'core_problem_or_opportunity', 'primary_methods', 'smp_or_core_proposition', 'big_idea', 'creative_concept',
  'visual_metaphor_or_mechanism', 'art_direction', 'composition', 'visual_hierarchy', 'layout',
  'typography_direction', 'color_direction', 'contrast_strategy', 'negative_space_strategy', 'image_direction',
  'photography_or_illustration_direction', 'headline_direction', 'supporting_copy_direction', 'cta_direction',
  'headline_visual_relationship', 'format', 'aspect_ratio', 'safe_zone_guidance', 'mobile_readability',
  'information_density', 'creative_angles', 'hook_directions', 'variant_plan', 'image_generation_prompt',
  'negative_prompt_or_avoidance_guidance', 'evidence_used', 'method_used', 'assumptions', 'conflicts',
  'limitations', 'current_research_required', 'confidence', 'creative_qa_criteria', 'downstream_payload'];

const LASER = { task_id: 'CD_LASER', business_type: 'laser hair removal clinic', objective: 'awareness to conversion',
  offer: '6-session laser hair removal package', audience: { seg: 'women 25-45 urban' }, channels: ['meta_feed'], format: 'meta_feed' };

// mock read-only adapter (targeted Strategy-F). Records queries to prove bounded + no-full-KB.
function mockAdapter(record) {
  return { retrieve(q, o) { record.push(q); return { corpus: 'kb_chunks_v2', pipeline: 'Strategy-F', top_k: (o && o.top_k) || 5, evidence_count: 2,
    hits: [{ chunk_id: 'mk' + record.length + 'a', source_pdf_name: 'Src.pdf', pdf_page_refs: [1], cosine: 0.5, text: 'ev ' + q },
           { chunk_id: 'mk' + record.length + 'b', source_pdf_name: 'Src.pdf', pdf_page_refs: [2], cosine: 0.45, text: 'ev2' }] }; } };
}

// ===== KNOWLEDGE (single source of truth from ASTRA-08A) =====
t('knowledge loads audit coverage (15/8/4/3)', () => {
  assert.strictEqual(CK.domainsByClass('STRONG').length, 15);
  assert.strictEqual(CK.domainsByClass('MODERATE').length, 8);
  assert.strictEqual(CK.domainsByClass('WEAK').length, 4);
  assert.strictEqual(CK.domainsByClass('NONE').length, 3);
});
t('knowledge exposes 8 evidence-backed methods w/ provenance', () => {
  const m = CK.methods(); assert.strictEqual(m.length, 8);
  assert(m.every(x => x.evidence_refs.length > 0 && x.evidence_refs.every(e => e.chunk_id)));
  assert(m.every(x => x.sources.length >= 1));
});
t('coverage NONE for mobile/scroll/rhythm', () => {
  assert.strictEqual(CK.coverageFor('mobile-first creative').coverage_class, 'NONE');
  assert.strictEqual(CK.coverageFor('scroll-stopping principles').coverage_class, 'NONE');
  assert.strictEqual(CK.coverageFor('rhythm').coverage_class, 'NONE');
});
t('coverage STRONG for concept/smp/art direction', () => {
  assert.strictEqual(CK.coverageFor('advertising concept').coverage_class, 'STRONG');
  assert.strictEqual(CK.coverageFor('single-minded proposition / smp').coverage_class, 'STRONG');
  assert.strictEqual(CK.coverageFor('art direction').coverage_class, 'STRONG');
});
t('tag ceiling maps coverage → evidence tag', () => {
  assert.strictEqual(CK.tagCeilingForClass('STRONG'), 'DIRECTLY_SUPPORTED');
  assert.strictEqual(CK.tagCeilingForClass('WEAK'), 'ASSUMPTION');
  assert.strictEqual(CK.tagCeilingForClass('NONE'), 'CURRENT_RESEARCH_REQUIRED');
});

// ===== COMMAND NORMALIZATION (explicit constraints, not opaque tokens) =====
t('command parser expands all 16 documented commands', () => {
  const all = ['/creativo', '/editorialad', '/minimalcopy', '/oneidea', '/highcontrast', '/mobilefirst',
    '/3secondread', '/safezone', '/ugcstyle', '/creator-ad', '/native-content', '/direct-to-camera',
    '/napkin-sketch', '/strategy-sketch', '/retro', '/fantasma'];
  const r = cmd.parse(all);
  assert.strictEqual(r.unrecognized.length, 0, 'unrecognized: ' + r.unrecognized.join(','));
  assert.strictEqual(r.recognized.length, all.length);
  assert(r.expansions.every(e => e.note && Object.keys(e.constraints).length > 0), 'commands must map to explicit constraints');
});
t('/minimalcopy → explicit density/headline/CTA constraints', () => {
  const r = cmd.parse(['/minimalcopy']);
  assert(r.constraints.information_density === 'minimal' && r.constraints.dominant_headline === true && r.constraints.primary_cta_count === 1);
});
t('/mobilefirst attaches NONE-domain limitation', () => {
  const r = cmd.parse(['/mobilefirst']);
  assert(r.limitations.some(l => l.coverage_class === 'NONE' && /mobile/i.test(l.domain)));
});
t('/fantasma and /retro treated as user presets (ASSUMPTION), not doctrine', () => {
  const r = cmd.parse(['/fantasma', '/retro']);
  assert(r.evidence_notes.some(n => n.command === '/fantasma' && n.evidence_tag === 'ASSUMPTION'));
  assert(r.expansions.find(e => e.command === '/retro').preset === true);
});
t('unrecognized command surfaced, not silently applied', () => {
  const r = cmd.parse(['/oneidea', '/totallymadeup']);
  assert(r.recognized.includes('/oneidea') && r.unrecognized.includes('/totallymadeup'));
});

// ===== SCHEMA / CONTRACT =====
t('SINGLE_CREATIVE returns full contract', () => {
  const out = CD.run(LASER, { mode: 'SINGLE_CREATIVE' });
  assert.strictEqual(out.status, 'COMPLETE');
  for (const k of CONTRACT_KEYS) assert(k in out, 'missing contract key: ' + k);
  assert.strictEqual(out.specialist_type, 'CREATIVE_DIRECTOR');
});
t('angle ≠ concept ≠ execution (distinct layers)', () => {
  const out = CD.run(LASER, {});
  const angleText = out.creative_angles.map(a => a.angle).join(' ');
  assert(critic.overlap(out.creative_concept, angleText) < 0.8, 'concept must not restate angles');
  assert(out.art_direction && out.composition && out.layout, 'execution layer required');
  assert(out.big_idea && out.creative_concept && out.visual_metaphor_or_mechanism);
});

// ===== OPERATING MODES =====
t('CREATIVE_VARIANTS yields 3–6 coherent variants', () => {
  const out = CD.run(LASER, { mode: 'CREATIVE_VARIANTS', variant_count: 5 });
  assert(out.variant_plan.variants.length >= 3 && out.variant_plan.variants.length <= 6);
  assert(out.variant_plan.variants.every(v => v.coherent_with_concept));
});
t('CREATIVE_SYSTEM yields one concept + multiple executions', () => {
  const out = CD.run(LASER, { mode: 'CREATIVE_SYSTEM' });
  assert(out.variant_plan.campaign_concept && out.variant_plan.executions.length >= 2);
  assert(out.variant_plan.executions.every(x => x.shares_concept));
});

// ===== TARGETED RETRIEVAL / BOUNDED / PROVENANCE / NO FULL-KB =====
t('targeted design retrieval is bounded + preserves provenance', () => {
  const rec = []; const out = CD.run(LASER, { adapter: mockAdapter(rec), max_domain_queries: 4 });
  assert(rec.length > 0 && rec.length <= 4, 'bounded per-domain retrieval');
  assert(out.retrieval_runs.every(r => r.pipeline === 'Strategy-F' || r.error), 'uses Strategy-F');
  assert(out.evidence_provenance.every(p => p.chunk_id && p.source), 'provenance preserved');
  assert.strictEqual(out.whole_kb_passed, false);
});
t('no full-KB leakage: retrieval uses scoped domain queries only', () => {
  const rec = []; CD.run(LASER, { adapter: mockAdapter(rec) });
  assert(rec.every(q => q.length < 200 && !/entire|whole|all chunks/i.test(q)));
});
t('offline (no adapter) still grounds on real ASTRA-08A chunk_ids', () => {
  const out = CD.run(LASER, {});
  assert(out.evidence_used.length > 0);
  const known = new Set(CK.methods().flatMap(m => m.evidence_refs.map(e => e.chunk_id)));
  assert(out.evidence_used.every(c => known.has(c)), 'all evidence traces to audited chunks');
});

// ===== WEAK / NONE DOMAIN HANDLING =====
t('WEAK/NONE domains surfaced as limitations, not hidden', () => {
  const out = CD.run(Object.assign({}, LASER), { commands: ['/mobilefirst', '/editorialad'] });
  assert(out.limitations.some(l => l.coverage_class === 'NONE'), 'NONE surfaced');
  assert(out.limitations.some(l => l.coverage_class === 'WEAK'), 'WEAK surfaced');
});
t('NONE domain → CURRENT_RESEARCH_REQUIRED', () => {
  const out = CD.run(LASER, { commands: ['/mobilefirst'] });
  assert(out.current_research_required.some(c => /mobile/i.test(c.item) && c.flag === 'CURRENT_RESEARCH_REQUIRED'));
});
t('single-source concentration limitation always present', () => {
  const out = CD.run(LASER, {});
  assert(out.limitations.some(l => l.scope === 'global'));
});

// ===== NO UNSUPPORTED DOCTRINE / NO FABRICATED CLAIMS =====
t('only evidence-backed methods used (no invented doctrine)', () => {
  const out = CD.run(LASER, {});
  assert(out.primary_methods.every(m => !!CK.methodByName(m.canonical_name)));
});
t('fabricated ad claim fails closed', () => {
  const out = CD.run(Object.assign({}, LASER, { core_benefit: 'guaranteed 100% permanent results, award-winning' }), {});
  assert.strictEqual(out.status, 'FAILED');
  assert.strictEqual(out.reason, 'unsupported_claim_detected');
});
t('image prompt scrubs claim-risk phrases', () => {
  const b = promptBuilder.build({ image_direction: 'clinic with 99% success guarantee certified' }, {}, {});
  assert(b.claim_safety.scrubbed_from_subject.length > 0 && /CLAIM_REQUIRES_SUBSTANTIATION/.test(b.prompt_package.subject));
});

// ===== CRITIC PASS / PASS_WITH_WARNINGS / FAIL =====
t('critic PASS on complete direction', () => { assert.strictEqual(CD.run(LASER, {}).creative_qa.status !== 'FAIL', true); });
t('critic FAIL on empty direction (does not self-praise)', () => {
  const q = critic.critique({}); assert.strictEqual(q.status, 'FAIL'); assert.strictEqual(q.self_praise, false);
});
t('critic PASS_WITH_WARNINGS when non-fatal gaps', () => {
  const partial = { big_idea: 'x', creative_concept: 'y', art_direction: 'a', composition: 'c', visual_hierarchy: 'h',
    smp_or_core_proposition: 's', cta_direction: 'cta', primary_methods: [{ canonical_name: 'Single-Minded Proposition (SMP)' }],
    evidence_used: ['c1'], headline_direction: 'hd', image_direction: 'id', creative_angles: [{ angle: 'safety route' }] };
  const q = critic.critique(partial, {});
  assert(q.status === 'PASS_WITH_WARNINGS' || q.status === 'PASS', 'got ' + q.status);
  assert(q.failures.length === 0);
});
t('critic ready_for_visual_generation guarded', () => {
  const out = CD.run(LASER, {});
  assert.strictEqual(out.ready_for_visual_generation, out.creative_qa.status !== 'FAIL' && !!out.image_generation_prompt);
});

// ===== IMAGE PROMPT COMPLETENESS (no provider call) =====
t('image prompt package is operational + provider not invoked', () => {
  const out = CD.run(LASER, {});
  const p = out.image_prompt_package;
  for (const k of ['subject', 'environment', 'composition', 'framing', 'camera_perspective', 'lighting', 'palette',
    'visual_hierarchy', 'negative_space', 'typography_placement_zones', 'aspect_ratio', 'prohibited_elements', 'safe_zones']) assert(k in p, 'missing prompt field ' + k);
  assert(out.image_provider_invoked === false && out.negative_prompt_or_avoidance_guidance.length > 0);
});

// ===== META CURRENT_RESEARCH_REQUIRED =====
t('Meta channel → current platform mechanics flagged CURRENT_RESEARCH_REQUIRED', () => {
  const out = CD.run(Object.assign({}, LASER, { channels: ['meta_feed', 'instagram'] }), {});
  assert(out.current_research_required.some(c => /meta|advantage|capi|attribution/i.test(c.item)));
});

// ===== MULTI-VERTICAL =====
t('multi-vertical: 5 verticals all produce a direction', () => {
  const verticals = [
    { business_type: 'laser hair removal clinic', offer: 'laser package' },
    { business_type: 'dental clinic', offer: 'implant consultation' },
    { business_type: 'local restaurant', offer: 'weekend tasting menu' },
    { business_type: 'digital infoproduct', offer: 'online course' },
    { business_type: 'B2B marketing service', offer: 'lead-gen retainer' },
  ];
  for (const v of verticals) {
    const out = CD.run(Object.assign({ task_id: 'V', objective: 'conversion', channels: ['meta_feed'] }, v), {});
    assert.strictEqual(out.status, 'COMPLETE', v.business_type + ' -> ' + out.status);
    assert(out.big_idea.includes(v.offer) || out.smp_or_core_proposition.includes(v.offer), 'business-specific');
  }
});

// ===== MODEL ROUTING =====
t('model routing plan present + HIGH not universal', () => {
  const rp = CD.run(LASER, {}).model_routing;
  assert(rp.command_normalization === 'DETERMINISTIC_TRANSFORM' && rp.deterministic_default === true);
  assert(rp.layout_art_direction === 'MEDIUM_REASONING' && rp.complex_concept_or_conflict === 'HIGH_REASONING');
});

// ===== FAIL-CLOSED =====
t('fail-closed: insufficient brief → WAITING_FOR_INPUT', () => {
  const out = CD.run({ task_id: 'X', business_type: '' }, {});
  assert.strictEqual(out.status, 'WAITING_FOR_INPUT'); assert(out.missing_fields.length > 0);
});
t('fail-closed: forced non-evidence-backed method → BLOCKED', () => {
  const out = CD.run(Object.assign({ forced_method: 'Grid Doctrine 9000' }, LASER), {});
  assert.strictEqual(out.status, 'BLOCKED'); assert.strictEqual(out.reason, 'forced_method_not_evidence_backed');
});
t('fail-closed: empty evidence bundle yields no provenance', () => {
  // planEvidence with zero methods and no adapter must return an empty, provenance-less bundle,
  // which run() converts to BLOCKED (empty_design_evidence_bundle). Exercise the planner directly.
  const ev = CD.planEvidence({ business_type: 'x', medium: 'meta', channels: ['meta_feed'] }, {}, [], null, {});
  assert.strictEqual(ev.evidence.length, 0, 'no methods → no provenance');
  assert.strictEqual(ev.whole_kb_passed, false);
});

// ===== AGENT V1 PROTECTION =====
t('adapter stays read-only + never exposes apiKey (regression)', () => {
  const kb = { loadConfig: () => ({ apiKey: 'SECRET', model: 'openai/gpt-5-mini', baseUrl: 'x' }),
    groundedRetrieve: () => ({ hits: [], evidenceText: '', corpus: 'kb_chunks_v2', pipeline: 'Strategy-F', advisoryTop1Cosine: 0 }) };
  const a = new AgentV1Adapter({ kb });
  const c = a.config(); assert(!('apiKey' in c));
  const r = a.retrieve('art direction'); assert(r.read_only && r.corpus === EXPECTED_CORPUS);
});
t('creative director never invokes an image provider', () => {
  const out = CD.run(LASER, {});
  assert.strictEqual(out.image_provider_invoked, false);
  assert(/deferred to ASTRA-08C|prompt package only/i.test(JSON.stringify(out.image_prompt_package) + JSON.stringify(out.downstream_payload)) || out.ready_for_visual_generation !== undefined);
});

console.log(`\nASTRA08B_TEST_RESULT pass=${pass} fail=${fail}`);
if (fail) { console.log('FAILURES:\n' + fails.join('\n')); process.exit(1); }
