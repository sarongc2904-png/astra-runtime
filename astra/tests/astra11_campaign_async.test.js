'use strict';
const assert = require('assert');
const http = require('http');
const { createHandler } = require('../src/integration/astra_api_handler');
const asyncJobs = require('../src/integration/campaign_async');

const KEY = 'runtime-test-key-with-adequate-entropy';
const ENV = { ASTRA_RUNTIME_API_KEY: KEY, ASTRA_ALLOWED_PROJECT_IDS: 'owned' };
const tests = []; let pass = 0; let fail = 0;
function t(name, fn) { tests.push({ name, fn }); }
function fixtureCampaign() {
  return async input => {
    await new Promise(r => setTimeout(r, 25));
    return { workflow_id: 'WF_ASYNC', workflow_state_status: 'COMPLETE', node_outputs: [{ work_unit_id: 'market_context' }], selected_methods_by_node: { market_context: { primary_method: 'METHOD_SMP' } }, synthesis: { deliverable: { '16_known_limitations': [], '17_current_research_required': [] } }, cost: { model_calls: 0 }, input_received: input };
  };
}
async function withServer(options, fn) {
  asyncJobs.resetForTests();
  const server = http.createServer(createHandler(options, ENV));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { return await fn(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}
async function post(base, route, body, key = KEY) {
  return fetch(base + route, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body: JSON.stringify(body) });
}
t('async start returns 202 + job_id without waiting', () => withServer({ campaignRuntime: fixtureCampaign() }, async base => {
  const res = await post(base, '/astra/campaign-360/async/start', { input: 'campaign' }); const body = await res.json();
  assert.equal(res.status, 202); assert(body.job_id); assert(['QUEUED','RUNNING'].includes(body.status)); assert.equal(body.triggers_action, false);
}));
t('async status/result complete', () => withServer({ campaignRuntime: fixtureCampaign() }, async base => {
  const start = await post(base, '/astra/campaign-360/async/start', { input: 'campaign', project_id: 'owned' }); const started = await start.json();
  await new Promise(r => setTimeout(r, 60));
  const status = await post(base, '/astra/campaign-360/async/status', { job_id: started.job_id }); const s = await status.json();
  assert.equal(status.status, 200); assert.equal(s.status, 'COMPLETE');
  const result = await post(base, '/astra/campaign-360/async/result', { job_id: started.job_id }); const r = await result.json();
  assert.equal(result.status, 200); assert.equal(r.status, 'COMPLETE'); assert.equal(r.result.statusCode, 200); assert.equal(r.result.body.workflow_id, 'WF_ASYNC');
}));
t('invalid project stays fail-closed', () => withServer({ campaignRuntime: fixtureCampaign() }, async base => {
  const start = await post(base, '/astra/campaign-360/async/start', { input: 'campaign', project_id: 'not-owned' }); const started = await start.json();
  await new Promise(r => setTimeout(r, 20));
  const result = await post(base, '/astra/campaign-360/async/result', { job_id: started.job_id }); const r = await result.json();
  assert.equal(r.status, 'FAILED'); assert.equal(r.result.statusCode, 403); assert.equal(r.result.body.error.code, 'FORBIDDEN');
}));
t('status/result require auth', () => withServer({}, async base => {
  const res = await post(base, '/astra/campaign-360/async/status', { job_id: 'x' }, ''); assert.equal(res.status, 401);
}));
t('unknown job returns 404', () => withServer({}, async base => {
  const res = await post(base, '/astra/campaign-360/async/result', { job_id: 'missing' }); assert.equal(res.status, 404);
}));
(async () => {
  for (const x of tests) { try { await x.fn(); pass += 1; console.log('PASS', x.name); } catch (err) { fail += 1; console.log('FAIL', x.name, '::', err.message); } }
  console.log(`ASTRA11_CAMPAIGN_ASYNC_TEST_RESULT pass=${pass} fail=${fail}`); if (fail) process.exit(1);
})();
