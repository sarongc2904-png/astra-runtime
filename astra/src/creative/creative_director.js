'use strict';
// CREATIVE_DIRECTOR — evidence-bounded orchestration: strategic brief → executable creative direction.
// Deterministic by default (reproducible, zero-fabrication). Optional LLM enrichment via injected runner.
// READ-ONLY over Agent V1 (targeted Strategy-F retrieval through the adapter, when injected).
// Enforces: angle ≠ concept ≠ execution; evidence-discipline tags; fail-closed; ASTRA-08A limitations.
// NEVER generates images or invokes an image provider (that is ASTRA-08C).
const CK = require('./creative_knowledge');
const commandParser = require('./creative_command_parser');
const methodSelector = require('./creative_method_selector');
const promptBuilder = require('./creative_prompt_builder');
const critic = require('./creative_critic');
const modelRouter = require('../model_router/model_router');

const MODES = ['SINGLE_CREATIVE', 'CREATIVE_VARIANTS', 'CREATIVE_SYSTEM'];
const STATUS = { COMPLETE: 'COMPLETE', WAITING: 'WAITING_FOR_INPUT', BLOCKED: 'BLOCKED', FAILED: 'FAILED' };

// ---- helpers -------------------------------------------------------------
function tag(decision, evidenceTag, basis, extra) {
  return Object.assign({ decision, evidence_tag: evidenceTag, basis }, extra || {});
}
function biz(brief) { return (brief && brief.business_type) || 'the business'; }
function firstOffer(brief) { return (brief && (brief.offer || (brief.offer_summary))) || 'the core offer'; }
function primaryBenefit(brief) {
  if (brief && brief.core_benefit) return brief.core_benefit;
  if (brief && brief.offer && typeof brief.offer === 'string') return brief.offer;
  return `the single most valuable outcome of ${firstOffer(brief)}`;
}

// ---- 1. BRIEF INTERPRETER ------------------------------------------------
// Fail-closed: too little to proceed safely → WAITING_FOR_INPUT with the missing fields.
function interpretBrief(brief) {
  const b = brief || {};
  const missing = [];
  const hasBusiness = !!(b.business_type && String(b.business_type).trim() && !/^(unspecified|n\/?a|tbd)$/i.test(String(b.business_type).trim()));
  const hasObjective = !!(b.objective && String(b.objective).trim());
  const hasOfferOrAudience = !!(b.offer || b.audience || b.icp);
  if (!hasBusiness) missing.push('business_type');
  if (!hasObjective) missing.push('objective');
  if (!hasOfferOrAudience) missing.push('offer_or_audience');
  // Need at least a business + one of {objective, offer/audience} to proceed safely.
  const enough = hasBusiness && (hasObjective || hasOfferOrAudience);
  return {
    enough, missing,
    interpreted: {
      business_type: hasBusiness ? b.business_type : null,
      objective: hasObjective ? b.objective : 'awareness_to_conversion (assumed — not specified)',
      objective_assumed: !hasObjective,
      medium: b.medium || (Array.isArray(b.channels) && b.channels[0]) || 'digital ad',
      channels: b.channels || (b.medium ? [b.medium] : ['meta_feed']),
      funnel_stage: b.funnel_stage || b.funnel_context || 'acquisition',
      audience: b.audience || b.icp || null,
      offer: b.offer || null,
      format: b.format || 'meta_feed',
      brand: b.brand || b.brand_constraints || null,
    },
  };
}

// ---- 2. EVIDENCE PLANNER -------------------------------------------------
// Targeted, bounded, per-domain. Uses injected read-only adapter when present; else falls back to
// ASTRA-08A method provenance (real chunk_ids). Never passes the whole KB. Preserves provenance.
const CORE_DOMAINS = ['advertising concept', 'single-minded proposition / smp', 'visual metaphor',
  'art direction', 'copywriting for visual ads', 'headline-image relationship', 'color', 'contrast',
  'visual hierarchy', 'negative space', 'photography / image direction'];

