'use strict';
// [ASTRA-DIAG] Temporary, minimal diagnostic instrumentation for the ASTRA-10S
// campaign-360 timeout/SIGTERM investigation. Timing checkpoints only.
// Never logs API keys, Authorization headers, secret tokens, Supabase credentials,
// request/response bodies, or other private content. Remove after the diagnosis
// is complete; this module has no effect on functional behavior or outputs.
const starts = new Map();

function newId() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

function mark(id, label, extra = {}) {
  try {
    const key = id || 'unknown';
    if (!starts.has(key)) starts.set(key, Date.now());
    const elapsed_ms = Date.now() - starts.get(key);
    console.log('[ASTRA-DIAG]', new Date().toISOString(), label, 'diag_id=' + key, 'elapsed_ms=' + elapsed_ms, JSON.stringify(extra || {}));
    if (label === 'RESPONSE_SENT' || label === 'RUN_END') starts.delete(key);
  } catch (_) {
    // Diagnostics must never break the request path.
  }
}

module.exports = { mark, newId };
