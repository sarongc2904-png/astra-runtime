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
    CommercialResponse: { type: 'object', required: ['status'], properties: { request_id: { type: 'string' }, status: { type: 'string' }, operation: { type: 'string' }, tool: { type: 'string' }, report: { type: ['object', 'null'], additionalProperties: true }, result: { type: 'object', additionalProperties: true }, triggers_action: { type: 'boolean' } } },
    CommercialFunnelRevenueRequest: { type: 'object', required: ['referenceTime', 'businessInput'], additionalProperties: true, properties: { referenceTime: iso, businessInput: { type: 'object', additionalProperties: true }, project_id: { type: 'string', maxLength: 128 } } },
    CommercialExperimentIntelligenceRequest: { type: 'object', required: ['referenceTime'], additionalProperties: true, properties: { referenceTime: iso, opportunity: { type: 'object', additionalProperties: true }, funnelRevenueResult: { type: 'object', additionalProperties: true }, experimentSpec: { type: 'object', additionalProperties: true }, project_id: { type: 'string', maxLength: 128 } } },
    CommercialBusinessMemoryRequest: { type: 'object', required: ['referenceTime', 'businessId'], additionalProperties: true, properties: { referenceTime: iso, businessId: { type: 'string', minLength: 1, maxLength: 128 }, candidates: { type: 'array', items: { type: 'object', additionalProperties: true } }, project_id: { type: 'string', maxLength: 128 } } },
    CommercialDecisionOrchestratorRequest: { type: 'object', required: ['businessId'], additionalProperties: true, properties: { businessId: { type: 'string', minLength: 1, maxLength: 128 }, referenceTime: iso, decisionTimestamp: iso, opportunities: { type: 'array', items: { type: 'object', additionalProperties: true } }, project_id: { type: 'string', maxLength: 128 } } },
  };
}

function build(serverUrl = 'https://PROJECT_REF.supabase.co', opts = {}) {
  const ref = { Error: { type: 'object', required: ['status', 'error'], properties: { status: { type: 'string', enum: ['FAILED'] }, error: { type: 'object', required: ['code', 'message'], properties: { code: { type: 'string' }, message: { type: 'string' }, details: {} } } } } };
  const errors = {};
  for (const code of [400, 401, 403, 422, 500, 503]) errors[code] = { description: ({ 400: 'Invalid input', 401: 'Unauthorized', 403: 'Forbidden', 422: 'Oversized or semantically invalid input', 500: 'Runtime failure', 503: 'Runtime unavailable' })[code], content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };
  const post = (operationId, summary, schema, successSchema) => ({ operationId, summary, security: [{ bearerAuth: [] }], requestBody: { required: true, content: { 'application/json': { schema } } }, responses: Object.assign({ 200: { description: 'Tool result with ASTRA status preserved', content: { 'application/json': { schema: successSchema || { type: 'object', additionalProperties: true } } } } }, errors) });
  const paths = {
    '/functions/v1/search-kb': { post: post('searchKnowledgeBase', 'Search the existing knowledge base for a narrow factual lookup.', { type: 'object', required: ['query'], additionalProperties: false, properties: { query: { type: 'string', minLength: 1, maxLength: 12000 }, top_k: { type: 'integer', minimum: 1, maximum: 10, default: 5 }, filter_domain: { type: 'string', maxLength: 128 } } }) },
    '/functions/v1/astra-tools/campaign-360': { post: post('runAstraCampaign360', 'Run the complete ASTRA 360 campaign workflow.', { $ref: '#/components/schemas/CampaignRequest' }, { $ref: '#/components/schemas/CampaignResponse' }) },
    '/functions/v1/astra-tools/creative-director': { post: post('runAstraCreativeDirector', 'Create concepts, art direction, and copy-visual planning.', { $ref: '#/components/schemas/CreativeDirectorRequest' }) },
    '/functions/v1/astra-tools/creative-generation': { post: post('runAstraCreativeGeneration', 'Generate or revise an approved creative direction with visual QA.', { $ref: '#/components/schemas/CreativeGenerationRequest' }) },
  };
  if (opts.commercial) Object.assign(paths, commercialPaths(post));
  const schemaExtra = Object.assign({}, opts.commercial ? commercialSchemas() : {});
  return {
    openapi: '3.1.0', info: { title: 'ASTRA GPT Tools', version: '1.0.0', description: 'GPT interface for narrow KB lookup and authoritative ASTRA workflows.' }, servers: [{ url: serverUrl }],
    paths,
    components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } }, schemas: Object.assign(ref, schemaExtra, {
      CampaignRequest: { type: 'object', required: ['input'], additionalProperties: false, properties: { input: { type: 'string', minLength: 1, maxLength: 12000 }, project_id: { type: 'string', maxLength: 128 }, user_context: { type: 'object', additionalProperties: true } } },
      CampaignResponse: { type: 'object', required: ['status', 'workflow_id', 'completed_nodes', 'selected_methods', 'final_synthesis', 'current_research_required', 'limitations', 'usage'], properties: { request_id: { type: 'string' }, status: { type: 'string', enum: ['COMPLETE', 'WAITING_FOR_INPUT', 'BLOCKED', 'FAILED'] }, workflow_id: { type: ['string', 'null'] }, completed_nodes: { type: 'array', items: { type: 'string' } }, selected_methods: { type: 'object', additionalProperties: { type: 'string' } }, final_synthesis: { type: ['object', 'null'], additionalProperties: true }, current_research_required: { type: 'array', items: {} }, limitations: { type: 'array', items: {} }, usage: { type: 'object', additionalProperties: true }, reason: { type: ['string', 'null'] }, required_inputs: { type: 'array', items: { type: 'string' } } } },
      CreativeDirectorRequest: { type: 'object', required: ['input', 'mode'], additionalProperties: false, properties: { input: { type: 'string', minLength: 1, maxLength: 12000 }, mode: { type: 'string', enum: ['SINGLE_CREATIVE', 'CREATIVE_VARIANTS', 'CREATIVE_SYSTEM'] }, brand_constraints: { type: 'object', additionalProperties: true }, reference_assets: { type: 'array', items: { type: 'object', additionalProperties: true }, maxItems: 20 }, commands: { type: 'array', items: { type: 'string' }, maxItems: 20 }, project_id: { type: 'string', maxLength: 128 } } },
      CreativeGenerationRequest: { type: 'object', required: ['creative_director_output', 'generation_mode'], additionalProperties: false, properties: { creative_director_output: { type: 'object', additionalProperties: true }, generation_mode: { type: 'string', enum: ['SINGLE_GENERATION', 'VARIANT_GENERATION', 'REVISION_GENERATION'] }, reference_assets: { type: 'array', items: { type: 'object', additionalProperties: true }, maxItems: 20 }, project_id: { type: 'string', maxLength: 128 } } },
    }) },
  };
}
module.exports = { build };