function planEvidence(interpreted, constraints, methods, adapter, opts = {}) {
  const domains = new Set(CORE_DOMAINS);
  // constraint-driven domains
  if (constraints.primary_surface === 'mobile') domains.add('mobile-first creative');
  if (constraints.first_glance_clarity || constraints.suppress_competing_copy) domains.add('scroll-stopping principles');
  if (constraints.style === 'editorial_premium' || constraints.style === 'native_content') domains.add('editorial design');
  if (/meta|social|feed|reel|story/i.test(interpreted.medium + ' ' + (interpreted.channels || []).join(' '))) domains.add('social / meta ad creative');
  if (constraints.information_density) domains.add('information density');
  domains.add('cta visual hierarchy');

  const plan = [];
  const maxQueries = opts.max_domain_queries || 4; // bounded retrieval
  const domainList = Array.from(domains);
  const evidence = []; // aggregated, deduped by chunk_id
  const seen = new Set();

  // provenance base: method evidence_refs (always available, offline-safe, real chunk_ids)
  for (const m of methods) {
    for (const e of m.evidence_refs || []) {
      if (seen.has(e.chunk_id)) continue;
      seen.add(e.chunk_id);
      evidence.push({ chunk_id: e.chunk_id, source_pdf_name: e.source_pdf_name, pdf_page_refs: e.pdf_page_refs,
        via_method: m.canonical_name, source_class: 'INTERNAL_KNOWLEDGE', query_id: e.query_id });
    }
  }

  // optional live targeted retrieval (bounded) — proves per-domain Strategy-F retrieval when adapter present
  const retrieval_runs = [];
  if (adapter && typeof adapter.retrieve === 'function') {
    for (const dom of domainList.slice(0, maxQueries)) {
      const cov = CK.coverageFor(dom);
      if (cov.coverage_class === 'NONE') continue; // do not fabricate retrieval for absent domains
      const query = `${dom} for ${biz({ business_type: interpreted.business_type })} advertising creative`;
      try {
        const r = adapter.retrieve(query, { top_k: 5 });
        retrieval_runs.push({ domain: dom, query, corpus: r.corpus, pipeline: r.pipeline, evidence_count: r.evidence_count, top_k: r.top_k });
        for (const h of (r.hits || [])) {
          if (seen.has(h.chunk_id)) continue;
          seen.add(h.chunk_id);
          evidence.push({ chunk_id: h.chunk_id, source_pdf_name: h.source_pdf_name, pdf_page_refs: h.pdf_page_refs,
            source_class: 'INTERNAL_KNOWLEDGE', via_retrieval: dom, cosine: h.cosine, text: (h.text || '').slice(0, 400) });
        }
      } catch (e) {
        retrieval_runs.push({ domain: dom, query, error: String(e.message || e).slice(0, 160) });
      }
    }
  }

  for (const dom of domainList) {
    const cov = CK.coverageFor(dom);
    plan.push({ domain: dom, coverage_class: cov.coverage_class, evidence_tag_ceiling: CK.tagCeilingForClass(cov.coverage_class), reason: cov.reason });
  }
  return { target_domains: plan, evidence, retrieval_runs, whole_kb_passed: false, evidence_count: evidence.length };
}

// ---- 3-6. COMPOSITION (angle ≠ concept ≠ execution) ----------------------
function composeAngles(interpreted, brief) {
  // ANGLE = strategic entry route / message. Distinct from the creative idea.
  const audience = interpreted.audience ? JSON.stringify(interpreted.audience).slice(0, 80) : 'the target audience';
  const base = [
    { angle: `Trust and qualified expertise for ${biz(brief)}`, route: 'authority/safety', evidence_tag: 'INFERENCE' },
    { angle: `Speed and convenience of ${firstOffer(brief)}`, route: 'convenience', evidence_tag: 'INFERENCE' },
    { angle: `Tangible outcome / transformation from ${firstOffer(brief)}`, route: 'outcome', evidence_tag: 'INFERENCE' },
    { angle: `Cost/risk objection reversal`, route: 'objection', evidence_tag: 'INFERENCE' },
  ];
  return base.map(a => Object.assign(a, { basis: `derived from audience insight (${audience}) + Target Audience Definition method`, requires_validation: 'validate against ICP pains and USER_PROVIDED_FACTS before spend' }));
}

