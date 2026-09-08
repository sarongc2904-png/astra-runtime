'use strict';
// OpenRouter provider (OpenAI-compatible). Reasoning-disabled + 400 fallback (gpt-5-mini mandatory reasoning).
// Returns a runner (system,user,opts)=>{raw,usage} + healthCheck(). Never logs/returns secrets.
const { redact } = require('./runtime_config');

function makeProvider(cfg) {
  const or = cfg.openrouter;
  async function chat(body, timeout_ms) {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), timeout_ms || cfg.timeout_ms);
    try {
      return await fetch(`${or.baseUrl}/chat/completions`, {
        method: 'POST', signal: ctrl.signal,
        headers: { Authorization: `Bearer ${or.apiKey}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://localhost/astra', 'X-Title': 'ASTRA Orchestrator' },
        body: JSON.stringify(body),
      });
    } finally { clearTimeout(to); }
  }
  async function runner(system, user, opts = {}) {
    const body = { model: opts.model || cfg.model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      temperature: 0, max_tokens: opts.max_tokens || cfg.output_token_budget, response_format: { type: 'json_object' }, reasoning: { enabled: false } };
    let resp = await chat(body, opts.timeout_ms); let errText = '';
    if (!resp.ok) errText = await resp.text();
    if (resp.status === 400 && /reasoning/i.test(errText)) { delete body.reasoning; resp = await chat(body, opts.timeout_ms); if (!resp.ok) errText = await resp.text(); }
    if (!resp.ok) throw new Error(redact(`OpenRouter HTTP ${resp.status}: ${errText.slice(0, 200)}`, cfg));
    const p = await resp.json();
    const content = p.choices && p.choices[0] && p.choices[0].message && p.choices[0].message.content;
    if (!content) throw new Error('OpenRouter: empty content');
    const usage = p.usage ? { prompt: p.usage.prompt_tokens || 0, completion: p.usage.completion_tokens || 0 } : null;
    return { raw: content, usage };
  }
  async function healthCheck() {
    if (!or.apiKey) return { ok: false, status: 'CREDENTIALS_UNAVAILABLE', provider: 'openrouter', reachable: null };
    const result = { ok: false, status: 'ENVIRONMENT_NOT_AVAILABLE', provider: 'openrouter', reachable: false, model: cfg.model, model_available: null };
    let to;
    try {
      const ctrl = new AbortController(); to = setTimeout(() => ctrl.abort(), Math.min(cfg.timeout_ms, 15000));
      const r = await fetch(`${or.baseUrl}/models`, { headers: { Authorization: `Bearer ${or.apiKey}` }, signal: ctrl.signal }); clearTimeout(to);
      result.reachable = true;
      if (!r.ok) return Object.assign(result, { status: 'HTTP_' + r.status });
      const j = await r.json();
      const models = (j.data || []).map(m => m.id);
      result.model_available = models.includes(cfg.model);
      result.status = result.model_available ? 'READY' : 'MODEL_NOT_AVAILABLE';
      result.ok = result.status === 'READY';
      return result;
    } catch (e) { return Object.assign(result, { detail: redact(e.message, cfg) }); }
    finally { if (to) clearTimeout(to); }
  }
  return { provider: 'openrouter', model: cfg.model, runner, healthCheck };
}

module.exports = { makeProvider };
