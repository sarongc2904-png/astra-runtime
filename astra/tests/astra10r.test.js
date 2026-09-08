'use strict';
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { createHandler, PATH_TO_TOOL } = require('../src/integration/astra_api_handler');
const runtimeAuth = require('../src/integration/runtime_auth');

const ROOT = path.join(__dirname, '..', '..');
const KEY = 'runtime-test-key-with-adequate-entropy';
const ENV = { ASTRA_RUNTIME_API_KEY: KEY, ASTRA_ALLOWED_PROJECT_IDS: 'owned' };
const tests = []; let pass = 0; let fail = 0;
function t(name, fn) { tests.push({ name, fn }); }
function fixtureCampaign(status = 'COMPLETE') {
  return async input => ({ workflow_id: 'WF_RUNTIME', workflow_state_status: status, node_outputs: [{ work_unit_id: 'market_context' }], selected_methods_by_node: { market_context: { primary_method: 'METHOD_SMP' } }, synthesis: { deliverable: { '16_known_limitations': [], '17_current_research_required': [] } }, cost: { model_calls: 0 }, input_received: input });
}
async function withServer(options, fn) {
  const server = http.createServer(createHandler(options, ENV));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { return await fn(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}
async function request(base, route, body, key = KEY) {
  return fetch(base + route, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body: JSON.stringify(body) });
}

t('health is shallow, safe and unauthenticated', () => withServer({}, async base => {
  const res = await fetch(base + '/health'); const body = await res.json();
  assert.equal(res.status, 200); assert.deepEqual(body, { status: 'ok', service: 'astra-runtime' });
  assert(!JSON.stringify(body).match(/key|env|secret/i));
}));
t('all three execution routes exist', () => assert.deepEqual(Object.keys(PATH_TO_TOOL).sort(), ['/astra/campaign-360', '/astra/creative-director', '/astra/creative-generation'].sort()));
t('missing runtime bearer is rejected', () => withServer({}, async base => assert.equal((await request(base, '/astra/campaign-360', { input: 'x' }, '')).status, 401)));
t('wrong runtime bearer is rejected', () => withServer({}, async base => assert.equal((await request(base, '/astra/campaign-360', { input: 'x' }, 'wrong')).status, 401)));
t('GPT-facing key is not accepted by runtime', () => withServer({}, async base => assert.equal((await request(base, '/astra/campaign-360', { input: 'x' }, 'gpt-facing-key')).status, 401)));
t('constant-time comparator handles unequal lengths safely', () => { assert(runtimeAuth.constantEqual(KEY, KEY)); assert(!runtimeAuth.constantEqual(KEY, 'x')); assert(!runtimeAuth.constantEqual('', '')); });
t('campaign route preserves state through HTTP', () => withServer({ campaignRuntime: fixtureCampaign() }, async base => {
  const res = await request(base, '/astra/campaign-360', { input: 'campaign', project_id: 'owned', request_id: 'REQ_STATE' }); const body = await res.json();
  assert.equal(res.status, 200); assert.equal(body.request_id, 'REQ_STATE'); assert.equal(body.workflow_id, 'WF_RUNTIME'); assert.deepEqual(body.completed_nodes, ['market_context']);
}));
t('creative director route executes through HTTP', () => withServer({}, async base => {
  const res = await request(base, '/astra/creative-director', { input: 'Dental clinic editorial creative', mode: 'SINGLE_CREATIVE', brand_constraints: { offer: 'booking' }, reference_assets: [], commands: [] }); const body = await res.json();
  assert.equal(res.status, 200); assert.equal(body.status, 'COMPLETE'); assert(body.creative_director_output);
}));
t('creative generation is honest when live provider is unavailable', () => withServer({}, async base => {
  const director = await request(base, '/astra/creative-director', { input: 'Dental clinic editorial creative', mode: 'SINGLE_CREATIVE', brand_constraints: { offer: 'booking' }, reference_assets: [], commands: [] });
  const d = await director.json(); const res = await request(base, '/astra/creative-generation', { creative_director_output: d.creative_director_output, generation_mode: 'SINGLE_GENERATION', reference_assets: [] }); const body = await res.json();
  assert.equal(res.status, 200); assert.equal(body.status, 'BLOCKED'); assert.equal((body.generated_assets || []).length, 0);
}));
t('unknown route is not exposed', () => withServer({}, async base => assert.equal((await request(base, '/astra/search-kb', { query: 'x' })).status, 404)));
t('Docker contract pins runtimes and runs non-root', () => {
  const d = fs.readFileSync(path.join(ROOT, 'astra/runtime_host/Dockerfile'), 'utf8');
  assert(/node:22\.23\.0-bookworm-slim@sha256:/.test(d)); assert(/python:3\.12\.12-slim-bookworm@sha256:/.test(d)); assert(/USER astra:astra/.test(d)); assert(/HEALTHCHECK/.test(d));
});
t('Render blueprint uses Docker and health path with secret placeholders', () => {
  const y = fs.readFileSync(path.join(ROOT, 'render.yaml'), 'utf8'); assert(/runtime: docker/.test(y)); assert(/healthCheckPath: \/health/.test(y)); assert(/ASTRA_RUNTIME_API_KEY[\s\S]*sync: false/.test(y));
});
t('Docker context excludes local secret files', () => {
  const d = fs.readFileSync(path.join(ROOT, '.dockerignore'), 'utf8'); assert(/^config\.json$/m.test(d)); assert(/^\*\*\/\.env$/m.test(d));
});
t('protected hashes remain exact', () => {
  const expected = JSON.parse(fs.readFileSync(path.join(ROOT, 'astra/packaging_runtime/protection_validation.json'))).current_sha256;
  for (const [file, hash] of Object.entries(expected)) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, file))).digest('hex'), hash, file);
});

(async () => {
  for (const x of tests) { try { await x.fn(); pass += 1; console.log('PASS', x.name); } catch (err) { fail += 1; console.log('FAIL', x.name, '::', err.message); } }
  console.log(`ASTRA10R_TEST_RESULT pass=${pass} fail=${fail}`); if (fail) process.exit(1);
})();
