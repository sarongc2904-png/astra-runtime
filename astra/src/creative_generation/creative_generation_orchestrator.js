'use strict';
// CREATIVE_GENERATION_ORCHESTRATOR — ASTRA-08C.
// Pipeline: TASK_BRIEF → CREATIVE_DIRECTOR → IMAGE_PROMPT_PACKAGE → IMAGE_PROVIDER_ADAPTER →
// GENERATED_CREATIVE → VISUAL_CREATIVE_QA → REVISION_DECISION → FINAL_CREATIVE_PACKAGE.
// Does NOT redesign ASTRA-08B: consumes its output as the canonical creative brief, verbatim.
// GENERATED_VISUALS_MUST_REMAIN_TRACEABLE_TO_THE_APPROVED_CREATIVE_DIRECTION.
const CD = require('../creative/creative_director');
const imageProvider = require('./image_provider');
const overlaySpec = require('./typography_overlay_spec');
const fidelity = require('./prompt_fidelity');
const visualQA = require('./visual_creative_qa');
const revisionPlanner = require('./revision_planner');
const claimGuard = require('./claim_guard');

const MODES = ['SINGLE_GENERATION', 'VARIANT_GENERATION', 'REVISION_GENERATION'];
const STATUS = { COMPLETE: 'COMPLETE', WAITING: 'WAITING_FOR_INPUT', BLOCKED: 'BLOCKED', FAILED: 'FAILED' };

// Identity-critical reference kinds: if the brief marks identity consistency mandatory, these must be
// supplied or the pipeline fails closed with WAITING_FOR_INPUT (never fabricated).
function checkReferenceAssets(brief, opts) {
  const required = (brief && brief.required_reference_kinds) || (opts && opts.required_reference_kinds) || [];
  const supplied = (opts && opts.reference_assets) || (brief && brief.reference_assets) || [];
  const suppliedKinds = new Set(supplied.map(r => r.type));
  const missing = required.filter(k => !suppliedKinds.has(k));
  return { required, supplied, missing, ok: missing.length === 0 };
}

// Build ONE generation request from a CD direction + constraints (does not reinterpret strategy).
function buildRequest(direction, constraints, referenceAssets, attemptMeta) {
  return {
    prompt: direction.image_generation_prompt,
    negative_prompt: direction.negative_prompt_or_avoidance_guidance,
    aspect_ratio: direction.aspect_ratio,
    format: direction.format,
    constraints,
    reference_assets: referenceAssets || [],
    metadata: Object.assign({ overlay: null }, attemptMeta || {}),
  };
}

async function generateAndEvaluate(provider, direction, constraints, referenceAssets, overlay, attempt, extraMeta) {
  const req = buildRequest(direction, constraints, referenceAssets, Object.assign({ attempt, overlay }, extraMeta));
  const asset = await provider.generateCreative(req);
  if (asset.status !== 'GENERATED') return { asset, qa: null, request: req };
  const qa = visualQA.evaluate(asset, { direction, constraints, overlay, user_facts: extraMeta && extraMeta.user_facts });
  return { asset, qa, request: req };
}

