'use strict';

// [ASTRA-11] commercial GPT bridge operations — opt-in so the base GPT Actions spec is
// unchanged for existing consumers. Pass { commercial: true } to include them.
function commercialPaths(post) {
  const CommercialResponse = { $ref: '#/components/schemas/CommercialResponse' };
  return {
    '/functions/v1/astra-tools/commercial-funnel-revenue': { post: post('commercialFunnelRevenue', 'Run the deterministic ASTRA-11J funnel + revenue diagnosis.', { $ref: '#/components/schemas/CommercialFunnelRevenueRequest' }, CommercialResponse) },
    '/functions/v1/astra-tools/commercial-experiment-intelligence': { post: post('commercialExperimentIntelligence', 'Run the deterministic ASTRA-11K experiment-intelligence analysis on an opportunity.', { $ref: '#/components/schemas/CommercialExperimentIntelligenceRequest' }, CommercialResponse) },
    '/functions/v1/astra-tools/commercial-business-memory': { post: post('commercialBusinessMemory', 'Run the deterministic ASTRA-11L evidence-bound business memory engine.', { $ref: '#/components/schemas/CommercialBusinessMemoryRequest' }, CommercialResponse) },
    '/functions/v1/astra-tools/commercial-decision-orchestrator': { post: post('commercialDecisionOrchestrator', 'Run the deterministic ASTRA-11M commercial decision orchestrator (recommendation only; never executes).', { $ref: '#/components/schemas/CommercialDecisionOrchestratorRequest' }, CommercialResponse) },
  };
}
function commercialSchemas() {
  const iso = { type: 'string', minLength: 1, maxLength: 40 };
  return {
    CommercialResponse: { type: 'object', required: ['status'], properties: { request_id: { type: 'string' }, status: { type: 'string' }, operation: { type: 'string' }, tool: { type: 'string' }, report: { type: ['object', 'null'], properties: {}, additionalProperties: true }, result: { type: 'object', properties: {}, additionalProperties: true }, triggers_action: { type: 'boolean' } } },
    CommercialFunnelRevenueRequest: { type: 'object', required: ['referenceTime', 'businessInput'], additionalProperties: true, properties: { referenceTime: iso, businessInput: { type: 'object', properties: {}, additionalProperties: true }, project_id: { type: 'string', maxLength: 128 } } },
    CommercialExperimentIntelligenceRequest: { type: 'object', required: ['referenceTime'], additionalProperties: true, properties: { referenceTime: iso, opportunity: { type: 'object', properties: {}, additionalProperties: true }, funnelRevenueResult: { type: 'object', properties: {}, additionalProperties: true }, experimentSpec: { type: 'object', properties: {}, additionalProperties: true }, project_id: { type: 'string', maxLength: 128 } } },
    CommercialBusinessMemoryRequest: { type: 'object', required: ['referenceTime', 'businessId'], additionalProperties: true, properties: { referenceTime: iso, businessId: { type: 'string', minLength: 1, maxLength: 128 }, candidates: { type: 'array', items: { type: 'object', properties: {}, additionalProperties: true } }, project_id: { type: 'string', maxLength: 128 } } },
    CommercialDecisionOrchestratorRequest: { type: 'object', required: ['businessId'], additionalProperties: true, properties: { businessId: { type: 'string', minLength: 1, maxLength: 128 }, referenceTime: iso, decisionTimestamp: iso, opportunities: { type: 'array', items: { type: 'object', properties: {}, additionalProperties: true } }, project_id: { type: 'string', maxLength: 128 } } },
  };
}

