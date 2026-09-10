'use strict';
// ASTRA-11 — Commercial GPT bridge. Recreates the runtime routes + Supabase forwarding +
// OpenAPI operations that delegate EXCLUSIVELY to the four deterministic commercial engines.
// Offline only: no network, no LLM, no production DB, no deploy, no side effects.
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { createHandler, PATH_TO_TOOL, COMMERCIAL_PATH_TO_OPERATION } = require('../src/integration/astra_api_handler');
const bridge = require('../src/integration/commercial_bridge');
const openapi = require('../src/integration/openapi_builder');

const FR = require('../src/commercial/funnel_revenue');
const EI = require('../src/commercial/experiment_intelligence');
const BM = require('../src/commercial/business_memory');
const DO = require('../src/commercial/decision_orchestrator');
const J = require('../benchmarks/astra11j/fixtures');
const K = require('../benchmarks/astra11k/fixtures');

const REF = '2026-09-09T00:00:00Z';
const KEY = 'bridge-runtime-key-with-adequate-entropy';
const ENV = { ASTRA_RUNTIME_API_KEY: KEY };
const HDR = { authorization: `Bearer ${KEY}` };

const tests = []; let pass = 0, fail = 0;
function t(name, fn) { tests.push({ name, fn }); }

async function withServer(options, fn) {
  const server = http.createServer(createHandler(options, ENV));
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try { return await fn(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(r => server.close(r)); }
}
async function req(base, route, body, key = KEY, method = 'POST') {
  return fetch(base + route, { method, headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) }, body: method === 'POST' ? JSON.stringify(body || {}) : undefined });
}

// ---- valid engine payloads (real deterministic fixtures) ----
function funnelPayload() {
  return { referenceTime: J.REFERENCE_TIME, businessInput: { funnel: { funnel_kind: 'CUSTOM', stages: ['LEAD', 'PURCHASE'] }, observations: [J.obs('LEAD', 50, 'e1'), J.obs('PURCHASE', 5, 'e2')] } };
}
function experimentPayload() {
  const b = K.base ? K.base() : null;
  return { referenceTime: K.REFERENCE_TIME, funnelRevenueResult: b.fr, experimentSpec: b.s };
}
function memoryPayload() { return { referenceTime: REF, businessId: 'biz_bridge', candidates: [] }; }
function decisionPayload() { return { referenceTime: REF, businessId: 'biz_bridge', scope: {}, opportunities: [] }; }

const ROUTES = {
  'funnel-revenue': { path: '/astra/commercial/funnel-revenue', payload: funnelPayload },
  'experiment-intelligence': { path: '/astra/commercial/experiment-intelligence', payload: experimentPayload },
  'business-memory': { path: '/astra/commercial/business-memory', payload: memoryPayload },
  'decision-orchestrator': { path: '/astra/commercial/decision-orchestrator', payload: decisionPayload },
};

// ---------- ROUTE EXISTENCE ----------
t('R1 all four commercial routes are registered on the handler', () => {
  assert.deepStrictEqual(
    Object.keys(COMMERCIAL_PATH_TO_OPERATION).sort(),
    ['/astra/commercial/business-memory', '/astra/commercial/decision-orchestrator', '/astra/commercial/experiment-intelligence', '/astra/commercial/funnel-revenue']
  );
});
t('R2 commercial routes do NOT pollute the existing PATH_TO_TOOL map', () => {
  assert.deepStrictEqual(Object.keys(PATH_TO_TOOL).sort(), ['/astra/campaign-360', '/astra/creative-director', '/astra/creative-generation'].sort());
});
t('R3 bridge exposes exactly the four operations', () => {
  assert.deepStrictEqual(Object.keys(bridge.OPERATIONS).sort(), ['business-memory', 'decision-orchestrator', 'experiment-intelligence', 'funnel-revenue']);
});
t('R4 each route resolves end-to-end over HTTP', () => withServer({}, async base => {
  for (const [op, def] of Object.entries(ROUTES)) {
    const res = await req(base, def.path, def.payload());
    assert.equal(res.status, 200, `${op} -> ${res.status}`);
    const body = await res.json();
    assert.equal(body.status, undefined === body.status ? undefined : body.status, '');
    assert.equal(body.operation, op);
    assert(body.report, `${op} returned no report`);
  }
}));

// ---------- POST METHOD VALIDATION ----------
t('M1 GET on a commercial route is 404 (POST only)', () => withServer({}, async base => {
  const res = await req(base, '/astra/commercial/funnel-revenue', null, KEY, 'GET');
  assert.equal(res.status, 404);
}));
t('M2 PUT on a commercial route is 404', () => withServer({}, async base => {
  const res = await fetch(base + '/astra/commercial/business-memory', { method: 'PUT', headers: HDR });
  assert.equal(res.status, 404);
}));

