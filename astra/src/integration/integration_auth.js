'use strict';
const crypto = require('crypto');

function split(value) { return String(value || '').split(',').map(x => x.trim()).filter(Boolean); }
function constantEqual(a, b) {
  const aa = Buffer.from(String(a || '')); const bb = Buffer.from(String(b || ''));
  return aa.length === bb.length && aa.length > 0 && crypto.timingSafeEqual(aa, bb);
}
function bearer(headers = {}) {
  const raw = headers.authorization || headers.Authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(raw);
  return match ? match[1] : '';
}
function authenticate(headers, env = process.env) {
  const supplied = bearer(headers);
  const accepted = split(env.ASTRA_GPT_API_KEYS || env.KB_API_KEY);
  if (!supplied || !accepted.length || !accepted.some(key => constantEqual(supplied, key)))
    return { ok: false, statusCode: 401, code: 'UNAUTHORIZED' };
  return { ok: true, requesterId: headers['x-requester-id'] || headers['X-Requester-Id'] || 'gpt-action' };
}
async function authorizeProject(projectId, identity, options = {}, env = process.env) {
  if (!projectId) return { ok: true };
  if (typeof options.projectAuthorizer === 'function') {
    const allowed = await options.projectAuthorizer(projectId, identity);
    return allowed ? { ok: true } : { ok: false, statusCode: 403, code: 'FORBIDDEN' };
  }
  const allowedIds = split(env.ASTRA_ALLOWED_PROJECT_IDS);
  return allowedIds.includes(projectId) ? { ok: true } : { ok: false, statusCode: 403, code: 'FORBIDDEN' };
}
module.exports = { authenticate, authorizeProject, bearer, constantEqual };