// [ASTRA Campaign360 async] GPT-facing async bridge — opt-in via { asyncCampaign: true }.
// Lets a GPT Action start Campaign 360 and poll, so it never hits the 150s GPT IDLE_TIMEOUT.
// The runtime + Supabase gateway routes already exist; this only surfaces them in the schema.
function asyncCampaignPaths(asyncPost) {
  return {
    '/functions/v1/astra-tools/campaign-360-async-start': { post: asyncPost('startAstraCampaign360', 'Start the ASTRA 360 campaign workflow asynchronously and return a job_id immediately. Does NOT wait for completion.', { $ref: '#/components/schemas/Campaign360AsyncStartRequest' }, { $ref: '#/components/schemas/Campaign360AsyncJob' }, { 202: true }) },
    '/functions/v1/astra-tools/campaign-360-async-status': { post: asyncPost('getAstraCampaign360Status', 'Check the status of an async ASTRA 360 campaign job by job_id. Poll this until status is COMPLETE or FAILED.', { $ref: '#/components/schemas/Campaign360AsyncJobRequest' }, { $ref: '#/components/schemas/Campaign360AsyncJob' }, { 404: true }) },
    '/functions/v1/astra-tools/campaign-360-async-result': { post: asyncPost('getAstraCampaign360Result', 'Retrieve the completed result of an async ASTRA 360 campaign job by job_id. Returns 202 while the job is still QUEUED or RUNNING; 200 with the result once COMPLETE.', { $ref: '#/components/schemas/Campaign360AsyncJobRequest' }, { $ref: '#/components/schemas/Campaign360AsyncResult' }, { 202: true, 404: true }) },
  };
}
function asyncCampaignSchemas() {
  const jobFields = {
    job_id: { type: 'string', minLength: 1, maxLength: 200 },
    status: { type: 'string', enum: ['QUEUED', 'RUNNING', 'COMPLETE', 'FAILED'] },
    created_at: { type: 'string' },
    started_at: { type: ['string', 'null'] },
    completed_at: { type: ['string', 'null'] },
    updated_at: { type: 'string' },
    triggers_action: { type: 'boolean' },
    error: { type: ['object', 'null'], properties: { code: { type: 'string' }, message: { type: 'string' } }, additionalProperties: true },
  };
  return {
    Campaign360AsyncStartRequest: { type: 'object', required: ['input'], additionalProperties: false, properties: { input: { type: 'string', minLength: 1, maxLength: 12000 }, user_context: { type: 'object', properties: {}, additionalProperties: true } } },
    Campaign360AsyncJobRequest: { type: 'object', required: ['job_id'], additionalProperties: false, properties: { job_id: { type: 'string', minLength: 1, maxLength: 200 } } },
    Campaign360AsyncJob: { type: 'object', required: ['job_id', 'status', 'created_at', 'updated_at'], additionalProperties: true, properties: { ...jobFields } },
    Campaign360AsyncResult: { type: 'object', required: ['job_id', 'status', 'created_at', 'updated_at'], additionalProperties: true, properties: { ...jobFields, result: { type: ['object', 'null'], properties: {}, additionalProperties: true } } },
  };
}

// Every path below already carries the full '/functions/v1/...' prefix, so `servers[0].url`
// must be the bare project origin. Defensive normalization: if a caller passes the origin with
// an accidental '/functions/v1' (and/or '/astra-tools') suffix already attached, strip it here
// so the resolved endpoint (server + path) is never doubled, e.g.
// '.../astra-tools/functions/v1/astra-tools/campaign-360'.
function normalizeServerUrl(serverUrl) {
  return String(serverUrl).replace(/\/+$/, '').replace(/\/functions\/v1(?:\/astra-tools)?$/i, '');
}