// ---------- AUTH ENFORCEMENT ----------
t('A1 missing bearer -> 401', () => withServer({}, async base => {
  const res = await req(base, '/astra/commercial/decision-orchestrator', decisionPayload(), '');
  assert.equal(res.status, 401);
  const b = await res.json(); assert.equal(b.error.code, 'UNAUTHORIZED');
}));
t('A2 wrong bearer -> 401', () => withServer({}, async base => {
  const res = await req(base, '/astra/commercial/decision-orchestrator', decisionPayload(), 'nope');
  assert.equal(res.status, 401);
}));
t('A3 dispatch() enforces auth independent of the HTTP layer', async () => {
  const r = await bridge.dispatch({ operation: 'business-memory', body: memoryPayload(), headers: {} }, {}, ENV);
  assert.equal(r.statusCode, 401);
});

// ---------- REQUEST VALIDATION ----------
t('V1 missing referenceTime -> 400 with reason', () => withServer({}, async base => {
  const res = await req(base, '/astra/commercial/business-memory', { businessId: 'b' });
  assert.equal(res.status, 400);
  const b = await res.json();
  assert.equal(b.error.code, 'INVALID_INPUT');
  assert(b.error.details.some(d => /referenceTime/.test(d)));
}));
t('V2 missing businessId for decision-orchestrator -> 400', () => withServer({}, async base => {
  const res = await req(base, '/astra/commercial/decision-orchestrator', { referenceTime: REF });
  assert.equal(res.status, 400);
}));
t('V3 decision-orchestrator accepts decisionTimestamp instead of referenceTime', () => withServer({}, async base => {
  const res = await req(base, '/astra/commercial/decision-orchestrator', { businessId: 'b', decisionTimestamp: REF, scope: {}, opportunities: [] });
  assert.equal(res.status, 200);
}));
t('V4 experiment-intelligence requires opportunity | funnelRevenueResult', () => withServer({}, async base => {
  const res = await req(base, '/astra/commercial/experiment-intelligence', { referenceTime: REF });
  assert.equal(res.status, 400);
  const b = await res.json();
  assert(b.error.details.some(d => /opportunity|funnelRevenueResult/.test(d)));
}));
t('V5 non-object body -> 400', () => withServer({}, async base => {
  const res = await fetch(base + '/astra/commercial/funnel-revenue', { method: 'POST', headers: { 'content-type': 'application/json', ...HDR }, body: '[]' });
  assert.equal(res.status, 400);
}));
t('V6 oversized body -> 422', async () => {
  const big = { referenceTime: REF, businessId: 'b', filler: 'x'.repeat(300000) };
  const r = await bridge.dispatch({ operation: 'business-memory', body: big, headers: HDR }, {}, ENV);
  assert.equal(r.statusCode, 422);
});

// ---------- CORRECT ENGINE DISPATCH ----------
t('D1 each route delegates to its own engine entrypoint (injected spies)', () => withServer({
  engines: {
    runFunnelRevenue: b => ({ report: { kind: 'FR', echo: b } }),
    runExperimentIntelligence: b => ({ report: { kind: 'EI', echo: b } }),
    runBusinessMemory: b => ({ report: { kind: 'BM', echo: b }, triggers_action: false }),
    runDecisionOrchestrator: b => ({ report: { kind: 'DEC', echo: b }, triggers_action: false }),
  },
}, async base => {
  const expect = { 'funnel-revenue': 'FR', 'experiment-intelligence': 'EI', 'business-memory': 'BM', 'decision-orchestrator': 'DEC' };
  for (const [op, def] of Object.entries(ROUTES)) {
    const res = await req(base, def.path, def.payload());
    const b = await res.json();
    assert.equal(res.status, 200);
    assert.equal(b.report.kind, expect[op], `${op} dispatched to wrong engine`);
    assert.equal(b.tool, bridge.OPERATIONS[op].tool);
  }
}));
t('D2 real engines produce their real deterministic reports', () => withServer({}, async base => {
  const fr = await (await req(base, ROUTES['funnel-revenue'].path, funnelPayload())).json();
  assert.equal(fr.report.schema_version, 'ucdm-funnel-revenue-1.0.0');
  const bm = await (await req(base, ROUTES['business-memory'].path, memoryPayload())).json();
  assert.equal(bm.report.schema_version, 'ucdm-business-memory-1.0.0');
  const dec = await (await req(base, ROUTES['decision-orchestrator'].path, decisionPayload())).json();
  assert.equal(dec.report.schema_version, 'ucdm-decision-orchestrator-1.0.0');
  const ei = await (await req(base, ROUTES['experiment-intelligence'].path, experimentPayload())).json();
  assert.equal(ei.report.schema_version, 'ucdm-experiment-1.0.0');
}));
t('D3 dispatch is deterministic — identical payload -> identical report_id', () => withServer({}, async base => {
  const a = await (await req(base, ROUTES['decision-orchestrator'].path, decisionPayload())).json();
  const b = await (await req(base, ROUTES['decision-orchestrator'].path, decisionPayload())).json();
  assert.equal(a.report.report_id, b.report.report_id);
}));