// A concept dramatizes the SMP as ONE idea/mechanism — deliberately not a restatement of the angle.
function composeConcept(interpreted, brief, chosenAngle) {
  const benefit = primaryBenefit(brief);
  return {
    big_idea: `One dramatized moment that makes "${benefit}" instantly felt`,
    creative_concept: `A single visual mechanism that stages the ${firstOffer(brief)} outcome as a before/after beat, carried by one hero subject`,
    visual_metaphor_or_mechanism: `Hero subject embodies the payoff of ${firstOffer(brief)}; the mechanism shows change, not a description of it`,
    angle_carried: chosenAngle ? chosenAngle.angle : null,
    evidence_tag: 'INFERENCE',
    basis: 'Strategy → Concept/Idea → Campaign + Visual Idea Development (advertising concept STRONG); specific idea is creative judgment (INFERENCE)',
  };
}

// EXECUTION = concrete art direction / layout rendering the concept.
function composeExecution(interpreted, constraints) {
  const cov = n => CK.coverageFor(n).coverage_class;
  const format = constraints.format || interpreted.format || 'meta_feed';
  const aspect = promptBuilder.aspectFor(format);
  return {
    art_direction: tag('Clean advertising art direction: single hero subject, deliberate focal point, restrained supporting elements', 'DIRECTLY_SUPPORTED', 'art direction (STRONG) + Final Ad Execution and Craft', { domain: 'art direction', coverage_class: cov('art direction') }),
    composition: tag('One dominant focal point; subject placed on a strong third; supporting elements subordinate', 'DIRECTLY_SUPPORTED', 'visual hierarchy + layout (STRONG)', { domain: 'visual composition', coverage_class: cov('visual composition') }),
    visual_hierarchy: tag('Reading order: hero subject → headline → CTA; size and contrast enforce the order', 'DIRECTLY_SUPPORTED', 'visual hierarchy (STRONG)', { domain: 'visual hierarchy', coverage_class: cov('visual hierarchy') }),
    layout: tag('Headline top-third, subject center, CTA lower-third; generous margins', 'DIRECTLY_SUPPORTED', 'layout (STRONG)', { domain: 'layout', coverage_class: cov('layout') }),
    typography_direction: tag(constraints.typography_emphasis === 'refined' ? 'Refined editorial type; high legibility; limited weights' : 'Bold, legible display type for the headline; clean body', cov('typography') === 'STRONG' ? 'DIRECTLY_SUPPORTED' : 'INFERENCE', 'typography (MODERATE) — legibility/kerning supported; full type system not covered', { domain: 'typography', coverage_class: cov('typography') }),
    color_direction: tag(constraints.palette_bias === 'vintage' ? 'Vintage-leaning brand palette with strong tonal contrast' : 'Brand-aligned palette with strong tonal contrast', 'DIRECTLY_SUPPORTED', 'color (STRONG)', { domain: 'color', coverage_class: cov('color') }),
    contrast_strategy: tag(constraints.contrast === 'high' ? 'High foreground/background separation to force the focal point' : 'Sufficient tonal contrast for subject separation and readability', 'DIRECTLY_SUPPORTED', 'contrast (STRONG)', { domain: 'contrast', coverage_class: cov('contrast') }),
    negative_space_strategy: tag(constraints.negative_space === 'generous' ? 'Generous negative space reserved for headline and CTA' : 'Deliberate negative space isolating the subject and holding the CTA', 'DIRECTLY_SUPPORTED', 'negative space (STRONG)', { domain: 'negative space', coverage_class: cov('negative space') }),
    image_direction: tag('Single hero subject; realistic, category-appropriate treatment; no fabricated proof elements', 'DIRECTLY_SUPPORTED', 'photography / image direction (STRONG)', { domain: 'photography / image direction', coverage_class: cov('photography / image direction') }),
    photography_or_illustration_direction: tag(constraints.style === 'sketch' || constraints.style === 'schematic' ? 'Illustration/sketch to foreground the idea over polish' : 'Photography preferred for credibility; illustration only if the concept requires it', 'DIRECTLY_SUPPORTED', 'photography vs illustration decision (STRONG)', { domain: 'photography / image direction', coverage_class: cov('photography / image direction') }),
    format, aspect_ratio: aspect,
  };
}

