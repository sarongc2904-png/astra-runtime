'use strict';
const crypto = require('crypto');

function bearer(headers = {}) {
  const raw = headers.authorization || headers.Authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(String(raw));
  return match ? match[1] : '';
}

function constantEqual(a, b) {
  const aa = Buffer.from(String(a || ''), 'utf8');
  const bb = Buffer.from(String(b || ''), 'utf8');
  const width = Math.max(aa.length, bb.length, 1);
  const ap = Buffer.alloc(width); const bp = Buffer.alloc(width);
  aa.copy(ap); bb.copy(bp);
  return crypto.timingSafeEqual(ap, bp) && aa.length === bb.length && aa.length > 0;
}

function authenticate(headers = {}, env = process.env) {
  const configured = String(env.ASTRA_RUNTIME_API_KEY || '');
  const supplied = bearer(headers);
  return Boolean(configured && supplied && constantEqual(supplied, configured));
}

module.exports = { authenticate, bearer, constantEqual };