function build(serverUrl = 'https://PROJECT_REF.supabase.co', opts = {}) {
  const ref = { Error: { type: 'object', required: ['status', 'error'], properties: { status: { type: 'string', enum: ['FAILED'] }, error: { type: 'object', required: ['code', 'message'], properties: { code: { type: 'string' }, message: { type: 'string' }, details: {} } } } } };
  const errors = {};
  for (const code of [400, 401, 403, 422, 500, 503]) errors[code] = { description: ({ 400: 'Invalid input', 401: 'Unauthorized', 403: 'Forbidden', 422: 'Oversized or semantically invalid input', 500: 'Runtime failure', 503: 'Runtime unavailable' })[code], content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };
  // A caller that omits successSchema still gets a valid, GPT-Builder-compatible object schema
  // (properties present, deliberately free-form) — never an object node with no properties.
  const post = (operationId, summary, schema, successSchema) => ({ operationId, summary, security: [{ bearerAuth: [] }], requestBody: { required: true, content: { 'application/json': { schema } } }, responses: Object.assign({ 200: { description: 'Tool result with ASTRA status preserved', content: { 'application/json': { schema: successSchema || { type: 'object', properties: {}, additionalProperties: true } } } } }, errors) });
  const asyncPost = (operationId, summary, schema, successSchema, extra = {}) => {
    const op = post(operationId, summary, schema, successSchema);
    if (extra[202]) op.responses[202] = { description: 'Accepted — job started or still running; poll status/result by job_id', content: { 'application/json': { schema: successSchema } } };
    if (extra[404]) op.responses[404] = { description: 'Job not found or expired', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };
    return op;
  };
  const paths = {
    '/functions/v1/search-kb': { post: post('searchKnowledgeBase', 'Search the existing knowledge base for a narrow factual lookup.', { type: 'object', required: ['query'], additionalProperties: false, properties: { query: { type: 'string', minLength: 1, maxLength: 12000 }, top_k: { type: 'integer', minimum: 1, maximum: 10, default: 5 }, filter_domain: { type: 'string', maxLength: 128 } } }) },
    '/functions/v1/astra-tools/campaign-360': { post: post('runAstraCampaign360', 'Run the complete ASTRA 360 campaign workflow.', { $ref: '#/components/schemas/CampaignRequest' }, { $ref: '#/components/schemas/CampaignResponse' }) },
    '/functions/v1/astra-tools/creative-director': { post: post('runAstraCreativeDirector', 'Create concepts, art direction, and copy-visual planning.', { $ref: '#/components/schemas/CreativeDirectorRequest' }, { $ref: '#/components/schemas/CreativeDirectorResponse' }) },
    '/functions/v1/astra-tools/creative-generation': { post: post('runAstraCreativeGeneration', 'Generate or revise an approved creative direction with visual QA.', { $ref: '#/components/schemas/CreativeGenerationRequest' }, { $ref: '#/components/schemas/CreativeGenerationResponse' }) },
  };
  if (opts.commercial) Object.assign(paths, commercialPaths(post));
  if (opts.asyncCampaign) {
    // Sync Campaign 360 is a GPT footgun once the async path exists: a GPT that could still
    // call it synchronously would just re-hit the 150s IDLE_TIMEOUT. It stays fully intact in
    // build() (no opts), the runtime, and direct API access — only removed from this GPT schema.
    delete paths['/functions/v1/astra-tools/campaign-360'];
    Object.assign(paths, asyncCampaignPaths(asyncPost));
  }
  const schemaExtra = Object.assign({}, opts.commercial ? commercialSchemas() : {}, opts.asyncCampaign ? asyncCampaignSchemas() : {});
  return {
    openapi: '3.1.0', info: { title: 'ASTRA GPT Tools', version: '1.0.0', description: 'GPT interface for narrow KB lookup and authoritative ASTRA workflows.' }, servers: [{ url: normalizeServerUrl(serverUrl) }],
    paths,
    components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } }, schemas: Object.assign(ref, schemaExtra, {
      CampaignRequest: { type: 'object', required: ['input'], additionalProperties: false, properties: { input: { type: 'string', minLength: 1, maxLength: 12000 }, user_context: { type: 'object', properties: {}, additionalProperties: true } } },
      CampaignResponse: { type: 'object', required: ['status', 'workflow_id', 'completed_nodes', 'selected_methods', 'final_synthesis', 'current_research_required', 'limitations', 'usage'], properties: { request_id: { type: 'string' }, status: { type: 'string', enum: ['COMPLETE', 'WAITING_FOR_INPUT', 'BLOCKED', 'FAILED'] }, workflow_id: { type: ['string', 'null'] }, completed_nodes: { type: 'array', items: { type: 'string' } }, selected_methods: { type: 'object', properties: {}, additionalProperties: { type: 'string' } }, final_synthesis: { type: ['object', 'null'], properties: {}, additionalProperties: true }, current_research_required: { type: 'array', items: {} }, limitations: { type: 'array', items: {} }, usage: { type: 'object', properties: {}, additionalProperties: true }, reason: { type: ['string', 'null'] }, required_inputs: { type: 'array', items: { type: 'string' } } } },
      CreativeDirectorRequest: { type: 'object', required: ['input', 'mode'], additionalProperties: false, properties: { input: { type: 'string', minLength: 1, maxLength: 12000 }, mode: { type: 'string', enum: ['SINGLE_CREATIVE', 'CREATIVE_VARIANTS', 'CREATIVE_SYSTEM'] }, brand_constraints: { type: 'object', properties: {}, additionalProperties: true }, reference_assets: { type: 'array', items: { type: 'object', properties: {}, additionalProperties: true }, maxItems: 20 }, commands: { type: 'array', items: { type: 'string' }, maxItems: 20 } } },
      // Mirrors the real field names returned by src/integration/gpt_supabase_adapter.js
      // runCreativeDirector() — no invented business contract, just the actual top-level keys,
      // typed loosely because the creative direction payload is a large nested structure.
      CreativeDirectorResponse: { type: 'object', required: ['status'], properties: { status: { type: 'string' }, creative_director_output: { type: 'object', properties: {}, additionalProperties: true }, evidence_used: { type: 'array', items: { type: 'object', properties: {}, additionalProperties: true } }, methods_used: { type: 'array', items: { type: 'string' } }, limitations: { type: 'array', items: {} }, current_research_required: { type: 'array', items: {} }, creative_qa: { type: ['object', 'null'], properties: {}, additionalProperties: true } } },
      CreativeGenerationRequest: { type: 'object', required: ['creative_director_output', 'generation_mode'], additionalProperties: false, properties: { creative_director_output: { type: 'object', properties: {}, additionalProperties: true }, generation_mode: { type: 'string', enum: ['SINGLE_GENERATION', 'VARIANT_GENERATION', 'REVISION_GENERATION'] }, reference_assets: { type: 'array', items: { type: 'object', properties: {}, additionalProperties: true }, maxItems: 20 } } },
      // Mirrors runCreativeGeneration()'s real top-level keys — same rationale as above.
      CreativeGenerationResponse: { type: 'object', required: ['status'], properties: { status: { type: 'string' }, generation_attempts: { type: 'integer' }, generated_assets: { type: 'array', items: { type: 'object', properties: {}, additionalProperties: true } }, visual_qa_results: { type: 'array', items: { type: 'object', properties: {}, additionalProperties: true } }, revision_history: { type: 'array', items: { type: 'object', properties: {}, additionalProperties: true } }, final_approved_asset: { type: ['object', 'null'], properties: {}, additionalProperties: true }, typography_overlay_spec: { type: ['object', 'null'], properties: {}, additionalProperties: true }, limitations: { type: 'array', items: {} }, usage: { type: 'object', properties: {}, additionalProperties: true } } },
    }) },
  };
}
module.exports = { build };