function composeMessage(interpreted, brief, constraints) {
  const benefit = primaryBenefit(brief);
  const cov = n => CK.coverageFor(n).coverage_class;
  return {
    headline_direction: tag(`Lead with the single-minded benefit: "${benefit}" — one dominant headline`, 'DIRECTLY_SUPPORTED', 'copywriting for visual ads + headline-image relationship (STRONG)', { domain: 'copywriting for visual ads', coverage_class: cov('copywriting for visual ads') }),
    supporting_copy_direction: tag(constraints.information_density === 'minimal' ? 'Suppress secondary copy; at most one qualifying line' : 'One short supporting line addressing the top objection; no claim without user facts', 'DIRECTLY_SUPPORTED', 'copy method (STRONG); density MODERATE', { domain: 'information density', coverage_class: cov('information density') }),
    cta_direction: tag('Single primary CTA aligned to funnel stage (e.g., message on WhatsApp / book now)', cov('cta visual hierarchy') === 'STRONG' ? 'DIRECTLY_SUPPORTED' : 'INFERENCE', 'CTA visual hierarchy (MODERATE)', { domain: 'cta visual hierarchy', coverage_class: cov('cta visual hierarchy') }),
    headline_visual_relationship: tag('Headline and hero image must say different halves of one idea (no redundancy)', 'DIRECTLY_SUPPORTED', 'headline-image relationship (STRONG)', { domain: 'headline-image relationship', coverage_class: cov('headline-image relationship') }),
  };
}

function composeHooks(angles) {
  return angles.slice(0, 3).map((a, i) => ({ hook: `Hook ${i + 1}: open on the ${a.route} tension`, from_angle: a.angle, evidence_tag: 'INFERENCE' }));
}

// ---- variant planning ----------------------------------------------------
function planVariants(mode, angles, baseConcept, count) {
  if (mode === 'SINGLE_CREATIVE') return { mode, variants: [], note: 'single fully-developed direction' };
  if (mode === 'CREATIVE_VARIANTS') {
    const n = Math.max(3, Math.min(6, count || 3));
    const variants = [];
    for (let i = 0; i < n && i < angles.length + 2; i++) {
      const a = angles[i % angles.length];
      variants.push({ variant_id: 'V' + (i + 1), driving_angle: a.angle, route: a.route,
        variation_axis: i < angles.length ? 'angle' : 'execution', coherent_with_concept: true, evidence_tag: 'INFERENCE' });
    }
    return { mode, variants, policy: '3–6 strategically coherent variants; one dominant idea per variant; no competing concepts within a variant' };
  }
  // CREATIVE_SYSTEM: one campaign concept, multiple executions
  const executions = ['launch key visual', 'proof/qualification execution', 'objection-reversal execution', 'retargeting execution'];
  return { mode, campaign_concept: baseConcept.big_idea,
    executions: executions.map((e, i) => ({ execution_id: 'X' + (i + 1), role: e, shares_concept: true, evidence_tag: 'INFERENCE' })),
    policy: 'one campaign-level concept expressed through multiple coherent executions' };
}

