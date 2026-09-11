'use strict';
// ASTRA Campaign360 GPT async bridge — surfaces the existing async runtime through GPT-facing
// Supabase routes + OpenAPI so a GPT Action never hits the 150s IDLE_TIMEOUT.
// Runtime async engine + Supabase forwarders already exist; this validates the GPT-facing seam.
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { createHandler, PATH_TO_TOOL } = require('../src/integration/astra_api_handler');
const asyncJobs = require('../src/integration/campaign_async');
const openapi = require('../src/integration/openapi_builder');

// Paths already carry '/functions/v1/...' — the server must be the bare project origin, NOT
// '.../functions/v1/astra-tools' (that would double the prefix when a client resolves server+path).
const GW = 'https://ftoxermwkfebmnrudiuu.supabase.co';
const KEY = 'runtime-test-key-with-adequate-entropy';
const ENV = { ASTRA_RUNTIME_API_KEY: KEY, ASTRA_ALLOWED_PROJECT_IDS: 'owned' };
const tests = []; let pass = 0, fail = 0;
function t(name, fn) { tests.push({ name, fn }); }

// a slow campaign so we can observe QUEUED/RUNNING before completion
function slowCampaign(ms = 150) {
  return async input => {
    await new Promise(r => setTimeout(r, ms));
    return { workflow_id: 'WF_GPT_ASYNC', workflow_state_status: 'COMPLETE', node_outputs: [{ work_unit_id: 'market_context' }], selected_methods_by_node: { market_context: { primary_method: 'METHOD_SMP' } }, synthesis: { deliverable: { '16_known_limitations': [], '17_current_research_required': [] } }, cost: { model_calls: 0 }, input_received: input };
  };
}
function failCampaign() { return async () => { const e = new Error('ASTRA campaign failure XYZ'); e.code = 'CAMPAIGN_FAILED'; throw e; }; }
async function withServer(options, fn) {
  asyncJobs.resetForTests();
  const server = http.createServer(createHandler(options, ENV));
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try { return await fn(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(r => server.close(r)); }
}
async function post(base, route, body, key = KEY) {
  return fetch(base + route, { method: 'POST', headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) }, body: JSON.stringify(body || {}) });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- runtime seam (what the Supabase gateway forwards to) ----------
