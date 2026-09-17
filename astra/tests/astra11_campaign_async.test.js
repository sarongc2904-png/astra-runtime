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
function fixtureFidelityFailure() {
  return async () => ({
    workflow_id: 'WF_ASYNC_FAILED', workflow_state_status: 'FAILED', reason: 'BRIEF_FIDELITY_VIOLATION',
    canonical_brief_facts: { price: { value: '1497', status: 'USER_PROVIDED_FACT' } },
    brief_fidelity_violations: [{ type: 'UNLABELED_PROPOSAL', node: 'offer', field_key: 'offer_structure', path: 'node_outputs.offer.downstream_payload.offer_structure' }],
    node_outputs: [{ work_unit_id: 'market_context' }, { work_unit_id: 'icp' }],
    selected_methods_by_node: { market_context: { primary_method: 'M1' }, icp: { primary_method: 'M2' } },
    synthesis: null, cost: { model_calls: 3, tokens: { prompt: 100, completion: 50 } },
  });
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
t('async fidelity failure preserves structured diagnostics in status and result', () => withServer({ campaignRuntime: fixtureFidelityFailure() }, async base => {
  const start = await post(base, '/astra/campaign-360/async/start', { input: 'campaign', project_id: 'owned' }); const started = await start.json();
  await new Promise(r => setTimeout(r, 30));
  const status = await post(base, '/astra/campaign-360/async/status', { job_id: started.job_id }); const s = await status.json();
  assert.equal(status.status, 200); assert.equal(s.status, 'FAILED');
  assert.equal(s.error.code, 'BRIEF_FIDELITY_VIOLATION');
  assert.match(s.error.message, /BRIEF_FIDELITY_VIOLATION/);
  assert.equal(s.reason, 'BRIEF_FIDELITY_VIOLATION');
  assert.equal(s.failed_node, 'offer');
  assert.deepStrictEqual(s.completed_nodes, ['market_context', 'icp']);
  assert.equal(s.brief_fidelity_violations[0].path, 'node_outputs.offer.downstream_payload.offer_structure');
  assert.equal(s.canonical_brief_facts.price.value, '1497');
  assert.equal(s.usage.model_calls, 3);
  const result = await post(base, '/astra/campaign-360/async/result', { job_id: started.job_id }); const r = await result.json();
  assert.equal(r.status, 'FAILED');
  assert.equal(r.error.code, 'BRIEF_FIDELITY_VIOLATION');
  assert.equal(r.reason, 'BRIEF_FIDELITY_VIOLATION');
  assert.equal(r.failed_node, 'offer');
  assert.equal(r.result.body.reason, 'BRIEF_FIDELITY_VIOLATION');
  assert.equal(r.result.body.brief_fidelity_violations[0].node, 'offer');
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
t('public job exposes live progress telemetry and stalled health', () => {
  const now = new Date().toISOString();
  const active = asyncJobs.publicJob({
    job_id: 'job-active', status: 'RUNNING', created_at: now, started_at: now, updated_at: now,
    last_activity_at: now, current_phase: 'NODE_EXECUTION', current_node: 'offer',
    active_nodes: ['offer'], completed_nodes: ['market_context', 'icp'],
  });
  assert.equal(active.health, 'ACTIVE');
  assert.equal(active.current_phase, 'NODE_EXECUTION');
  assert.equal(active.current_node, 'offer');
  assert.deepStrictEqual(active.active_nodes, ['offer']);
  assert.deepStrictEqual(active.completed_nodes, ['market_context', 'icp']);
  assert(active.idle_seconds >= 0);

  const old = new Date(Date.now() - 6 * 60 * 1000).toISOString();
  const stalled = asyncJobs.publicJob({
    job_id: 'job-stalled', status: 'RUNNING', created_at: old, started_at: old, updated_at: old,
    last_activity_at: old, current_phase: 'FINAL_SYNTHESIS', current_node: 'final_synthesis',
    active_nodes: ['final_synthesis'], completed_nodes: ['market_context'],
  });
  assert.equal(stalled.health, 'POSSIBLY_STALLED');
  assert(stalled.idle_seconds >= 300);
});
(async () => {
  for (const x of tests) { try { await x.fn(); pass += 1; console.log('PASS', x.name); } catch (err) { fail += 1; console.log('FAIL', x.name, '::', err.message); } }
  console.log(`ASTRA11_CAMPAIGN_ASYNC_TEST_RESULT pass=${pass} fail=${fail}`); if (fail) process.exit(1);
})();