// ---- model routing plan --------------------------------------------------
function routingPlan(mode) {
  return {
    command_normalization: modelRouter.route('STRUCTURAL_TRANSFORM').task_class,          // DETERMINISTIC_TRANSFORM
    schema_and_qa: modelRouter.route('CLASSIFICATION', { task_class: 'DETERMINISTIC_TRANSFORM' }).task_class,
    copy_and_prompt_cleanup: modelRouter.route('VARIANT_GENERATION').task_class,           // LOW_COST_EXECUTION
    layout_art_direction: modelRouter.route('SPECIALIST_EXECUTION').task_class,             // MEDIUM_REASONING
    complex_concept_or_conflict: modelRouter.route('STRATEGIC_SYNTHESIS').task_class,        // HIGH_REASONING (only when justified)
    note: 'HIGH_REASONING reserved for complex concept generation / method conflict / final synthesis; not used universally',
    deterministic_default: true,
  };
}

// ---- MAIN ----------------------------------------------------------------
// brief: strategic brief object. opts: { mode, variant_count, adapter (read-only Agent V1), user_facts,
//   commands (creative commands, else brief.commands), llm (optional enrichment; unused in deterministic path) }.
function run(brief, opts = {}) {
  const task_id = (brief && brief.task_id) || 'CREATIVE_DIRECTOR_TASK';
  const specialist_type = 'CREATIVE_DIRECTOR';
  const mode = MODES.includes(opts.mode) ? opts.mode : (brief && MODES.includes(brief.mode) ? brief.mode : 'SINGLE_CREATIVE');

  // 1. interpret
  const interp = interpretBrief(brief);
  if (!interp.enough) {
    return { task_id, specialist_type, status: STATUS.WAITING, reason: 'insufficient_brief',
      missing_fields: interp.missing, message: 'Cannot produce a safe creative direction without minimum brief fields.', mode };
  }
  const I = interp.interpreted;

  // 2. commands → constraints
  const cmdInput = opts.commands || (brief && (brief.commands || brief.user_visual_commands)) || [];
  const cmd = commandParser.parse(cmdInput);
  const constraints = Object.assign({ format: I.format }, cmd.constraints, (brief && brief.constraints) || {});
  if (brief && brief.brand) constraints.brand = brief.brand;

  // 3. method selection (fail-closed on forced unsupported method)
  const sel = methodSelector.select({ objective: I.objective, medium: I.medium, funnel_stage: I.funnel_stage,
    audience: I.audience, channels: I.channels, forced_method: brief && brief.forced_method });
  if (!sel.ok) {
    return { task_id, specialist_type, status: STATUS.BLOCKED, reason: sel.reason, forced_method: sel.forced_method, mode };
  }
  const chosenMethods = [sel.primary, ...sel.supporting].filter(Boolean).map(s => s.method);
  if (!chosenMethods.length) {
    return { task_id, specialist_type, status: STATUS.BLOCKED, reason: 'no_evidence_backed_method_available', mode };
  }

  // 4. evidence planning (targeted, bounded, provenance-preserving)
  const evPlan = planEvidence(I, constraints, chosenMethods, opts.adapter, opts);
  if (!evPlan.evidence.length) {
    return { task_id, specialist_type, status: STATUS.BLOCKED, reason: 'empty_design_evidence_bundle', target_domains: evPlan.target_domains, mode };
  }

  // 5. compose (angle ≠ concept ≠ execution)
  const angles = composeAngles(I, brief);
  const concept = composeConcept(I, brief, angles[0]);
  const execution = composeExecution(I, constraints);
  const message = composeMessage(I, brief, constraints);
  const hooks = composeHooks(angles);
  const variants = planVariants(mode, angles, concept, opts.variant_count || (brief && brief.variant_count));

  // 6. limitations (surface every WEAK/NONE domain touched + single-source concentration)
  const touchedDomains = evPlan.target_domains;
  const limitations = [];
  for (const d of touchedDomains) {
    if (d.coverage_class === 'WEAK' || d.coverage_class === 'NONE') {
      limitations.push({ domain: d.domain, coverage_class: d.coverage_class, evidence_tag: d.evidence_tag_ceiling, note: d.reason });
    }
  }
  for (const l of cmd.limitations) limitations.push(l);
  const currentResearch = [];
  for (const d of touchedDomains) if (d.coverage_class === 'NONE') currentResearch.push({ item: d.domain, flag: 'CURRENT_RESEARCH_REQUIRED', reason: d.reason });
  // Meta/current-platform mechanics are never fabricated
  const metaLike = /meta|facebook|instagram|advantage|capi/i.test(JSON.stringify(I.channels) + ' ' + I.medium);
  if (metaLike) currentResearch.push({ item: 'current Meta platform mechanics (UI, Advantage+, CAPI, attribution defaults)', flag: 'CURRENT_RESEARCH_REQUIRED', reason: 'current-platform mechanics are not in the validated corpus; must be verified externally' });
  const rd = CK.readiness();
  if (rd.single_source_concentration) limitations.push({ scope: 'global', evidence_tag: 'ASSUMPTION', note: rd.required_scope_guard || 'Evidence concentrated in one advertising source; bounded to advertising concept/art direction, not full graphic-design authority.' });

  // 7. assemble direction (contract)
  const direction = {
    task_id, specialist_type, status: STATUS.COMPLETE, mode,
    creative_objective: tag(I.objective, I.objective_assumed ? 'ASSUMPTION' : 'DIRECTLY_SUPPORTED', I.objective_assumed ? 'objective not specified; assumed' : 'from brief').decision,
    audience_insight: I.audience ? JSON.stringify(I.audience) : `Assumed ${biz(brief)} audience; concrete demographics require USER_PROVIDED_FACTS`,
    core_problem_or_opportunity: `Make ${primaryBenefit(brief)} instantly understood in a crowded ad context`,
    primary_methods: chosenMethods.map(m => ({ canonical_name: m.canonical_name, role: (methodSelector.METHOD_FIT[m.canonical_name] || {}).role, confidence: m.confidence, single_source: (m.sources || []).length <= 1, limitations: m.limitations })),

    smp_or_core_proposition: `Single-minded proposition: ${primaryBenefit(brief)}`,
    big_idea: concept.big_idea,
    creative_concept: concept.creative_concept,
    visual_metaphor_or_mechanism: concept.visual_metaphor_or_mechanism,

    art_direction: execution.art_direction.decision,
    composition: execution.composition.decision,
    visual_hierarchy: execution.visual_hierarchy.decision,
    layout: execution.layout.decision,
    typography_direction: execution.typography_direction.decision,
    color_direction: execution.color_direction.decision,
    contrast_strategy: execution.contrast_strategy.decision,
    negative_space_strategy: execution.negative_space_strategy.decision,
    image_direction: execution.image_direction.decision,
    photography_or_illustration_direction: execution.photography_or_illustration_direction.decision,

    headline_direction: message.headline_direction.decision,
    supporting_copy_direction: message.supporting_copy_direction.decision,
    cta_direction: message.cta_direction.decision,
    headline_visual_relationship: message.headline_visual_relationship.decision,

    format: execution.format,
    aspect_ratio: execution.aspect_ratio,
    safe_zone_guidance: constraints.safe_zones || /9:16/.test(execution.aspect_ratio) ? 'Reserve top/bottom UI-safe margins; keep headline + CTA within safe area' : 'Standard edge margins; keep critical content off the crop edge',
    mobile_readability: constraints.primary_surface === 'mobile' ? 'Large type, single message, high contrast for small screens — NOTE: mobile-first creative is not evidence-backed (CURRENT_RESEARCH_REQUIRED)' : 'Ensure headline legible at feed thumbnail scale',
    information_density: constraints.information_density || 'moderate-to-low: one dominant message',

    creative_angles: angles,
    hook_directions: hooks,
    variant_plan: variants,

    // evidence discipline
    evidence_used: evPlan.evidence.map(e => e.chunk_id),
    evidence_provenance: evPlan.evidence.slice(0, 20).map(e => ({ chunk_id: e.chunk_id, source: e.source_pdf_name, pages: e.pdf_page_refs, via: e.via_method || e.via_retrieval })),
    method_used: chosenMethods.map(m => m.canonical_name),
    assumptions: [
      { assumption: 'Concrete price, guarantees, demographics are USER_PROVIDED_FACTS, not inferred', evidence_tag: 'ASSUMPTION' },
      ...(I.objective_assumed ? [{ assumption: 'Objective not specified; assumed awareness→conversion', evidence_tag: 'ASSUMPTION' }] : []),
    ],
    conflicts: [],
    limitations,
    current_research_required: currentResearch,
    confidence: Math.max(0.3, Math.min(0.7, (sel.primary && sel.primary.confidence ? sel.primary.confidence : 0.6) - (limitations.length ? 0.1 : 0) - (currentResearch.length ? 0.05 : 0))),

    target_design_domains: touchedDomains,
    retrieval_runs: evPlan.retrieval_runs,
    whole_kb_passed: evPlan.whole_kb_passed,
    creative_command_expansions: cmd.expansions,
    unrecognized_commands: cmd.unrecognized,
    model_routing: routingPlan(mode),
  };

  // 8. image-generation prompt package (NO provider call)
  const promptPkg = promptBuilder.build({
    image_direction: direction.image_direction, art_direction: direction.art_direction, composition: direction.composition,
    visual_hierarchy: direction.visual_hierarchy, color_direction: direction.color_direction,
    negative_space_strategy: direction.negative_space_strategy, visual_metaphor_or_mechanism: direction.visual_metaphor_or_mechanism,
    creative_concept: direction.creative_concept, format: direction.format, aspect_ratio: direction.aspect_ratio, style: constraints.style,
  }, constraints, { user_facts: opts.user_facts });
  direction.image_generation_prompt = promptPkg.image_generation_prompt;
  direction.image_prompt_package = promptPkg.prompt_package;
  direction.negative_prompt_or_avoidance_guidance = promptPkg.negative_prompt_or_avoidance_guidance;
  direction.image_prompt_claim_safety = promptPkg.claim_safety;
  direction.image_provider_invoked = false;

  // 9. creative QA (deterministic critic)
  const qa = critic.critique(direction, { constraints, user_facts: opts.user_facts });
  direction.creative_qa = qa;
  direction.creative_qa_criteria = qa.criteria.map(c => c.criterion);
  direction.ready_for_visual_generation = qa.ready_for_visual_generation;

  // fabrication guard: if the critic flags unsupported claims, fail closed
  if (qa.failures.some(f => f.criterion === 'no_unsupported_claims')) {
    return { task_id, specialist_type, status: STATUS.FAILED, reason: 'unsupported_claim_detected', creative_qa: qa, mode };
  }

  // 10. downstream payload for later stages (ASTRA-08C consumes this; not executed here)
  direction.downstream_payload = {
    concept: { big_idea: direction.big_idea, creative_concept: direction.creative_concept, smp: direction.smp_or_core_proposition },
    execution: { format: direction.format, aspect_ratio: direction.aspect_ratio, art_direction: direction.art_direction },
    image_prompt_package: direction.image_prompt_package,
    negative_prompt: direction.negative_prompt_or_avoidance_guidance,
    variant_plan: direction.variant_plan,
    qa_status: qa.status,
    ready_for_visual_generation: qa.ready_for_visual_generation,
    evidence_refs: direction.evidence_provenance,
  };

  return direction;
}

module.exports = { run, interpretBrief, planEvidence, composeAngles, composeConcept, composeExecution, planVariants, routingPlan, MODES, STATUS, CORE_DOMAINS };
