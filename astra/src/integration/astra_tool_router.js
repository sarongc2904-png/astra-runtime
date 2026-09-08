'use strict';
const crypto = require('crypto');
const auth = require('./integration_auth');
const R = require('./integration_response');
const adapter = require('./gpt_supabase_adapter');

const MAX_INPUT = 12000; const MAX_BODY = 256000;
const MODES = { runAstraCreativeDirector: ['SINGLE_CREATIVE', 'CREATIVE_VARIANTS', 'CREATIVE_SYSTEM'], runAstraCreativeGeneration: ['SINGLE_GENERATION', 'VARIANT_GENERATION', 'REVISION_GENERATION'] };
function size(value) { return Buffer.byteLength(JSON.stringify(value || {}), 'utf8'); }
function validate(tool, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return ['body must be an object'];
  if (size(body) > MAX_BODY) return ['request body exceeds 256000 bytes'];
  const errors = [];
  if (tool === 'searchKnowledgeBase' && (typeof body.query !== 'string' || !body.query.trim())) errors.push('query is required');
  if ((tool === 'runAstraCampaign360' || tool === 'runAstraCreativeDirector') && (typeof body.input !== 'string' || !body.input.trim())) errors.push('input is required');
  if (typeof body.input === 'string' && body.input.length > MAX_INPUT) errors.push('input exceeds 12000 characters');
  if (tool === 'runAstraCreativeDirector' && !MODES[tool].includes(body.mode)) errors.push('invalid mode');
  if (tool === 'runAstraCreativeGeneration') {
    if (!body.creative_director_output || typeof body.creative_director_output !== 'object') errors.push('creative_director_output is required');
    if (!MODES[tool].includes(body.generation_mode)) errors.push('invalid generation_mode');
  }
  if (body.project_id != null && (typeof body.project_id !== 'string' || body.project_id.length > 128)) errors.push('invalid project_id');
  return errors;
}
async function route({ tool, body, headers = {} }, options = {}, env = process.env) {
  const identity = auth.authenticate(headers, env);
  if (!identity.ok) return R.error(401, 'UNAUTHORIZED', 'Authentication required');
  const errors = validate(tool, body);
  if (errors.length) return R.error(errors.some(x => /exceeds/.test(x)) ? 422 : 400, 'INVALID_INPUT', 'Request validation failed', errors);
  const project = await auth.authorizeProject(body.project_id, identity, options, env);
  if (!project.ok) return R.error(403, 'FORBIDDEN', 'Project access denied');
  const handlers = { searchKnowledgeBase: adapter.searchKnowledgeBase, runAstraCampaign360: adapter.runCampaign, runAstraCreativeDirector: adapter.runCreativeDirector, runAstraCreativeGeneration: adapter.runCreativeGeneration };
  if (!handlers[tool]) return R.error(400, 'INVALID_INPUT', 'Unknown tool');
  const requestId = body.request_id || crypto.randomUUID();
  try {
    const result = await handlers[tool](body, options, env);
    if (typeof options.persistence === 'function') await options.persistence(R.sanitize({ request_id: requestId, timestamp: new Date().toISOString(), tool_name: tool, project_id: body.project_id || null, status: result.status || 'COMPLETE', workflow_id: result.workflow_id || null, selected_methods: result.selected_methods || null, usage: result.usage || null }));
    return R.ok(Object.assign({ request_id: requestId }, result));
  } catch (err) { return R.runtimeFailure(err); }
}
module.exports = { route, validate, MAX_INPUT, MAX_BODY, MODES };
