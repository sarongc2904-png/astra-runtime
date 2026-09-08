'use strict';
// IMAGE_PROVIDER — provider-neutral image-generation abstraction (ASTRA-08C).
// The orchestrator consumes only `generateCreative(request)` + `healthCheck()` and never cares which
// provider backs it. A live provider that is not configured returns ENVIRONMENT_NOT_AVAILABLE — it is
// NEVER faked as a successful generation. Mirrors the ASTRA-07 llm_provider factory shape.
const mock = require('./mock_image_provider');

// Canonical request contract (documented for callers/tests).
const REQUEST_FIELDS = ['prompt', 'negative_prompt', 'aspect_ratio', 'format', 'constraints', 'reference_assets', 'metadata'];

// Redact any secret from error/diagnostic text.
function redact(text, cfg) {
  let s = String(text || '');
  const key = cfg && cfg.apiKey;
  if (key && key.length > 4) s = s.split(key).join('***REDACTED***');
  return s.replace(/(Authorization"?\s*:\s*"?Bearer\s+)[^"\s,]+/gi, '$1***REDACTED***');
}

function validateRequest(req) {
  const errors = [];
  if (!req || typeof req !== 'object') return { valid: false, errors: ['request not an object'] };
  if (!req.prompt || typeof req.prompt !== 'string') errors.push('missing prompt');
  if (!req.aspect_ratio) errors.push('missing aspect_ratio');
  if (!req.format) errors.push('missing format');
  return { valid: errors.length === 0, errors };
}

// A live provider stub: honest about being unavailable unless real credentials + endpoint are configured.
// It never renders a fake image. Wire a concrete SDK here later under separate authorization.
function makeLiveProvider(cfg = {}) {
  const configured = !!(cfg.apiKey && cfg.baseUrl && cfg.model);
  return {
    provider: cfg.provider || 'live_image_provider',
    model: cfg.model || null,
    is_mock: false,
    async healthCheck() {
      if (!configured) return { provider: this.provider, ok: false, status: 'ENVIRONMENT_NOT_AVAILABLE', reason: cfg.apiKey ? 'incomplete image-provider config' : 'CREDENTIALS_UNAVAILABLE' };
      // Not wiring a live SDK in 08C. Report not-available rather than pretending.
      return { provider: this.provider, ok: false, status: 'ENVIRONMENT_NOT_AVAILABLE', reason: 'live image SDK not connected in ASTRA-08C (requires separate authorization)' };
    },
    async generateCreative(req) {
      const v = validateRequest(req);
      if (!v.valid) return { status: 'MALFORMED', provider: this.provider, errors: v.errors };
      // Do NOT fabricate a live generation.
      return { status: 'ENVIRONMENT_NOT_AVAILABLE', provider: this.provider, model: this.model,
        reason: configured ? 'live image SDK not connected in ASTRA-08C' : 'CREDENTIALS_UNAVAILABLE', faked: false };
    },
  };
}

// Factory. kind: 'mock' (default) | 'live'. cfg passes provider/model/apiKey/baseUrl for the live path.
function createProvider(opts = {}) {
  const kind = opts.kind || opts.provider_kind || 'mock';
  if (kind === 'mock') return mock.makeProvider(opts.mock || {});
  if (kind === 'live') return makeLiveProvider(opts.cfg || {});
  const err = new Error('unsupported image provider kind: ' + kind); err.fail_closed = true; throw err;
}

// Build from env: only use a live provider when explicitly requested AND credentials exist; else mock.
function fromEnv(env = process.env) {
  const wantLive = /^(1|true|live)$/i.test(String(env.ASTRA_IMAGE_PROVIDER_LIVE || ''));
  if (wantLive) {
    const cfg = { provider: env.ASTRA_IMAGE_PROVIDER || 'live_image_provider', model: env.ASTRA_IMAGE_MODEL || '', apiKey: env.ASTRA_IMAGE_API_KEY || '', baseUrl: env.ASTRA_IMAGE_BASE_URL || '' };
    return { kind: 'live', provider: makeLiveProvider(cfg), cfg_present: !!(cfg.apiKey && cfg.baseUrl && cfg.model) };
  }
  return { kind: 'mock', provider: mock.makeProvider({}), cfg_present: true };
}

module.exports = { createProvider, fromEnv, makeLiveProvider, validateRequest, redact, REQUEST_FIELDS };
