'use strict';
// ASTRA-07 provider smoke tests. Live only when the environment/credentials are present.
// Records ENVIRONMENT_NOT_AVAILABLE / CREDENTIALS_UNAVAILABLE honestly (NOT a product failure).
const fs = require('fs'); const path = require('path');
const rc = require('../src/runtime/runtime_config');
const factory = require('../src/runtime/llm_provider');
const DIR = __dirname;
function w(n, o) { fs.writeFileSync(path.join(DIR, n), JSON.stringify(o, null, 2) + '\n'); }

async function smoke(providerName) {
  const env = Object.assign({}, process.env, { ASTRA_LLM_PROVIDER: providerName });
  const cfg = rc.load(env);
  const v = rc.validate(cfg);
  const base = { provider: providerName, generated_at: new Date().toISOString(), diagnostics: rc.sanitized(cfg) };
  if (!v.valid) {
    const credMissing = v.errors.some(e => /CREDENTIALS_UNAVAILABLE|API_KEY/i.test(e));
    const modelMissing = v.errors.some(e => /MODEL.*missing|model.*missing/i.test(e));
    if (providerName === 'lmstudio' && modelMissing && v.errors.every(e => /MODEL.*missing|model.*missing/i.test(e))) {
      const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), Math.min(cfg.timeout_ms, 8000));
      try {
        const r = await fetch(`${cfg.lmstudio.baseUrl}/models`, { headers: { Authorization: `Bearer ${cfg.lmstudio.apiKey}` }, signal: ctrl.signal });
        if (r.ok) { const j = await r.json(); return Object.assign(base, { status: 'MODEL_NOT_CONFIGURED', reachable: true, available_models: (j.data || []).map(m => m.id), errors: v.errors, product_defect: false }); }
        return Object.assign(base, { status: 'ENVIRONMENT_NOT_AVAILABLE', reachable: true, models_endpoint_status: r.status, errors: v.errors, product_defect: false });
      } catch (e) { return Object.assign(base, { status: 'ENVIRONMENT_NOT_AVAILABLE', reachable: false, error: rc.redact(e.message, cfg), errors: v.errors, product_defect: false }); }
      finally { clearTimeout(to); }
    }
    return Object.assign(base, { status: credMissing ? 'CREDENTIALS_UNAVAILABLE' : (modelMissing ? 'MODEL_NOT_CONFIGURED' : 'CONFIG_INVALID'), errors: v.errors, product_defect: false });
  }
  try {
    const provider = factory.createProvider(cfg);
    const health = await provider.healthCheck();
    return Object.assign(base, { model: provider.model, health, status: health.ok ? 'READY' : health.status, product_defect: false });
  } catch (e) { return Object.assign(base, { status: 'ENVIRONMENT_NOT_AVAILABLE', error: rc.redact(e.message, cfg), product_defect: false }); }
}

(async () => {
  const requested = process.argv[2];
  const targets = requested ? [requested] : ['openrouter', 'lmstudio'];
  if (targets.some(x => !rc.PROVIDERS.includes(x))) throw new Error('usage: node smoke_test.js [openrouter|lmstudio]');
  const results = [];
  for (const target of targets) { const result = await smoke(target); w(target + '_smoke_test.json', result); results.push(target.toUpperCase() + '_SMOKE=' + result.status); }
  console.log(results.join(' | '));
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
