'use strict';
const router = require('./astra_tool_router');
const runtimeAuth = require('./runtime_auth');
const diag = require('./diag'); // [ASTRA-DIAG] temporary instrumentation (ASTRA-10S)
const commercialBridge = require('./commercial_bridge'); // [ASTRA-11] commercial GPT bridge

const PATH_TO_TOOL = {
  '/astra/campaign-360': 'runAstraCampaign360',
  '/astra/creative-director': 'runAstraCreativeDirector',
  '/astra/creative-generation': 'runAstraCreativeGeneration',
};
async function readJson(req, max = router.MAX_BODY) {
  return new Promise((resolve, reject) => {
    let raw = ''; let rejected = false;
    req.on('data', chunk => { raw += chunk; if (Buffer.byteLength(raw) > max && !rejected) { rejected = true; const e = new Error('request too large'); e.statusCode = 422; reject(e); } });
    req.on('end', () => { if (rejected) return; try { resolve(JSON.parse(raw || '{}')); } catch { const e = new Error('invalid JSON'); e.statusCode = 400; reject(e); } });
    req.on('error', reject);
  });
}
function send(res, result, diagId) {
  if (diagId) diag.mark(diagId, 'BEFORE_RESPONSE', { statusCode: result.statusCode });
  res.writeHead(result.statusCode, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(result.body));
  if (diagId) diag.mark(diagId, 'RESPONSE_SENT');
}
function createHandler(options = {}, env = process.env) {
  return async (req, res) => {
    const path = String(req.url || '').split('?')[0];
    if (req.method === 'GET' && path === '/health') {
      return send(res, { statusCode: 200, body: { status: 'ok', service: 'astra-runtime' } });
    }
    const diagId = diag.newId(); // [ASTRA-DIAG]
    diag.mark(diagId, 'REQUEST_RECEIVED', { path, method: req.method });

    // [ASTRA-11] commercial GPT bridge — deterministic engine delegation, no side effects.
    if (commercialBridge.PATH_TO_OPERATION[path]) {
      if (req.method !== 'POST') return send(res, { statusCode: 404, body: { status: 'FAILED', error: { code: 'NOT_FOUND', message: 'Route not found' } } }, diagId);
      const commercialEnv = Object.assign({}, env, { KB_API_KEY: '' });
      try {
        const body = await readJson(req);
        diag.mark(diagId, 'BEFORE_COMMERCIAL_BRIDGE', { operation: commercialBridge.PATH_TO_OPERATION[path] });
        const result = await commercialBridge.dispatch({ operation: commercialBridge.PATH_TO_OPERATION[path], body, headers: req.headers }, options, commercialEnv);
        diag.mark(diagId, 'AFTER_COMMERCIAL_BRIDGE');
        return send(res, result, diagId);
      } catch (err) {
        return send(res, { statusCode: err.statusCode || 400, body: { status: 'FAILED', error: { code: 'INVALID_INPUT', message: err.statusCode === 422 ? 'Request too large' : 'Invalid JSON' } } }, diagId);
      }
    }

    if (req.method !== 'POST' || !PATH_TO_TOOL[path]) return send(res, { statusCode: 404, body: { status: 'FAILED', error: { code: 'NOT_FOUND', message: 'Route not found' } } }, diagId);
    if (!runtimeAuth.authenticate(req.headers, env)) return send(res, { statusCode: 401, body: { status: 'FAILED', error: { code: 'UNAUTHORIZED', message: 'Authentication required' } } }, diagId);
    const internalEnv = Object.assign({}, env, { ASTRA_GPT_API_KEYS: env.ASTRA_RUNTIME_API_KEY, KB_API_KEY: '' });
    try {
      const body = await readJson(req);
      diag.mark(diagId, 'BEFORE_ROUTER', { tool: PATH_TO_TOOL[path] });
      const result = await router.route({ tool: PATH_TO_TOOL[path], body, headers: req.headers }, options, internalEnv);
      diag.mark(diagId, 'AFTER_ROUTER');
      send(res, result, diagId);
    }
    catch (err) { send(res, { statusCode: err.statusCode || 400, body: { status: 'FAILED', error: { code: 'INVALID_INPUT', message: err.statusCode === 422 ? 'Request too large' : 'Invalid JSON' } } }, diagId); }
  };
}
module.exports = { createHandler, readJson, PATH_TO_TOOL, COMMERCIAL_PATH_TO_OPERATION: commercialBridge.PATH_TO_OPERATION };