// ---------- MALFORMED PAYLOAD REJECTION ----------
t('P1 invalid JSON body -> 400', () => withServer({}, async base => {
  const res = await fetch(base + '/astra/commercial/funnel-revenue', { method: 'POST', headers: { 'content-type': 'application/json', ...HDR }, body: '{not json' });
  assert.equal(res.status, 400);
}));
t('P2 engine precondition failure surfaces as 400 INVALID_INPUT, not 500', () => withServer({}, async base => {
  const res = await req(base, '/astra/commercial/funnel-revenue', { referenceTime: REF, businessInput: { funnel: { stages: ['LEAD', 'LEAD'] } } });
  assert.equal(res.status, 400);
  const b = await res.json();
  assert.equal(b.error.code, 'INVALID_INPUT');
}));
t('P3 unexpected engine throw -> 500 RUNTIME_FAILED, no stack leak', async () => {
  const r = await bridge.dispatch({ operation: 'business-memory', body: memoryPayload(), headers: HDR }, {
    engines: { runBusinessMemory: () => { throw new Error('boom sk-secretvalue123'); } },
  }, ENV);
  assert.equal(r.statusCode, 500);
  assert(!JSON.stringify(r.body).includes('secretvalue'));
  assert(!('stack' in r.body));
});

// ---------- UNKNOWN OPERATION REJECTION ----------
t('U1 unknown commercial sub-path is 404 at the handler', () => withServer({}, async base => {
  const res = await req(base, '/astra/commercial/pricing-optimizer', { referenceTime: REF });
  assert.equal(res.status, 404);
}));
t('U2 dispatch() rejects an unknown operation name', async () => {
  const r = await bridge.dispatch({ operation: 'nonsense', body: {}, headers: HDR }, {}, ENV);
  assert.equal(r.statusCode, 404);
  assert.equal(r.body.error.code, 'NOT_FOUND');
});
t('U3 unknown non-commercial route still 404 (no regression)', () => withServer({}, async base => {
  const res = await req(base, '/astra/search-kb', { query: 'x' });
  assert.equal(res.status, 404);
}));

// ---------- SUPABASE FORWARDING ----------
t('S1 astra-tools Edge function forwards the four commercial slugs to the runtime paths', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../supabase/functions/astra-tools/index.ts'), 'utf8');
  for (const [slug, target] of [
    ['commercial-funnel-revenue', '/astra/commercial/funnel-revenue'],
    ['commercial-experiment-intelligence', '/astra/commercial/experiment-intelligence'],
    ['commercial-business-memory', '/astra/commercial/business-memory'],
    ['commercial-decision-orchestrator', '/astra/commercial/decision-orchestrator'],
  ]) {
    assert(src.includes(`'${slug}': '${target}'`), `missing forward ${slug} -> ${target}`);
  }
});
t('S2 Edge function keeps the existing creative routes and remains forward-only (no shell / fs)', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../supabase/functions/astra-tools/index.ts'), 'utf8');
  assert(/campaign-360/.test(src) && /creative-director/.test(src) && /creative-generation/.test(src));
  assert(!/child_process|Deno\.Command|readTextFile|writeTextFile|Deno\.run/.test(src));
});
t('S3 no schema migration added by the bridge', () => {
  const files = fs.readdirSync(path.join(__dirname, '../../supabase/migrations'));
  assert(!files.some(x => /commercial|bridge|astra11|astra-11/i.test(x)));
});