t('A1 start returns 202 quickly with a job_id, not waiting for the workflow', () => withServer({ campaignRuntime: slowCampaign(400) }, async base => {
  const t0 = Date.now();
  const res = await post(base, '/astra/campaign-360/async/start', { input: 'Create a 360 dental campaign' });
  const dt = Date.now() - t0;
  const body = await res.json();
  assert.equal(res.status, 202, 'start must be 202');
  assert(dt < 200, `start returned in ${dt}ms — should not block on the workflow`);
  assert(typeof body.job_id === 'string' && body.job_id.length > 0, 'job_id present');
  assert(['QUEUED', 'RUNNING'].includes(body.status));
  assert.equal(body.triggers_action, false);
  for (const k of ['created_at', 'started_at', 'completed_at', 'updated_at']) assert(k in body, `missing ${k}`);
}));
t('A2 status reports QUEUED/RUNNING while the job is in flight', () => withServer({ campaignRuntime: slowCampaign(400) }, async base => {
  const started = await (await post(base, '/astra/campaign-360/async/start', { input: 'x' })).json();
  const res = await post(base, '/astra/campaign-360/async/status', { job_id: started.job_id });
  const s = await res.json();
  assert.equal(res.status, 200);
  assert(['QUEUED', 'RUNNING'].includes(s.status), `status was ${s.status}`);
  assert.equal(s.job_id, started.job_id);
}));
t('A3 result while running returns 202 (no fabricated output)', () => withServer({ campaignRuntime: slowCampaign(400) }, async base => {
  const started = await (await post(base, '/astra/campaign-360/async/start', { input: 'x' })).json();
  const res = await post(base, '/astra/campaign-360/async/result', { job_id: started.job_id });
  const r = await res.json();
  assert.equal(res.status, 202);
  assert(['QUEUED', 'RUNNING'].includes(r.status));
  assert(!('result' in r), 'no result payload while running');
}));
t('A4 completed result returns 200 with the real workflow output', () => withServer({ campaignRuntime: slowCampaign(30) }, async base => {
  const started = await (await post(base, '/astra/campaign-360/async/start', { input: 'x', project_id: 'owned' })).json();
  await sleep(120);
  const res = await post(base, '/astra/campaign-360/async/result', { job_id: started.job_id });
  const r = await res.json();
  assert.equal(res.status, 200);
  assert.equal(r.status, 'COMPLETE');
  assert.equal(r.result.body.workflow_id, 'WF_GPT_ASYNC');
}));
t('A5 FAILED job surfaces the real ASTRA error, not a fake success', () => withServer({ campaignRuntime: failCampaign() }, async base => {
  const started = await (await post(base, '/astra/campaign-360/async/start', { input: 'x', project_id: 'owned' })).json();
  await sleep(80);
  const res = await post(base, '/astra/campaign-360/async/result', { job_id: started.job_id });
  const r = await res.json();
  assert.equal(res.status, 200);
  assert.equal(r.status, 'FAILED');
  assert(r.error && r.error.message);
}));
t('A6 invalid job_id -> 404', () => withServer({}, async base => {
  assert.equal((await post(base, '/astra/campaign-360/async/status', { job_id: 'does-not-exist' })).status, 404);
  assert.equal((await post(base, '/astra/campaign-360/async/result', { job_id: 'does-not-exist' })).status, 404);
}));
t('A7 missing job_id -> 400', () => withServer({}, async base => {
  assert.equal((await post(base, '/astra/campaign-360/async/status', {})).status, 400);
}));
t('A8 invalid bearer -> 401 on every async route', () => withServer({}, async base => {
  for (const r of ['start', 'status', 'result']) {
    assert.equal((await post(base, `/astra/campaign-360/async/${r}`, { input: 'x', job_id: 'x' }, 'wrong-key')).status, 401);
    assert.equal((await post(base, `/astra/campaign-360/async/${r}`, { input: 'x', job_id: 'x' }, '')).status, 401);
  }
}));
t('A9 start rejects a malformed payload (no input)', () => withServer({}, async base => {
  assert.equal((await post(base, '/astra/campaign-360/async/start', {})).status, 400);
}));
t('A10 GET on an async route -> 404 (POST enforced)', () => withServer({}, async base => {
  const res = await fetch(base + '/astra/campaign-360/async/start', { method: 'GET', headers: { authorization: `Bearer ${KEY}` } });
  assert.equal(res.status, 404);
}));

// ---------- sync + commercial routes unchanged ----------
t('B1 sync /astra/campaign-360 route still present and unchanged', () => {
  assert.deepStrictEqual(Object.keys(PATH_TO_TOOL).sort(), ['/astra/campaign-360', '/astra/creative-director', '/astra/creative-generation'].sort());
});
t('B2 sync campaign route still executes (non-GPT callers unaffected)', () => withServer({ campaignRuntime: slowCampaign(10) }, async base => {
  const res = await post(base, '/astra/campaign-360', { input: 'x', project_id: 'owned' });
  const b = await res.json();
  assert.equal(res.status, 200);
  assert.equal(b.workflow_id, 'WF_GPT_ASYNC');
}));
t('B3 commercialBusinessMemory route unchanged', () => withServer({}, async base => {
  const noauth = await post(base, '/astra/commercial/business-memory', {}, '');
  assert.equal(noauth.status, 401);
  const bad = await post(base, '/astra/commercial/business-memory', {});
  assert.equal(bad.status, 400); // valid auth, malformed payload
}));

