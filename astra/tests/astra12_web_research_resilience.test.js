'use strict';
const assert = require('assert');
const W = require('../src/workflows/marketing_campaign_360_research');

function err(code, extra={}) { const e = new Error(code); e.code = code; Object.assign(e, extra); return e; }

(async () => {
  // Retry transient timeout once, then succeed.
  let calls = 0;
  const provider1 = {
    async research() {
      calls++;
      if (calls === 1) throw err('WEB_MARKET_RESEARCH_TIMEOUT');
      return { status:'COMPLETE', evidence:[], usage:{}, source_count:0 };
    }
  };
  const out1 = await W.run('Producto: CRM\nObjetivo: vender', {
    mode:'deterministic',
    webResearchProvider: provider1,
    hardenedRuntime: async () => ({
      workflow_state_status:'FAILED',
      reason:'TEST_STOP_AFTER_RESEARCH',
      canonical_brief_facts:{},
      node_outputs:[], selected_methods_by_node:{}, synthesis:null, cost:{ mode:'deterministic', model_calls:0, retries:0, tokens:{prompt:0,completion:0} }
    }),
    adapter:{ retrieve(){ return {hits:[], evidenceText:''}; } }
  });
  assert.equal(calls, 2, 'timeout should retry once');
  assert.notEqual(out1.reason, 'WEB_MARKET_RESEARCH_TIMEOUT');

  // Insufficient evidence is deterministic/non-retryable.
  let calls2 = 0;
  const provider2 = { async research(){ calls2++; throw err('WEB_MARKET_RESEARCH_INSUFFICIENT'); } };
  const out2 = await W.run('Producto: CRM', { webResearchProvider:provider2, mode:'deterministic' });
  assert.equal(calls2, 1);
  assert.equal(out2.reason, 'WEB_MARKET_RESEARCH_INSUFFICIENT');
  assert.equal(out2.failure_category, 'WEB_MARKET_RESEARCH');
  assert.equal(out2.web_research.error.code, 'WEB_MARKET_RESEARCH_INSUFFICIENT');
  assert.equal(out2.web_research.attempts, 1);

  // Provider 400 explicitly non-retryable.
  let calls3 = 0;
  const provider3 = { async research(){ calls3++; throw err('WEB_MARKET_RESEARCH_PROVIDER_FAILED', { retryable:false, http_status:400 }); } };
  const out3 = await W.run('Producto: CRM', { webResearchProvider:provider3, mode:'deterministic' });
  assert.equal(calls3, 1);
  assert.equal(out3.reason, 'WEB_MARKET_RESEARCH_PROVIDER_FAILED');

  // Provider 429 is retryable and preserves exact reason after exhausting attempts.
  let calls4 = 0;
  const provider4 = { async research(){ calls4++; throw err('WEB_MARKET_RESEARCH_PROVIDER_FAILED', { retryable:true, http_status:429 }); } };
  const out4 = await W.run('Producto: CRM', { webResearchProvider:provider4, mode:'deterministic' });
  assert.equal(calls4, 2);
  assert.equal(out4.reason, 'WEB_MARKET_RESEARCH_PROVIDER_FAILED');
  assert.equal(out4.web_research.attempts, 2);
  assert.equal(out4.cost.web_research.calls, 2);
  assert.equal(out4.cost.retries, 1);

  assert.equal(W.isRetryableWebResearchError(err('WEB_MARKET_RESEARCH_TIMEOUT')), true);
  assert.equal(W.isRetryableWebResearchError(err('WEB_MARKET_RESEARCH_INSUFFICIENT')), false);
  assert.equal(W.isRetryableWebResearchError(err('WEB_MARKET_RESEARCH_PROVIDER_FAILED', {retryable:false})), false);

  console.log('ASTRA12_WEB_RESEARCH_RESILIENCE_TEST_RESULT pass=1 fail=0');
})().catch(e => { console.error(e.stack || e); process.exit(1); });
