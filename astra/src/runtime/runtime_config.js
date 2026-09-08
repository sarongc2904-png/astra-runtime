'use strict';
// ASTRA runtime configuration — reads env, validates, exposes sanitized diagnostics (no secrets).
const PROVIDERS = ['openrouter', 'lmstudio'];

function load(env = process.env) {
  const provider = (env.ASTRA_LLM_PROVIDER || 'openrouter').toLowerCase();
  const cfg = {
    provider,
    model: env.ASTRA_LLM_MODEL || (provider === 'openrouter' ? '' : env.LMSTUDIO_MODEL || ''),
    timeout_ms: parseInt(env.ASTRA_TIMEOUT_MS || '120000', 10),
    retry_budget: parseInt(env.ASTRA_RETRY_BUDGET || '1', 10),
    output_token_budget: parseInt(env.ASTRA_OUTPUT_TOKEN_BUDGET || '16000', 10),
    openrouter: {
      apiKey: env.OPENROUTER_API_KEY || '',
      baseUrl: env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
    },
    lmstudio: {
      apiKey: env.LMSTUDIO_API_KEY || 'lm-studio',
      baseUrl: env.LMSTUDIO_BASE_URL || 'http://127.0.0.1:1234/v1',
      model: env.LMSTUDIO_MODEL || (provider === 'lmstudio' ? env.ASTRA_LLM_MODEL || '' : ''),
    },
  };
  if (provider === 'lmstudio' && !cfg.model) cfg.model = cfg.lmstudio.model;
  return cfg;
}

function validate(cfg) {
  const errors = [];
  const validHttpUrl = value => {
    try { const u = new URL(value); return u.protocol === 'http:' || u.protocol === 'https:'; }
    catch (_) { return false; }
  };
  if (!PROVIDERS.includes(cfg.provider)) errors.push(`invalid ASTRA_LLM_PROVIDER '${cfg.provider}' (allowed: ${PROVIDERS.join('|')})`);
  if (!(Number.isInteger(cfg.timeout_ms) && cfg.timeout_ms > 0)) errors.push('ASTRA_TIMEOUT_MS must be an integer > 0');
  if (!(Number.isInteger(cfg.retry_budget) && cfg.retry_budget >= 0)) errors.push('ASTRA_RETRY_BUDGET must be an integer >= 0');
  if (!(Number.isInteger(cfg.output_token_budget) && cfg.output_token_budget > 0)) errors.push('ASTRA_OUTPUT_TOKEN_BUDGET must be an integer > 0');
  if (cfg.provider === 'openrouter') {
    if (!validHttpUrl(cfg.openrouter.baseUrl)) errors.push('OPENROUTER_BASE_URL must be a valid http(s) URL');
    if (!cfg.model) errors.push('ASTRA_LLM_MODEL missing for openrouter');
    if (!cfg.openrouter.apiKey) errors.push('OPENROUTER_API_KEY missing (CREDENTIALS_UNAVAILABLE)');
  } else if (cfg.provider === 'lmstudio') {
    if (!validHttpUrl(cfg.lmstudio.baseUrl)) errors.push('LMSTUDIO_BASE_URL must be a valid http(s) URL');
    if (!cfg.model) errors.push('LMSTUDIO_MODEL / ASTRA_LLM_MODEL missing');
  }
  return { valid: errors.length === 0, errors };
}

// diagnostics with all secrets redacted (booleans only for key presence)
function sanitized(cfg) {
  return {
    provider: cfg.provider, model: cfg.model, timeout_ms: cfg.timeout_ms, retry_budget: cfg.retry_budget, output_token_budget: cfg.output_token_budget,
    openrouter: { baseUrl: cfg.openrouter.baseUrl, api_key_present: Boolean(cfg.openrouter.apiKey) },
    lmstudio: { baseUrl: cfg.lmstudio.baseUrl, model: cfg.lmstudio.model, api_key_present: Boolean(cfg.lmstudio.apiKey) },
  };
}

// redact secrets from any error text
function redact(text, cfg) {
  let s = String(text || '');
  const secrets = [cfg && cfg.openrouter && cfg.openrouter.apiKey, cfg && cfg.lmstudio && cfg.lmstudio.apiKey].filter(x => x && x.length > 4);
  for (const sec of secrets) s = s.split(sec).join('***REDACTED***');
  s = s.replace(/(Authorization"?\s*:\s*"?Bearer\s+)[^"\s,]+/gi, '$1***REDACTED***').replace(/(sk-[a-z]*-?)[A-Za-z0-9._-]{6,}/g, '$1***REDACTED***');
  return s;
}

module.exports = { PROVIDERS, load, validate, sanitized, redact };