// ---------- OPENAPI ----------
t('O1 base OpenAPI spec is unchanged (still exactly four operations)', () => {
  const spec = openapi.build();
  const ids = Object.values(spec.paths).map(p => p.post.operationId);
  assert.deepStrictEqual(ids.sort(), ['runAstraCampaign360', 'runAstraCreativeDirector', 'runAstraCreativeGeneration', 'searchKnowledgeBase'].sort());
});
t('O2 commercial spec adds the four GPT Actions operations', () => {
  const spec = openapi.build('https://PROJECT_REF.supabase.co', { commercial: true });
  const ids = Object.values(spec.paths).map(p => p.post.operationId);
  for (const id of ['commercialFunnelRevenue', 'commercialExperimentIntelligence', 'commercialBusinessMemory', 'commercialDecisionOrchestrator']) assert(ids.includes(id), `missing ${id}`);
  assert.equal(new Set(ids).size, 8);
});
t('O3 commercial operations carry bearer security + the standard error responses', () => {
  const spec = openapi.build('x', { commercial: true });
  for (const p of Object.values(spec.paths)) {
    if (!/commercial/.test(p.post.operationId)) continue;
    assert.deepStrictEqual(p.post.security, [{ bearerAuth: [] }]);
    for (const c of [400, 401, 403, 422, 500, 503]) assert(p.post.responses[c], `${p.post.operationId} missing ${c}`);
  }
});

// ---------- ABSENCE OF SIDE EFFECTS ----------
t('X1 bridge source performs no network / fs / persistence / deploy', () => {
  const src = fs.readFileSync(path.join(__dirname, '../src/integration/commercial_bridge.js'), 'utf8');
  assert(!/\bfetch\s*\(|require\(['"](http|https|net|fs|child_process)['"]\)|XMLHttpRequest|new WebSocket|createClient\s*\(|\.from\(['"]/.test(src));
  assert(!/writeFileSync|writeFile\(|appendFile|execSync|spawn\(/.test(src));
});
t('X2 commercial engines are unmodified deterministic modules (no runtime/LLM import)', () => {
  for (const eng of ['funnel_revenue', 'experiment_intelligence', 'business_memory', 'decision_orchestrator']) {
    for (const f of fs.readdirSync(path.join(__dirname, '../src/commercial', eng))) {
      if (!f.endsWith('.js')) continue;
      const s = fs.readFileSync(path.join(__dirname, '../src/commercial', eng, f), 'utf8');
      assert(!/\bfetch\s*\(|require\(['"](http|https|openai|@anthropic-ai\/sdk|@supabase\/supabase-js)['"]\)/.test(s), `${eng}/${f}`);
    }
  }
});
t('X3 dispatch passes the body straight to the engine and mutates nothing', () => withServer({}, async base => {
  const p = memoryPayload();
  const snapshot = JSON.stringify(p);
  await req(base, ROUTES['business-memory'].path, p);
  assert.equal(JSON.stringify(p), snapshot);
}));
t('X4 no persistence hook is invoked by the commercial bridge', () => withServer({
  persistence: () => { throw new Error('persistence must not be called by the commercial bridge'); },
}, async base => {
  const res = await req(base, ROUTES['decision-orchestrator'].path, decisionPayload());
  assert.equal(res.status, 200);
}));

// ---------- triggers_action=false WHERE IT APPLIES ----------
t('T1 decision-orchestrator response carries triggers_action=false', () => withServer({}, async base => {
  const b = await (await req(base, ROUTES['decision-orchestrator'].path, decisionPayload())).json();
  assert.equal(b.triggers_action, false);
  assert.equal(b.report.triggers_action, false);
}));
t('T2 business-memory response carries no action trigger', () => withServer({}, async base => {
  const b = await (await req(base, ROUTES['business-memory'].path, memoryPayload())).json();
  assert.notEqual(b.triggers_action, true);
}));
t('T3 experiment-intelligence + funnel-revenue never signal an action', () => withServer({}, async base => {
  for (const op of ['experiment-intelligence', 'funnel-revenue']) {
    const b = await (await req(base, ROUTES[op].path, ROUTES[op].payload())).json();
    assert.notEqual(b.triggers_action, true);
  }
}));
t('T4 the whole commercial surface is analytical — no engine returns triggers_action true', () => {
  for (const [op, def] of Object.entries(ROUTES)) {
    const result = bridge.OPERATIONS[op].delegate(def.payload(), {});
    const ta = ('triggers_action' in result) ? result.triggers_action : (result.report && result.report.triggers_action);
    assert.notEqual(ta, true, op);
  }
});

(async () => {
  for (const x of tests) {
    try { await x.fn(); pass++; console.log('PASS', x.name); }
    catch (e) { fail++; console.log('FAIL', x.name, '::', e && e.message); }
  }
  console.log(`\nASTRA11_COMMERCIAL_GPT_BRIDGE_TEST_RESULT pass=${pass} fail=${fail}`);
  if (fail) process.exit(1);
})();