// opts: { mode, provider (injected, else mock from image_provider.fromEnv), reference_assets,
//   variant_count, defect_profile (test hook), user_facts, adapter (CD's optional read-only Agent V1) }
async function run(brief, opts = {}) {
  const task_id = (brief && brief.task_id) || 'CREATIVE_GENERATION_TASK';
  const mode = MODES.includes(opts.mode) ? opts.mode : 'SINGLE_GENERATION';
  const callTracker = { generation_calls: 0, attempts: 0, revisions: 0, provider: null, model: null };

  // 1. TASK_BRIEF → CREATIVE_DIRECTOR (canonical; not reinterpreted)
  const direction = opts.creative_director_output || CD.run(brief, { mode: opts.cd_mode, commands: opts.commands, adapter: opts.adapter, user_facts: opts.user_facts });
  if (direction.status !== 'COMPLETE') {
    return { task_id, status: direction.status === 'WAITING_FOR_INPUT' ? STATUS.WAITING : STATUS.BLOCKED,
      reason: 'creative_director_output_invalid', creative_director_output: direction, generation_calls: 0 };
  }

  // 2. reference asset check (before spending any generation call)
  const refCheck = checkReferenceAssets(brief, opts);
  if (!refCheck.ok) {
    return { task_id, status: STATUS.WAITING, reason: 'missing_required_reference_assets',
      missing_reference_kinds: refCheck.missing, creative_director_output: direction, generation_calls: 0 };
  }

  // 3. cost control: reject before generation if the prompt already carries unsupported claims
  const overlay = overlaySpec.build(direction, opts.constraints || {}, opts.user_facts);
  const ov = overlaySpec.validate(overlay);
  if (!ov.valid) return { task_id, status: STATUS.BLOCKED, reason: 'invalid_typography_overlay_spec', errors: ov.errors, creative_director_output: direction, generation_calls: 0 };
  const preGuard = claimGuard.guard({ prompt: direction.image_generation_prompt, overlay, user_facts: opts.user_facts });
  if (!preGuard.clean) {
    return { task_id, status: STATUS.BLOCKED, reason: 'unsupported_claim_in_prompt', blocked_categories: preGuard.blocked_categories,
      creative_director_output: direction, generation_calls: 0 };
  }

  // 4. IMAGE_PROMPT_PACKAGE → IMAGE_PROVIDER_ADAPTER
  const provFrom = opts.provider ? { provider: opts.provider, kind: opts.provider.is_mock ? 'mock' : 'live', cfg_present: true } : imageProvider.fromEnv(opts.env);
  const provider = provFrom.provider;
  callTracker.provider = provider.provider; callTracker.model = provider.model;

  if (provFrom.kind === 'live' && !provFrom.cfg_present) {
    // live explicitly requested but not configured
    if (opts.require_live) return { task_id, status: STATUS.BLOCKED, reason: 'ENVIRONMENT_NOT_AVAILABLE', creative_director_output: direction, generation_calls: 0 };
  }

  // prompt fidelity check (must-preserve elements) — never silently drop a difficult constraint
  const fid = fidelity.validate(direction, direction.image_prompt_package, direction.image_generation_prompt, direction.negative_prompt_or_avoidance_guidance);
  if (!fid.valid && opts.strict_fidelity !== false) {
    return { task_id, status: STATUS.BLOCKED, reason: 'prompt_fidelity_invalid', dropped_constraints: fid.dropped_constraints,
      prompt_fidelity: fid, creative_director_output: direction, generation_calls: 0 };
  }

  const constraints = Object.assign({}, opts.constraints || {});
  const refs = refCheck.supplied;
  const generated_assets = [];
  const visual_qa_results = [];
  const revision_history = [];

  async function oneGenerationCycle(variantTag) {
    let attempt = 1;
    let { asset, qa, request } = await generateAndEvaluate(provider, direction, constraints, refs, overlay, attempt, { defect_profile: (opts.defect_profile_by_variant && opts.defect_profile_by_variant[variantTag]) || opts.defect_profile, user_facts: opts.user_facts, variant: variantTag });
    callTracker.generation_calls++; callTracker.attempts++;
    if (asset.status !== 'GENERATED') return { asset, qa: null, revisions: [], final: null, variant: variantTag };

    let curPkg = direction.image_prompt_package, curOverlay = overlay;
    const revisions = [];
    while (qa && qa.status === 'FAIL' && attempt <= revisionPlanner.MAX_REVISIONS) {
      const targets = qa.remediation_targets.length ? qa.remediation_targets : ['VISUAL_CLUTTER'];
      const rev = revisionPlanner.planRevision({ attempt, failedCriteria: qa.failures.map(f => f.criterion), remediationTargets: targets, pkg: curPkg, overlay: curOverlay, direction, reason: 'QA FAIL: ' + qa.failures.map(f => f.criterion).join(',') });
      attempt++;
      const nextReq = Object.assign({}, request, { prompt: rev.revised_prompt_string, metadata: Object.assign({}, request.metadata, { attempt, revised: true, defect_profile: (opts.revision_defect_profile && opts.revision_defect_profile[attempt]) || [] }) });
      const nextAsset = await provider.generateCreative(nextReq);
      callTracker.generation_calls++; callTracker.attempts++; callTracker.revisions++;
      const nextQa = nextAsset.status === 'GENERATED' ? visualQA.evaluate(nextAsset, { direction, constraints, overlay: rev.revised_overlay, user_facts: opts.user_facts }) : null;
      revisions.push(Object.assign({}, rev, { qa_result: nextQa ? nextQa.status : nextAsset.status }));
      asset = nextAsset; qa = nextQa; curPkg = rev.revised_prompt_package; curOverlay = rev.revised_overlay;
      if (!nextQa) break;
    }
    return { asset, qa, revisions, variant: variantTag };
  }

  let cycles = [];
  if (mode === 'SINGLE_GENERATION') {
    cycles = [await oneGenerationCycle('V1')];
  } else if (mode === 'VARIANT_GENERATION') {
    const n = Math.max(2, Math.min(6, opts.variant_count || (direction.variant_plan && direction.variant_plan.variants && direction.variant_plan.variants.length) || 3));
    for (let i = 0; i < n; i++) cycles.push(await oneGenerationCycle('V' + (i + 1)));
  } else { // REVISION_GENERATION: force at least one revision pass regardless of first-pass QA
    const c = await oneGenerationCycle('V1');
    if (c.qa && c.qa.status !== 'FAIL' && !c.revisions.length && opts.force_revision !== false) {
      const targets = opts.forced_remediation_targets || ['LOW_CONTRAST'];
      const rev = revisionPlanner.planRevision({ attempt: 2, failedCriteria: ['forced_revision'], remediationTargets: targets, pkg: direction.image_prompt_package, overlay, direction, reason: 'forced revision pass (REVISION_GENERATION mode)' });
      const nextReq = buildRequest(direction, constraints, refs, { attempt: 2, revised: true, defect_profile: opts.revision_defect_profile && opts.revision_defect_profile[2] });
      nextReq.prompt = rev.revised_prompt_string;
      const nextAsset = await provider.generateCreative(nextReq);
      callTracker.generation_calls++; callTracker.attempts++; callTracker.revisions++;
      const nextQa = nextAsset.status === 'GENERATED' ? visualQA.evaluate(nextAsset, { direction, constraints, overlay: rev.revised_overlay, user_facts: opts.user_facts }) : null;
      c.revisions.push(Object.assign({}, rev, { qa_result: nextQa ? nextQa.status : nextAsset.status }));
      c.asset = nextAsset; c.qa = nextQa;
    }
    cycles = [c];
  }

  for (const c of cycles) { generated_assets.push(c.asset); if (c.qa) visual_qa_results.push(c.qa); revision_history.push(...c.revisions.map(r => Object.assign({ variant: c.variant }, r))); }

  // approve the best PASS/PASS_WITH_WARNINGS cycle; never mark a FAIL asset as final_approved_asset
  const approved = cycles.find(c => c.qa && c.qa.status !== 'FAIL');
  const allFailed = cycles.every(c => !c.qa || c.qa.status === 'FAIL');

  if (allFailed) {
    return {
      task_id, status: STATUS.FAILED, mode, creative_mode: mode,
      creative_director_output: direction, generation_provider: { provider: callTracker.provider, model: callTracker.model, is_mock: !!provider.is_mock },
      generation_attempts: callTracker.attempts, generated_assets, visual_qa_results, revision_history,
      final_approved_asset: null, typography_overlay_spec: overlay, prompt_fidelity: fid,
      evidence_used: direction.evidence_used, methods_used: direction.method_used, limitations: direction.limitations,
      current_research_required: direction.current_research_required, confidence: 0,
      reason: 'visual_qa_failed_after_revision_budget', call_tracking: callTracker,
      downstream_payload: { status: 'FAILED', reason: 'no approved asset after revision budget' },
    };
  }

  const finalCycle = approved;
  return {
    task_id, status: STATUS.COMPLETE, mode, creative_mode: mode,
    creative_director_output: direction,
    generation_provider: { provider: callTracker.provider, model: callTracker.model, is_mock: !!provider.is_mock },
    generation_attempts: callTracker.attempts,
    generated_assets, visual_qa_results, revision_history,
    final_approved_asset: { variant: finalCycle.variant, asset: finalCycle.asset, qa: finalCycle.qa },
    typography_overlay_spec: finalCycle.revisions.length ? finalCycle.revisions[finalCycle.revisions.length - 1].revised_overlay : overlay,
    prompt_fidelity: fid,
    evidence_used: direction.evidence_used, methods_used: direction.method_used, limitations: direction.limitations,
    current_research_required: direction.current_research_required,
    confidence: Math.max(0.2, Math.min(0.85, direction.confidence * (finalCycle.qa.status === 'PASS' ? 1 : 0.85))),
    call_tracking: callTracker,
    downstream_payload: {
      final_asset_id: finalCycle.asset.asset_id, qa_status: finalCycle.qa.status,
      overlay: finalCycle.revisions.length ? finalCycle.revisions[finalCycle.revisions.length - 1].revised_overlay : overlay,
      other_variants: cycles.filter(c => c !== finalCycle).map(c => ({ variant: c.variant, asset_id: c.asset.asset_id, qa_status: c.qa ? c.qa.status : c.asset.status })),
    },
  };
}

module.exports = { run, MODES, STATUS, checkReferenceAssets, buildRequest };
