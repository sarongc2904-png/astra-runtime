'use strict';

const SECRET_KEYS = /(^|_)(api_?key|authorization|token|secret|service_?role|password|credential)s?$/i;
const SECRET_TEXT = /(Bearer\s+)[A-Za-z0-9._~+\/-]+|\b(sk-[A-Za-z0-9_-]{8,}|sb_(?:secret|publishable)_[A-Za-z0-9_-]+)\b/g;

function redactText(value) {
  return String(value || '').replace(SECRET_TEXT, (_m, prefix) => prefix ? prefix + '[REDACTED]' : '[REDACTED]');
}

function sanitize(value, seen = new WeakSet()) {
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return redactText(value);
  if (typeof value !== 'object') return String(value);
  if (seen.has(value)) return '[CIRCULAR]';
  seen.add(value);
  if (Array.isArray(value)) {
    const out = value.map(v => sanitize(v, seen));
    seen.delete(value);
    return out;
  }
  const out = {};
  for (const [key, child] of Object.entries(value)) out[key] = SECRET_KEYS.test(key) ? '[REDACTED]' : sanitize(child, seen);
  seen.delete(value);
  return out;
}

function ok(body, statusCode = 200) { return { statusCode, body: sanitize(body) }; }
function error(statusCode, code, message, details) {
  const body = { status: 'FAILED', error: { code, message: redactText(message) } };
  if (details !== undefined) body.error.details = sanitize(details);
  return { statusCode, body };
}

function runtimeFailure(err) {
  const code = err && err.code;
  if (code === 'ENVIRONMENT_NOT_AVAILABLE' || code === 'CREDENTIALS_UNAVAILABLE' || code === 'MODEL_NOT_AVAILABLE')
    return error(503, code, 'ASTRA runtime is not available');
  return error(500, 'RUNTIME_FAILED', 'ASTRA runtime failed');
}

module.exports = { sanitize, redactText, ok, error, runtimeFailure };
