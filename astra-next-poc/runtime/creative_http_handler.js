'use strict';

const crypto = require('crypto');
const gateway = require('./creative_gateway.js');

let cachedDeveloperKey = null;

function secureEqual(a = '', b = '') {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (aa.length !== bb.length || aa.length === 0) return false;
  return crypto.timingSafeEqual(aa, bb);
}

function baseUrl() {
  return `http://127.0.0.1:${process.env.SERVER_PORT || 3001}`;
}

async function localSessionToken() {
  const authToken = process.env.AUTH_TOKEN || '';
  if (!authToken) throw new Error('AUTH_TOKEN_MISSING');
  const r = await fetch(`${baseUrl()}/api/request-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: authToken }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.valid || !j.token) throw new Error('LOCAL_AUTH_FAILED');
  return j.token;
}

async function developerApiKey() {
  if (cachedDeveloperKey) return cachedDeveloperKey;
  const token = await localSessionToken();
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  let r = await fetch(`${baseUrl()}/api/system/api-keys`, { headers });
  let j = await r.json().catch(() => ({}));
  const found = (j.apiKeys || []).find(k => k.name === 'astra-next-creative-gateway');
  if (found?.secret) {
    cachedDeveloperKey = found.secret;
    return cachedDeveloperKey;
  }
  r = await fetch(`${baseUrl()}/api/system/generate-api-key`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: 'astra-next-creative-gateway' }),
  });
  j = await r.json().catch(() => ({}));
  if (!r.ok || !j.apiKey?.secret) throw new Error('DEVELOPER_API_KEY_UNAVAILABLE');
  cachedDeveloperKey = j.apiKey.secret;
  return cachedDeveloperKey;
}

async function handleCreativeGateway(req, res) {
  const expectedKey = process.env.ASTRA_NEXT_GATEWAY_KEY || '';
  const suppliedKey = req.get('x-astra-next-gateway-key') || '';
  if (!secureEqual(expectedKey, suppliedKey)) {
    return res.status(401).json({ status: 'UNAUTHORIZED' });
  }

  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  if (!message) return res.status(422).json({ status: 'INVALID_REQUEST', error: 'message_required' });

  try {
    const prepared = await gateway.prepareCreativeRequest(message);

    if (prepared.status === 'BYPASS_NON_CREATIVE') {
      return res.status(422).json({
        status: 'NOT_CREATIVE_REQUEST',
        intent: prepared.plan.intent,
      });
    }

    if (prepared.status !== 'READY_WITH_EVIDENCE') {
      return res.status(409).json({
        status: prepared.status,
        violations: prepared.evidence_verdict?.violations || [],
        evidence_count: prepared.evidence?.length || 0,
      });
    }

    const grounding = {
      policy: 'NO_CREATIVE_WITHOUT_EVIDENCE',
      evidence_count: prepared.evidence.length,
      evidence_ids: prepared.evidence_pack.map(e => e.evidence_id),
      sources: [...new Set(prepared.evidence_pack.map(e => e.source).filter(Boolean))],
      families: [...new Set(prepared.evidence_pack.map(e => e.family).filter(Boolean))],
    };

    if (req.body?.dry_run === true) {
      return res.status(200).json({ status: 'READY_WITH_EVIDENCE', dry_run: true, grounding });
    }

    const instruction = gateway.buildGroundedCreativeInstruction(prepared);
    const apiKey = await developerApiKey();
    const sessionId = `astra-next-creative-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const r = await fetch(`${baseUrl()}/api/v1/workspace/astra-next/chat`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: instruction,
        mode: 'chat',
        sessionId,
        attachments: [],
        reset: true,
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || typeof j.textResponse !== 'string' || !j.textResponse.trim()) {
      return res.status(502).json({
        status: 'GENERATION_FAILED',
        upstream_status: r.status,
        grounding,
      });
    }

    return res.status(200).json({
      status: 'PASS',
      response: j.textResponse,
      grounding,
    });
  } catch (error) {
    console.error('[ASTRA_NEXT_CREATIVE_GATEWAY] error', String(error?.message || error));
    return res.status(500).json({ status: 'ERROR', error: String(error?.message || error).slice(0, 160) });
  }
}

module.exports = { handleCreativeGateway };