// ---------- OpenAPI GPT-facing schema ----------
const full = openapi.build(GW, { commercial: true, asyncCampaign: true });
t('O1 base build() still exactly the four legacy operations', () => {
  const ids = Object.values(openapi.build().paths).map(p => p.post.operationId).sort();
  assert.deepStrictEqual(ids, ['runAstraCampaign360', 'runAstraCreativeDirector', 'runAstraCreativeGeneration', 'searchKnowledgeBase']);
});
t('O2 commercial-only schema still exactly eight operations (no async leakage)', () => {
  const ids = Object.values(openapi.build(GW, { commercial: true }).paths).map(p => p.post.operationId);
  assert.equal(new Set(ids).size, 8);
  assert(!ids.some(x => /Async/.test(x)));
});
t('O3 full GPT schema exposes the three async operationIds exactly', () => {
  const ids = Object.values(full.paths).map(p => p.post.operationId);
  for (const id of ['startAstraCampaign360', 'getAstraCampaign360Status', 'getAstraCampaign360Result']) assert(ids.includes(id), `missing ${id}`);
});
t('O4 all operationIds unique, valid OpenAPI 3.1.0, JSON round-trips', () => {
  assert.equal(full.openapi, '3.1.0');
  const ids = Object.values(full.paths).map(p => p.post.operationId);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(JSON.stringify(JSON.parse(JSON.stringify(full))).length, JSON.stringify(full).length);
});
t('O5 every path is POST-only with bearerAuth and standard error responses', () => {
  for (const [p, item] of Object.entries(full.paths)) {
    assert.deepStrictEqual(Object.keys(item), ['post'], `${p} not POST-only`);
    assert.deepStrictEqual(item.post.security, [{ bearerAuth: [] }], `${p} missing bearerAuth`);
    for (const c of [400, 401, 403, 422, 500, 503]) assert(item.post.responses[c], `${p} missing ${c}`);
  }
  assert.deepStrictEqual(full.components.securitySchemes.bearerAuth, { type: 'http', scheme: 'bearer' });
});
t('O6 START schema: input required, user_context optional, NO project_id, additionalProperties false', () => {
  const s = full.components.schemas.Campaign360AsyncStartRequest;
  assert.deepStrictEqual(s.required, ['input']);
  assert.equal(s.additionalProperties, false);
  assert.deepStrictEqual(Object.keys(s.properties).sort(), ['input', 'user_context']);
  assert(!('project_id' in s.properties));
  assert.equal(s.properties.user_context.type, 'object');
});
t('O7 START response includes job_id + all five timestamp/status fields', () => {
  const s = full.components.schemas.Campaign360AsyncJob;
  for (const k of ['job_id', 'status', 'created_at', 'started_at', 'completed_at', 'updated_at']) assert(k in s.properties, `missing ${k}`);
  assert.deepStrictEqual(s.properties.status.enum, ['QUEUED', 'RUNNING', 'COMPLETE', 'FAILED']);
  assert(s.properties.triggers_action);
});
t('O8 STATUS/RESULT request: job_id required, additionalProperties false', () => {
  const s = full.components.schemas.Campaign360AsyncJobRequest;
  assert.deepStrictEqual(s.required, ['job_id']);
  assert.equal(s.additionalProperties, false);
  assert.deepStrictEqual(Object.keys(s.properties), ['job_id']);
});
t('O9 async start declares 202; result declares 202 + 404; status declares 404', () => {
  assert(full.paths['/functions/v1/astra-tools/campaign-360-async-start'].post.responses[202]);
  assert(full.paths['/functions/v1/astra-tools/campaign-360-async-result'].post.responses[202]);
  assert(full.paths['/functions/v1/astra-tools/campaign-360-async-result'].post.responses[404]);
  assert(full.paths['/functions/v1/astra-tools/campaign-360-async-status'].post.responses[404]);
});
t('O10 existing actions preserved in the full schema (legacy non-blocking + commercial) — sync campaign excluded', () => {
  const ids = Object.values(full.paths).map(p => p.post.operationId);
  for (const id of ['searchKnowledgeBase', 'runAstraCreativeDirector', 'runAstraCreativeGeneration', 'commercialBusinessMemory', 'commercialDecisionOrchestrator', 'commercialFunnelRevenue', 'commercialExperimentIntelligence']) assert(ids.includes(id), `lost ${id}`);
  assert(!ids.includes('runAstraCampaign360'), 'sync campaign must not be a GPT footgun once async exists');
});
t('O10b full GPT schema is exactly the ten authorized operations, no more no less', () => {
  const ids = Object.values(full.paths).map(p => p.post.operationId).sort();
  assert.deepStrictEqual(ids, [
    'commercialBusinessMemory', 'commercialDecisionOrchestrator', 'commercialExperimentIntelligence', 'commercialFunnelRevenue',
    'getAstraCampaign360Result', 'getAstraCampaign360Status', 'runAstraCreativeDirector', 'runAstraCreativeGeneration',
    'searchKnowledgeBase', 'startAstraCampaign360',
  ].sort());
});
t('O10c sync campaign stays fully intact in build() base, and in a commercial-only schema without asyncCampaign', () => {
  assert(Object.values(openapi.build().paths).map(p => p.post.operationId).includes('runAstraCampaign360'));
  const commercialOnly = openapi.build(GW, { commercial: true });
  assert(Object.values(commercialOnly.paths).map(p => p.post.operationId).includes('runAstraCampaign360'));
  assert.equal(Object.keys(commercialOnly.paths).length, 8);
});
t('O10d runtime PATH_TO_TOOL still routes the sync campaign path (direct API / runtime unaffected)', () => {
  const { PATH_TO_TOOL } = require('../src/integration/astra_api_handler');
  assert.equal(PATH_TO_TOOL['/astra/campaign-360'], 'runAstraCampaign360');
});
t('O11 no project_id anywhere in the async GPT surface, or in the legacy GPT-facing request schemas', () => {
  const blob = JSON.stringify([
    full.components.schemas.Campaign360AsyncStartRequest,
    full.components.schemas.Campaign360AsyncJobRequest,
    full.components.schemas.Campaign360AsyncJob,
    full.components.schemas.Campaign360AsyncResult,
    full.components.schemas.CampaignRequest,
    full.components.schemas.CreativeDirectorRequest,
    full.components.schemas.CreativeGenerationRequest,
    full.paths['/functions/v1/astra-tools/campaign-360-async-start'],
    full.paths['/functions/v1/astra-tools/campaign-360-async-status'],
    full.paths['/functions/v1/astra-tools/campaign-360-async-result'],
  ]);
  assert(!/project_id/.test(blob));
});
t('O11b project_id explicitly absent from each of the five named schemas', () => {
  for (const name of ['CampaignRequest', 'CreativeDirectorRequest', 'CreativeGenerationRequest', 'Campaign360AsyncStartRequest', 'Campaign360AsyncJobRequest']) {
    const s = full.components.schemas[name];
    assert(s, `${name} missing`);
    assert(!('project_id' in s.properties), `${name} still exposes project_id`);
  }
});
t('O11c project_id remains on the commercial request schemas (unaffected by this remediation)', () => {
  for (const name of ['CommercialFunnelRevenueRequest', 'CommercialExperimentIntelligenceRequest', 'CommercialBusinessMemoryRequest', 'CommercialDecisionOrchestratorRequest']) {
    assert('project_id' in full.components.schemas[name].properties, `${name} lost project_id`);
  }
});
t('O12 every component object schema declares properties (GPT Builder compat)', () => {
  for (const [n, s] of Object.entries(full.components.schemas)) {
    if (s.type === 'object') assert('properties' in s, `${n} object schema has no properties`);
  }
});
t('O13 server URL is exactly the bare Supabase project origin over HTTPS, never Render, never suffixed', () => {
  assert.equal(full.servers[0].url, GW);
  assert.equal(full.servers[0].url, 'https://ftoxermwkfebmnrudiuu.supabase.co');
  assert(full.servers[0].url.startsWith('https://'));
  assert(!/\/functions\/v1/.test(full.servers[0].url), 'server must not carry the functions path — paths already do');
  assert(!JSON.stringify(full).includes('onrender.com'));
});
t('O13b every resolved endpoint (server + path) is well-formed with no doubled /functions/v1/', () => {
  for (const p of Object.keys(full.paths)) {
    const resolved = full.servers[0].url + p;
    const u = new URL(resolved); // throws if malformed
    assert.equal(u.protocol, 'https:');
    assert(!/\/functions\/v1\/astra-tools\/functions\/v1\//.test(resolved), `doubled prefix: ${resolved}`);
    assert.equal((resolved.match(/\/functions\/v1\//g) || []).length, 1, `expected exactly one /functions/v1/ segment: ${resolved}`);
  }
});
t('O13c the resolved async-start endpoint is the correct single Supabase URL', () => {
  const resolved = full.servers[0].url + '/functions/v1/astra-tools/campaign-360-async-start';
  assert.equal(resolved, 'https://ftoxermwkfebmnrudiuu.supabase.co/functions/v1/astra-tools/campaign-360-async-start');
});
t('O13d builder normalizes a caller mistake (serverUrl already including the functions/astra-tools suffix)', () => {
  for (const bad of [
    'https://ftoxermwkfebmnrudiuu.supabase.co/functions/v1/astra-tools',
    'https://ftoxermwkfebmnrudiuu.supabase.co/functions/v1/astra-tools/',
    'https://ftoxermwkfebmnrudiuu.supabase.co/functions/v1',
  ]) {
    const s = openapi.build(bad, { commercial: true, asyncCampaign: true });
    assert.equal(s.servers[0].url, 'https://ftoxermwkfebmnrudiuu.supabase.co', `did not normalize ${bad}`);
  }
});
t('O14 Supabase gateway forwards the three async slugs to the runtime async paths', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../supabase/functions/astra-tools/index.ts'), 'utf8');
  for (const [slug, target] of [
    ['campaign-360-async-start', '/astra/campaign-360/async/start'],
    ['campaign-360-async-status', '/astra/campaign-360/async/status'],
    ['campaign-360-async-result', '/astra/campaign-360/async/result'],
  ]) assert(src.includes(`'${slug}': '${target}'`), `missing forward ${slug}`);
  assert(src.includes("'campaign-360': '/astra/campaign-360'"), 'sync forward lost');
});

// ---------- recursive structural audit: every "object" node must declare properties ----------
// GPT Builder rejects a schema node typed "object" (or a type array containing "object") that
// has no "properties" key — even nested, even inside array items, even a deliberately free-form
// object (which must spell that out as `properties: {}` alongside `additionalProperties: true`).
function isObjectType(t) { return t === 'object' || (Array.isArray(t) && t.includes('object')); }
function walkSchema(node, nodePath, defects, seen) {
  if (node == null || typeof node !== 'object') return;
  if (seen.has(node)) return; // guards against any accidental reference cycle
  seen.add(node);
  if (Array.isArray(node)) { node.forEach((v, i) => walkSchema(v, `${nodePath}[${i}]`, defects, seen)); return; }
  if ('$ref' in node) return; // resolved via components.schemas itself, walked separately
  if (isObjectType(node.type) && !('properties' in node)) defects.push(nodePath);
  for (const combinator of ['oneOf', 'anyOf', 'allOf']) {
    if (Array.isArray(node[combinator])) node[combinator].forEach((sub, i) => walkSchema(sub, `${nodePath}.${combinator}[${i}]`, defects, seen));
  }
  for (const [k, v] of Object.entries(node)) {
    if (k === 'type' || ['oneOf', 'anyOf', 'allOf'].includes(k)) continue;
    walkSchema(v, `${nodePath}.${k}`, defects, seen);
  }
}
function auditRecursiveObjectSchemas(spec) {
  const defects = []; const seen = new WeakSet();
  walkSchema(spec.components && spec.components.schemas, 'components.schemas', defects, seen);
  let checked = 0;
  for (const [p, item] of Object.entries(spec.paths)) {
    checked += 1;
    walkSchema(item.post.requestBody, `paths['${p}'].post.requestBody`, defects, seen);
    walkSchema(item.post.responses, `paths['${p}'].post.responses`, defects, seen);
  }
  return { defects, pathsChecked: checked };
}

t('R1 recursive audit: zero object schema nodes missing properties (RECURSIVE_OBJECT_SCHEMA_MISSING_PROPERTIES = 0)', () => {
  const { defects } = auditRecursiveObjectSchemas(full);
  assert.deepStrictEqual(defects, [], `object schema(s) missing properties at:\n  ${defects.join('\n  ')}`);
});
t('R2 recursive audit covers components.schemas, every requestBody and every responses block', () => {
  const { pathsChecked } = auditRecursiveObjectSchemas(full);
  assert.equal(pathsChecked, Object.keys(full.paths).length);
  assert.equal(pathsChecked, 10);
});
t('R3 recursive audit reports an exact defect path when one is deliberately introduced', () => {
  const broken = JSON.parse(JSON.stringify(full));
  broken.components.schemas.CommercialResponse.properties.result = { type: 'object', additionalProperties: true };
  const { defects } = auditRecursiveObjectSchemas(broken);
  assert.deepStrictEqual(defects, ['components.schemas.CommercialResponse.properties.result']);
});
t('R4 base build() and commercial-only build() also pass the recursive audit', () => {
  assert.deepStrictEqual(auditRecursiveObjectSchemas(openapi.build()).defects, []);
  assert.deepStrictEqual(auditRecursiveObjectSchemas(openapi.build(GW, { commercial: true })).defects, []);
});
t('R5 free-form objects are explicit — properties:{} plus additionalProperties:true, never bare "object"', () => {
  const freeForm = [
    full.components.schemas.CommercialResponse.properties.report,
    full.components.schemas.CommercialResponse.properties.result,
    full.components.schemas.CampaignResponse.properties.final_synthesis,
    full.components.schemas.CampaignResponse.properties.usage,
    full.components.schemas.CreativeDirectorResponse.properties.creative_director_output,
    full.components.schemas.CreativeGenerationResponse.properties.final_approved_asset,
  ];
  for (const s of freeForm) { assert.deepStrictEqual(s.properties, {}); assert.equal(s.additionalProperties, true); }
});
t('R6 CreativeDirector/CreativeGeneration success responses are real, named schemas — not the generic object fallback', () => {
  const cd = full.paths['/functions/v1/astra-tools/creative-director'].post.responses[200].content['application/json'].schema;
  const cg = full.paths['/functions/v1/astra-tools/creative-generation'].post.responses[200].content['application/json'].schema;
  assert.equal(cd.$ref, '#/components/schemas/CreativeDirectorResponse');
  assert.equal(cg.$ref, '#/components/schemas/CreativeGenerationResponse');
  for (const name of ['CreativeDirectorResponse', 'CreativeGenerationResponse']) {
    const s = full.components.schemas[name];
    assert.equal(s.type, 'object'); assert('properties' in s); assert(s.required.includes('status'));
  }
});

(async () => {
  for (const x of tests) { try { await x.fn(); pass += 1; console.log('PASS', x.name); } catch (e) { fail += 1; console.log('FAIL', x.name, '::', e && e.message); } }
  console.log(`\nASTRA_CAMPAIGN360_GPT_ASYNC_BRIDGE_TEST_RESULT pass=${pass} fail=${fail}`);
  if (fail) process.exit(1);
})();
