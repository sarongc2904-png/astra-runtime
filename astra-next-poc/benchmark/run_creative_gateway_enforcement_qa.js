'use strict';

const path = require('path');
const gateway = require('../runtime/creative_gateway.js');

const kbUrl = process.env.ASTRA_NEXT_KB_URL || '';
const kbKey = process.env.ASTRA_NEXT_KB_API_KEY || '';
const andromedaPath = process.env.ASTRA_NEXT_ANDROMEDA_SOURCE || path.join(__dirname, '..', 'knowledge', 'META_ANDROMEDA_VERIFIED_2026.md');

const cases = [
  {
    id: 'KG-01',
    input: 'Diseña un anuncio visual 4:5 para Meta Ads de una estética con CTA a WhatsApp.',
    expect: 'READY_WITH_EVIDENCE',
    requiredFamilies: ['formal_design', 'advertising', 'meta_current'],
  },
  {
    id: 'KG-02',
    input: 'Escribe 5 headlines para un anuncio de una estética.',
    expect: 'READY_WITH_EVIDENCE',
    requiredFamilies: ['advertising'],
    forbiddenFamilies: ['formal_design'],
  },
  {
    id: 'KG-03',
    input: 'Crea la dirección creativa de un anuncio de Meta Ads considerando Andromeda.',
    expect: 'READY_WITH_EVIDENCE',
    requiredFamilies: ['formal_design', 'advertising', 'meta_current', 'andromeda_local'],
  },
  {
    id: 'KG-04',
    input: 'Explícame qué significa CAC.',
    expect: 'BYPASS_NON_CREATIVE',
    requiredFamilies: [],
  },
];

async function runCase(test) {
  const result = await gateway.prepareCreativeRequest(test.input, { kbUrl, kbKey, andromedaPath });
  const families = new Set((result.evidence || []).map(e => e.family).filter(Boolean));
  const failures = [];
  if (result.status !== test.expect) failures.push(`STATUS:${result.status}`);
  for (const family of test.requiredFamilies || []) if (!families.has(family)) failures.push(`MISSING_FAMILY:${family}`);
  for (const family of test.forbiddenFamilies || []) if (families.has(family)) failures.push(`UNEXPECTED_FAMILY:${family}`);
  if ((result.evidence || []).length > 12) failures.push(`EVIDENCE_BUDGET:${result.evidence.length}`);
  if (result.status === 'READY_WITH_EVIDENCE') {
    try {
      const instruction = gateway.buildGroundedCreativeInstruction(result);
      if (!instruction.includes('EVIDENCE PACK:')) failures.push('INSTRUCTION_MISSING_EVIDENCE_PACK');
    } catch (error) {
      failures.push(`INSTRUCTION_BLOCKED:${error.message}`);
    }
  }
  return { test, result, families: [...families], failures };
}

async function main() {
  if (!kbUrl || !kbKey) throw new Error('knowledge_bridge_not_configured');
  let failed = 0;
  for (const test of cases) {
    const r = await runCase(test);
    if (r.failures.length) failed++;
    console.log(`[ASTRA_NEXT_10 ${test.id}] status=${r.failures.length ? 'FAIL' : 'PASS'} gateway_status=${r.result.status} evidence=${(r.result.evidence || []).length}/12 families=${JSON.stringify(r.families)} failures=${JSON.stringify(r.failures)}`);
  }

  const blocked = await gateway.prepareCreativeRequest(
    'Diseña un anuncio visual para Meta Ads.',
    { kbUrl: '', kbKey: '', andromedaPath }
  );
  const failClosedPass = blocked.status === 'BLOCKED_KNOWLEDGE_UNAVAILABLE';
  if (!failClosedPass) failed++;
  console.log(`[ASTRA_NEXT_10 KG-05] status=${failClosedPass ? 'PASS' : 'FAIL'} gateway_status=${blocked.status} expected=BLOCKED_KNOWLEDGE_UNAVAILABLE`);

  console.log(`[ASTRA_NEXT_10_CREATIVE_KNOWLEDGE_ENFORCEMENT] status=${failed === 0 ? 'PASS' : 'FAIL'} passed=${5 - failed}/5 failed=${failed} llm_calls=0`);
  if (failed) process.exitCode = 1;
}

main().catch(error => {
  console.log(`[ASTRA_NEXT_10_CREATIVE_KNOWLEDGE_ENFORCEMENT] status=FAIL fatal=${JSON.stringify(String(error.message || error))}`);
  process.exitCode = 1;
});
