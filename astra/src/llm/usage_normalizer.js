'use strict';
// [ASTRA-10AB] Normalizes a raw OpenAI-compatible `usage` object into a stable shape,
// WITHOUT ever inventing or estimating a field the provider did not supply. The single
// authorized exception: total_tokens MAY be derived as prompt_tokens+completion_tokens
// ONLY when the provider's own total_tokens is absent and both operands are present —
// the raw provider value is always preferred when it exists.
//
// reasoning_tokens / cached_tokens: OpenAI-compatible providers commonly nest these under
// `usage.completion_tokens_details.reasoning_tokens` and `usage.prompt_tokens_details.
// cached_tokens` respectively; some providers may return them flat instead. Both shapes
// are checked explicitly. If neither is present, the field is null — never guessed.
//
// Pure function, no I/O, no secrets. Operates only on already-parsed response JSON.
function normalizeUsage(raw) {
  const empty = { prompt_tokens: null, completion_tokens: null, total_tokens: null, reasoning_tokens: null, cached_tokens: null };
  if (!raw || typeof raw !== 'object') return empty;
  const prompt_tokens = typeof raw.prompt_tokens === 'number' ? raw.prompt_tokens : null;
  const completion_tokens = typeof raw.completion_tokens === 'number' ? raw.completion_tokens : null;
  let total_tokens = typeof raw.total_tokens === 'number' ? raw.total_tokens : null;
  if (total_tokens === null && prompt_tokens !== null && completion_tokens !== null) total_tokens = prompt_tokens + completion_tokens;
  const reasoning_tokens = typeof raw.reasoning_tokens === 'number' ? raw.reasoning_tokens
    : (raw.completion_tokens_details && typeof raw.completion_tokens_details.reasoning_tokens === 'number' ? raw.completion_tokens_details.reasoning_tokens : null);
  const cached_tokens = typeof raw.cached_tokens === 'number' ? raw.cached_tokens
    : (raw.prompt_tokens_details && typeof raw.prompt_tokens_details.cached_tokens === 'number' ? raw.prompt_tokens_details.cached_tokens : null);
  return { prompt_tokens, completion_tokens, total_tokens, reasoning_tokens, cached_tokens };
}

// Extracts finish_reason from a chat-completions-shaped payload. Never invented; null if absent.
function extractFinishReason(payload) {
  const fr = payload && payload.choices && payload.choices[0] && payload.choices[0].finish_reason;
  return typeof fr === 'string' ? fr : null;
}

module.exports = { normalizeUsage, extractFinishReason };
