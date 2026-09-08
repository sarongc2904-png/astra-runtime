'use strict';
// Provider factory — the single seam ASTRA uses. Given a validated runtime config, returns a
// provider object { provider, model, runner, healthCheck }. The rest of ASTRA (workflow, specialists,
// llm_executor) consumes only `runner` (system,user,opts)=>{raw,usage} and does not care which provider.
const rc = require('./runtime_config');
const openrouter = require('./provider_openrouter');
const lmstudio = require('./provider_lmstudio');

function createProvider(cfg) {
  const v = rc.validate(cfg);
  if (!v.valid) { const err = new Error('runtime config invalid: ' + v.errors.join('; ')); err.fail_closed = true; err.errors = v.errors; throw err; }
  if (cfg.provider === 'openrouter') return openrouter.makeProvider(cfg);
  if (cfg.provider === 'lmstudio') return lmstudio.makeProvider(cfg);
  const err = new Error('unsupported provider: ' + cfg.provider); err.fail_closed = true; throw err;
}

// convenience: build from env
function fromEnv(env) { const cfg = rc.load(env); return { cfg, provider: createProvider(cfg) }; }

module.exports = { createProvider, fromEnv };
