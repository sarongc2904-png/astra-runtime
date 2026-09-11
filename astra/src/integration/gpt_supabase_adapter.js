'use strict';
const H = require('../workflows/marketing_campaign_360_hardened');
const CD = require('../creative/creative_director');
const CG = require('../creative_generation/creative_generation_orchestrator');
const runtimeConfig = require('../runtime/runtime_config');
const providerFactory = require('../runtime/llm_provider');
const response = require('./integration_response');

function campaignPayload(result) {
  return response.sanitize({
    status: result.workflow_state_status || result.status || 'FAILED', workflow_id: result.workflow_id || null,
    completed_nodes: (result.node_outputs || []).map(x => x.work_unit_id),
    selected_methods: Object.fromEntries(Object.entries(result.selected_methods_by_node || {}).map(([k, v]) => [k, v.primary_method])),
    final_synthesis: result.synthesis ? result.synthesis.deliverable : null,
    current_research_required: result.synthesis ? result.synthesis.deliverable['17_current_research_required'] || [] : [],
    limitations: result.synthesis ? result.synthesis.deliverable['16_known_limitations'] || [] : [],
    usage: result.cost || {}, reason: result.reason || null, required_inputs: result.required_inputs || [],
    // [Brief Fidelity diagnostic passthrough] marketing_campaign_360_hardened.js already computes
    // these on a BRIEF_FIDELITY_VIOLATION (and on a clean COMPLETE); surface them so a GPT sees
    // the exact violating field(s)/path(s) instead of only the generic reason string. Both are
    // still routed through response.sanitize() below — no prompts/evidence text/secrets here.
    canonical_brief_facts: result.canonical_brief_facts || null,
    brief_fidelity_violations: result.brief_fidelity_violations || [],
  });
}
function makeCampaignRuntime(options = {}, env = process.env) {
  if (options.campaignRuntime) return options.campaignRuntime;
  return async input => {
    const cfg = runtimeConfig.load(env); const valid = runtimeConfig.validate(cfg);
    if (!valid.valid) { const e = new Error('runtime configuration invalid'); e.code = 'ENVIRONMENT_NOT_AVAILABLE'; throw e; }
    const provider = providerFactory.createProvider(cfg);
    return H.run(input, { mode: 'llm', retrieve: true, llm: (s, u, o) => provider.runner(s, u, o) });
  };
}
function briefFromCreativeInput(input, body = {}) {
  if (input && typeof input === 'object') return Object.assign({}, input);
  return {
    task_id: body.request_id || 'GPT_CREATIVE', business_type: String(input || '').trim(), objective: String(input || '').trim(),
    offer: body.brand_constraints && body.brand_constraints.offer || '', channels: body.brand_constraints && body.brand_constraints.channels || [],
    format: body.brand_constraints && body.brand_constraints.format || 'meta_feed', brand_constraints: body.brand_constraints || {},
  };
}
async function runCampaign(body, options, env) { return campaignPayload(await makeCampaignRuntime(options, env)(body.input, body)); }
async function runCreativeDirector(body, options = {}) {
  const out = (options.creativeDirector || CD.run)(briefFromCreativeInput(body.input, body), {
    mode: body.mode, commands: body.commands || [], reference_assets: body.reference_assets || [], brand_constraints: body.brand_constraints || {},
    adapter: options.adapter,
  });
  return response.sanitize({ status: out.status, creative_director_output: out, evidence_used: out.evidence_used || [], methods_used: out.primary_methods || [], limitations: out.limitations || [], current_research_required: out.current_research_required || [], creative_qa: out.creative_qa || null });
}
async function runCreativeGeneration(body, options = {}, env = process.env) {
  const direction = body.creative_director_output;
  const brief = direction && direction.downstream_payload ? direction.downstream_payload : direction;
  const generationOptions = { mode: body.generation_mode, reference_assets: body.reference_assets || [], provider: options.imageProvider, creative_director_output: direction };
  if (!options.imageProvider) {
    generationOptions.env = Object.assign({}, env, { ASTRA_IMAGE_PROVIDER_LIVE: env.ASTRA_IMAGE_PROVIDER_LIVE || 'true' });
    generationOptions.require_live = true;
  }
  const out = await (options.creativeGeneration || CG.run)(brief, generationOptions);
  return response.sanitize({ status: out.status, generation_attempts: out.generation_attempts || 0, generated_assets: out.generated_assets || [], visual_qa_results: out.visual_qa_results || [], revision_history: out.revision_history || [], final_approved_asset: out.final_approved_asset || null, typography_overlay_spec: out.typography_overlay_spec || null, limitations: out.limitations || [], usage: out.usage || {} });
}
async function searchKnowledgeBase(body, options = {}, env = process.env) {
  if (typeof options.searchKnowledgeBase === 'function') return response.sanitize(await options.searchKnowledgeBase(body));
  const base = String(env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = env.KB_API_KEY;
  if (!base || !key || typeof fetch !== 'function') { const e = new Error('knowledge endpoint unavailable'); e.code = 'ENVIRONMENT_NOT_AVAILABLE'; throw e; }
  const res = await fetch(base + '/functions/v1/search-kb', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error('knowledge search failed'); e.code = res.status === 401 ? 'UNAUTHORIZED' : 'ENVIRONMENT_NOT_AVAILABLE'; throw e; }
  return response.sanitize(data);
}
module.exports = { runCampaign, runCreativeDirector, runCreativeGeneration, searchKnowledgeBase, campaignPayload, briefFromCreativeInput };
