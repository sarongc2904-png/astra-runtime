'use strict';
// LM Studio local provider (OpenAI-compatible). Model id fully configurable; no reasoning field.
// Returns a runner (system,user,opts)=>{raw,usage} + healthCheck(). Local API; api key is a dummy.
const { redact } = require('./runtime_config');

function makeProvider(cfg) {
  const lm = cfg.lmstudio;
  const model = cfg.model || lm.model;
  async function post(pathname, body, timeout_ms, method) {
    const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), timeout_ms || cfg.timeout_ms);
    try {
      return await fetch(`${lm.baseUrl}${pathname}`, { method: method || 'POST', signal: ctrl.signal,
        headers: { Authorization: `Bearer ${lm.apiKey}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined });
    } finally { clearTimeout(to); }
  }
  async function runner(system, user, opts = {}) {
    const body = { model: opts.model || model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      temperature: 0, max_tokens: opts.max_tokens || cfg.output_token_budget, response_format: { type: 'json_object' }, stream: false };
    let resp = await post('/chat/completions', body, opts.timeout_ms); let errText = '';
    if (!resp.ok) { errText = await resp.text();
      // some LM Studio models reject response_format json_object -> retry once without it
      if (/response_format|json/i.test(errText)) { delete body.response_format; resp = await post('/chat/completions', body, opts.timeout_ms); if (!resp.ok) errText = await resp.text(); } }
    if (!resp.ok) throw new Error(redact(`LMStudio HTTP ${resp.status}: ${errText.slice(0, 200)}`, cfg));
    const p = await resp.json();
    const content = p.choices && p.choices[0] && p.choices[0].message && p.choices[0].message.content;
    if (!content) throw new Error('LMStudio: empty content');
    const usage = p.usage ? { prompt: p.usage.prompt_tokens || 0, completion: p.usage.completion_tokens || 0 } : null;
    return { raw: content, usage };
  }
  // health: reachable + /models + configured model available + minimal completion parseable
  async function healthCheck() {
    const result = { provider: 'lmstudio', model, reachable: false, models_endpoint: false, model_available: null, completion_ok: null, status: 'ENVIRONMENT_NOT_AVAILABLE' };
    let models;
    try {
      const r = await post('/models', null, Math.min(cfg.timeout_ms, 8000), 'GET');
      result.reachable = true; result.models_endpoint = r.ok;
      if (!r.ok) return Object.assign(result, { status: 'MODELS_ENDPOINT_HTTP_' + r.status });
      const j = await r.json(); models = (j.data || []).map(m => m.id); result.available_models = models; result.model_available = model ? models.includes(model) : null;
    } catch (e) { return Object.assign(result, { status: 'ENVIRONMENT_NOT_AVAILABLE', detail: redact(e.message, cfg) }); }
    if (!model) return Object.assign(result, { status: 'MODEL_NOT_CONFIGURED' });
    if (result.model_available === false) return Object.assign(result, { status: 'MODEL_NOT_LOADED' });
    try {
      const rr = await runner('Return strict JSON {"ok":true}. No prose.', 'ping', { max_tokens: 64, timeout_ms: Math.min(cfg.timeout_ms, 20000) });
      let parsed = null; try { parsed = JSON.parse(String(rr.raw).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); } catch (_) {}
      result.completion_ok = parsed != null; result.status = parsed != null ? 'READY' : 'COMPLETION_UNPARSEABLE';
    } catch (e) { result.completion_ok = false; result.status = 'ENVIRONMENT_NOT_AVAILABLE'; result.detail = redact(e.message, cfg); }
    result.ok = result.status === 'READY';
    return result;
  }
  return { provider: 'lmstudio', model, runner, healthCheck };
}

module.exports = { makeProvider };
