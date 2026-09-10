'use strict';
// [ASTRA-11 commercial GPT bridge] Narrow runtime bridge for the four deterministic ASTRA-11
// commercial engines. It authenticates, bounds and validates the request, then delegates
// EXCLUSIVELY to the engine entrypoint. It performs no other work:
//   - no network, no filesystem, no persistence, no LLM, no deploy, no campaign / budget action.
// Engine outputs are passed through untouched (only secret-redacted); triggers_action is
// preserved where the engine emits it.
const runtimeAuth = require('./runtime_auth');
const R = require('./integration_response');

const FUNNEL_REVENUE = require('../commercial/funnel_revenue');
const EXPERIMENT_INTELLIGENCE = require('../commercial/experiment_intelligence');
const BUSINESS_MEMORY = require('../commercial/business_memory');
const DECISION_ORCHESTRATOR = require('../commercial/decision_orchestrator');

const MAX_BODY = 256000;

// operation -> { path, tool, engine delegate, required top-level fields }
const OPERATIONS = Object.freeze({
  'funnel-revenue': {
    path: '/astra/commercial/funnel-revenue',
    tool: 'commercialFunnelRevenue',
    delegate: (body, engines) => (engines.runFunnelRevenue || FUNNEL_REVENUE.engine.runFunnelRevenue)(body),
    required: ['referenceTime', 'businessInput'],
  },
  'experiment-intelligence': {
    path: '/astra/commercial/experiment-intelligence',
    tool: 'commercialExperimentIntelligence',
    delegate: (body, engines) => (engines.runExperimentIntelligence || EXPERIMENT_INTELLIGENCE.engine.runExperimentIntelligence)(body),
    required: ['referenceTime'],
    oneOf: ['opportunity', 'funnelRevenueResult'],
  },
  'business-memory': {
    path: '/astra/commercial/business-memory',
    tool: 'commercialBusinessMemory',
    delegate: (body, engines) => (engines.runBusinessMemory || BUSINESS_MEMORY.engine.runBusinessMemory)(body),
    required: ['referenceTime', 'businessId'],
  },
  'decision-orchestrator': {
    path: '/astra/commercial/decision-orchestrator',
    tool: 'commercialDecisionOrchestrator',
    delegate: (body, engines) => (engines.runDecisionOrchestrator || DECISION_ORCHESTRATOR.engine.runDecisionOrchestrator)(body),
    required: ['businessId'], // referenceTime OR decisionTimestamp — checked below
  },
});

const PATH_TO_OPERATION = Object.freeze(
  Object.fromEntries(Object.entries(OPERATIONS).map(([op, def]) => [def.path, op]))
);

function size(value) { return Buffer.byteLength(JSON.stringify(value || {}), 'utf8'); }

function validate(operation, body) {
  const def = OPERATIONS[operation];
  if (!def) return { code: 'UNKNOWN_OPERATION', errors: [`unknown commercial operation "${operation}"`] };
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { code: 'INVALID_INPUT', errors: ['body must be a JSON object'] };
  if (size(body) > MAX_BODY) return { code: 'OVERSIZED', errors: [`request body exceeds ${MAX_BODY} bytes`] };
  const errors = [];
  for (const field of def.required) {
    if (body[field] == null || (typeof body[field] === 'string' && !body[field].trim())) errors.push(`${field} is required`);
  }
  if (operation === 'decision-orchestrator' && body.referenceTime == null && body.decisionTimestamp == null) {
    errors.push('referenceTime or decisionTimestamp is required');
  }
  if (def.oneOf && !def.oneOf.some(f => body[f] != null)) {
    errors.push(`one of ${def.oneOf.join(' | ')} is required`);
  }
  return { code: errors.length ? 'INVALID_INPUT' : null, errors };
}

// dispatch({ operation, body, headers }, options, env)
//   options.engines — optional per-engine delegate overrides (test injection only)
//   options.authenticate — optional auth override (test injection only)
async function dispatch({ operation, body, headers = {} }, options = {}, env = process.env) {
  const authenticate = options.authenticate || runtimeAuth.authenticate;
  if (!authenticate(headers, env)) return R.error(401, 'UNAUTHORIZED', 'Authentication required');

  const v = validate(operation, body);
  if (v.code === 'UNKNOWN_OPERATION') return R.error(404, 'NOT_FOUND', 'Unknown commercial operation', v.errors);
  if (v.code === 'OVERSIZED') return R.error(422, 'INVALID_INPUT', 'Request too large', v.errors);
  if (v.errors && v.errors.length) return R.error(400, 'INVALID_INPUT', 'Request validation failed', v.errors);

  const engines = options.engines || {};
  let result;
  try {
    result = await OPERATIONS[operation].delegate(body, engines);
  } catch (err) {
    // engine precondition failures are analytical validation errors, not runtime outages
    const msg = String((err && err.message) || '');
    if (/^\[ASTRA-11[JKLM]\]/.test(msg)) return R.error(400, 'INVALID_INPUT', 'Engine rejected the request', [R.redactText(msg)]);
    return R.runtimeFailure(err);
  }

  const payload = { operation, tool: OPERATIONS[operation].tool };
  if (result && typeof result === 'object') {
    payload.report = result.report || null;
    if ('triggers_action' in result) payload.triggers_action = result.triggers_action === true;
    else if (result.report && 'triggers_action' in result.report) payload.triggers_action = result.report.triggers_action === true;
    payload.result = result;
  } else {
    payload.result = result;
  }
  return R.ok(payload);
}

module.exports = { OPERATIONS, PATH_TO_OPERATION, MAX_BODY, validate, dispatch };
