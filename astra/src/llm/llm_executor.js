'use strict';
// ASTRA LLM execution layer — evidence-bounded, strict structured output, bounded retry, fail-closed.
// Uses the project OpenRouter config (openai/gpt-5-mini) but NEVER modifies knowledge.js / Agent V1.
// Reasoning-disabled with 400 fallback (gpt-5-mini mandatory reasoning). Config-driven model id.
const fs = require('fs');
const path = require('path');

const RETRY_BUDGET = 1; // bounded retry on schema failure (total attempts = 1 + RETRY_BUDGET)

function loadCfg() {
  const p = path.join(__dirname, '..', '..', '..', 'config.json');
  const c = JSON.parse(fs.readFileSync(p, 'utf8'));
  return { apiKey: c.apiKey, model: c.model || 'openai/gpt-5-mini', baseUrl: c.baseUrl || 'https://openrouter.ai/api/v1' };
}

function stripJson(text) {
  return String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
}

// Validate an object against a lightweight schema { required:[...], arrays:[...], strings:[...] }.
function validateSchema(obj, schema) {
  const errors = [];
  if (!obj || typeof obj !== 'object') return { valid: false, errors: ['not an object'] };
  for (const k of schema.required || []) if (!(k in obj)) errors.push('missing:' + k);
  for (const k of schema.arrays || []) if (k in obj && !Array.isArray(obj[k])) errors.push('not-array:' + k);
  for (const k of schema.strings || []) if (k in obj && typeof obj[k] !== 'string') errors.push('not-string:' + k);
  return { valid: errors.length === 0, errors };
}

async function callOnce(cfg, system, user, opts) {
  const body = {
    model: opts.model || cfg.model,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    temperature: 0, max_tokens: opts.max_tokens || 4000, response_format: { type: 'json_object' },
  };
  body.reasoning = { enabled: false };
  const doFetch = (b) => fetch(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST', headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://localhost/astra', 'X-Title': 'ASTRA Orchestrator' },
    body: JSON.stringify(b),
  });
  let resp = await doFetch(body); let errText = '';
  if (!resp.ok) errText = await resp.text();
  if (resp.status === 400 && /reasoning/i.test(errText)) { delete body.reasoning; resp = await doFetch(body); if (!resp.ok) errText = await resp.text(); }
  if (!resp.ok) throw new Error(`LLM HTTP ${resp.status}: ${errText.slice(0, 200)}`);
  const payload = await resp.json();
  const content = payload.choices && payload.choices[0] && payload.choices[0].message && payload.choices[0].message.content;
  if (!content) throw new Error('empty LLM content');
  const usage = payload.usage ? { prompt: payload.usage.prompt_tokens || 0, completion: payload.usage.completion_tokens || 0 } : null;
  return { raw: content, usage };
}

// Execute an LLM specialist call. opts: { schema, model, max_tokens, llm (injectable for tests) }.
// Returns { ok, value, attempts, retries, usage, error }. Fail-closed after retry budget.
async function execute({ system, user, schema, model, max_tokens, llm }) {
  const cfg = loadCfg();
  const runner = llm || ((s, u, o) => callOnce(cfg, s, u, o));
  let attempts = 0, lastErr = null, totalUsage = { prompt: 0, completion: 0 };
  while (attempts <= RETRY_BUDGET) {
    attempts++;
    try {
      const { raw, usage } = await runner(system, user, { model, max_tokens });
      if (usage) { totalUsage.prompt += usage.prompt || 0; totalUsage.completion += usage.completion || 0; }
      let value;
      try { value = JSON.parse(stripJson(raw)); } catch (e) { lastErr = 'json_parse:' + e.message; continue; }
      const v = validateSchema(value, schema);
      if (!v.valid) { lastErr = 'schema:' + v.errors.join(','); continue; }
      return { ok: true, value, attempts, retries: attempts - 1, usage: totalUsage, error: null };
    } catch (e) { lastErr = e.message; }
  }
  return { ok: false, value: null, attempts, retries: attempts - 1, usage: totalUsage, error: lastErr || 'unknown', fail_closed: true };
}

module.exports = { execute, validateSchema, stripJson, loadCfg, RETRY_BUDGET };
