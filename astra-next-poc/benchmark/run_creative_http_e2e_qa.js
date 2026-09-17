'use strict';

const BASE = `http://127.0.0.1:${process.env.SERVER_PORT || 3001}`;
const KEY = process.env.ASTRA_NEXT_GATEWAY_KEY || '';

async function main() {
  if (!KEY) throw new Error('ASTRA_NEXT_GATEWAY_KEY_missing');
  const request = 'Diseña un anuncio visual 4:5 para Meta Ads de una estética. Objetivo: llenar agenda por WhatsApp. Usa poco texto, un hook dominante y un CTA simple. No inventes resultados, descuentos ni testimonios.';
  const started = Date.now();
  const r = await fetch(`${BASE}/astra-next/creative`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-astra-next-gateway-key': KEY,
    },
    body: JSON.stringify({ message: request }),
  });
  const j = await r.json().catch(() => ({}));
  const durationMs = Date.now() - started;
  const grounding = j.grounding || {};
  const families = Array.isArray(grounding.families) ? grounding.families : [];
  const evidenceCount = Number(grounding.evidence_count || 0);
  const response = typeof j.response === 'string' ? j.response.trim() : '';
  const failures = [];

  if (r.status !== 200) failures.push(`HTTP:${r.status}`);
  if (j.status !== 'PASS') failures.push(`STATUS:${j.status || 'missing'}`);
  if (!response) failures.push('EMPTY_RESPONSE');
  if (evidenceCount < 1 || evidenceCount > 12) failures.push(`EVIDENCE_COUNT:${evidenceCount}`);
  for (const family of ['formal_design','advertising','meta_current']) {
    if (!families.includes(family)) failures.push(`MISSING_FAMILY:${family}`);
  }
  if (grounding.policy !== 'NO_CREATIVE_WITHOUT_EVIDENCE') failures.push('POLICY_MISSING');
  if (!Array.isArray(grounding.evidence_ids) || grounding.evidence_ids.length !== evidenceCount) failures.push('EVIDENCE_IDS_MISMATCH');
  if (!Array.isArray(grounding.sources) || grounding.sources.length < 2) failures.push('INSUFFICIENT_SOURCES');

  const pass = failures.length === 0;
  console.log(`[ASTRA_NEXT_12_CREATIVE_HTTP_E2E] status=${pass ? 'PASS' : 'FAIL'} http=${r.status} gateway_status=${JSON.stringify(j.status || null)} duration_ms=${durationMs} response_chars=${response.length} evidence=${evidenceCount}/12 families=${JSON.stringify(families)} sources=${Array.isArray(grounding.sources) ? grounding.sources.length : 0} failures=${JSON.stringify(failures)} llm_calls=1`);
  if (!pass) {
    console.log(`[ASTRA_NEXT_12_CREATIVE_HTTP_E2E_ERROR] ${JSON.stringify({status:j.status || null,error:j.error || null,upstream_status:j.upstream_status || null})}`);
    process.exitCode = 1;
    return;
  }

  // Persist only a digest-sized evidence sample in logs; never log credentials.
  const preview = response.replace(/\s+/g, ' ').slice(0, 400);
  console.log(`[ASTRA_NEXT_12_RESPONSE_PREVIEW] ${JSON.stringify(preview)}`);
}

main().catch(error => {
  console.log(`[ASTRA_NEXT_12_CREATIVE_HTTP_E2E] status=FAIL fatal=${JSON.stringify(String(error.message || error))} llm_calls=0`);
  process.exitCode = 1;
});
