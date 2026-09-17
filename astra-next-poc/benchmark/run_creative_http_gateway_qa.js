'use strict';

const BASE = `http://127.0.0.1:${process.env.SERVER_PORT || 3001}`;
const KEY = process.env.ASTRA_NEXT_GATEWAY_KEY || '';

async function post(body, key = KEY) {
  const headers = { 'Content-Type': 'application/json' };
  if (key) headers['x-astra-next-gateway-key'] = key;
  const r = await fetch(`${BASE}/astra-next/creative`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, body: j };
}

function emit(id, pass, detail = {}) {
  console.log(`[ASTRA_NEXT_11 ${id}] status=${pass ? 'PASS' : 'FAIL'} ${Object.entries(detail).map(([k,v]) => `${k}=${JSON.stringify(v)}`).join(' ')}`);
  return pass;
}

async function main() {
  if (!KEY) throw new Error('ASTRA_NEXT_GATEWAY_KEY_missing');
  let failed = 0;

  const unauthorized = await post({ message: 'Diseña un anuncio visual para Meta Ads.', dry_run: true }, 'wrong-key');
  if (!emit('HG-01', unauthorized.status === 401 && unauthorized.body.status === 'UNAUTHORIZED', {
    http: unauthorized.status,
    gateway_status: unauthorized.body.status || null,
  })) failed++;

  const creative = await post({
    message: 'Diseña un anuncio visual 4:5 para Meta Ads de una estética con CTA a WhatsApp.',
    dry_run: true,
  });
  const families = creative.body?.grounding?.families || [];
  const creativePass = creative.status === 200 &&
    creative.body.status === 'READY_WITH_EVIDENCE' &&
    creative.body.dry_run === true &&
    Number(creative.body?.grounding?.evidence_count || 0) > 0 &&
    Number(creative.body?.grounding?.evidence_count || 0) <= 12 &&
    ['formal_design','advertising','meta_current'].every(f => families.includes(f));
  if (!emit('HG-02', creativePass, {
    http: creative.status,
    gateway_status: creative.body.status || null,
    evidence: creative.body?.grounding?.evidence_count || 0,
    families,
  })) failed++;

  const nonCreative = await post({ message: 'Explícame qué significa CAC.', dry_run: true });
  if (!emit('HG-03', nonCreative.status === 422 && nonCreative.body.status === 'NOT_CREATIVE_REQUEST', {
    http: nonCreative.status,
    gateway_status: nonCreative.body.status || null,
  })) failed++;

  console.log(`[ASTRA_NEXT_11_CREATIVE_HTTP_GATEWAY] status=${failed === 0 ? 'PASS' : 'FAIL'} passed=${3-failed}/3 failed=${failed} llm_calls=0`);
  if (failed) process.exitCode = 1;
}

main().catch(error => {
  console.log(`[ASTRA_NEXT_11_CREATIVE_HTTP_GATEWAY] status=FAIL fatal=${JSON.stringify(String(error.message || error))}`);
  process.exitCode = 1;
});
