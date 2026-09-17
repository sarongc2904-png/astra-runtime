'use strict';

const fs = require('fs');
const router = require(process.env.ASTRA_NEXT_CREATIVE_ROUTER || '/opt/astra-next-creative/creative_knowledge_router.js');

const KB_URL = process.env.ASTRA_NEXT_KB_URL || '';
const KB_KEY = process.env.ASTRA_NEXT_KB_API_KEY || '';
const ANDROMEDA_PATH = process.env.ASTRA_NEXT_ANDROMEDA_SOURCE || '/opt/astra-next-creative/META_ANDROMEDA_VERIFIED_2026.md';

const cases = [
  { id:'KR-01', input:'Diseña una pieza minimalista para una clínica dental.', expectReady:true },
  { id:'KR-02', input:'Hazme un anuncio de Meta Ads para una estética.', expectReady:true },
  { id:'KR-03', input:'Escribe 5 headlines para un anuncio de implantes dentales.', expectReady:true, expectCopyOnly:true },
  { id:'KR-04', input:'Dame composición, jerarquía, tipografía y espacio negativo para este creativo.', expectReady:true },
  { id:'KR-05', input:'Haz el creativo basado en Meta Andromeda.', expectReady:true },
];

function uniqueSources(evidence) {
  return [...new Set(evidence.map(e => e.source_file || e.source_pdf_name || e.sourceDocument).filter(Boolean))];
}

async function retrieve(family, query, topK) {
  const res = await fetch(KB_URL, {
    method:'POST',
    headers:{'Content-Type':'application/json','x-astra-next-key':KB_KEY},
    body:JSON.stringify({family, query, top_k:topK}),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`bridge_${family}_http_${res.status}:${body.error || 'unknown'}`);
  return Array.isArray(body.results) ? body.results : [];
}

function localAndromedaEvidence() {
  if (!fs.existsSync(ANDROMEDA_PATH)) throw new Error('andromeda_source_missing');
  const text = fs.readFileSync(ANDROMEDA_PATH, 'utf8');
  return [{
    evidence_id:'LOCAL:META_ANDROMEDA_VERIFIED_2026',
    family:'andromeda_local',
    source_file:'META_ANDROMEDA_VERIFIED_2026.md',
    topic:'Verified Meta Andromeda facts and bounded recommendations',
    excerpt:text.slice(0,1600),
    match_type:'local_versioned_source',
  }];
}

async function runCase(test) {
  const plan = router.buildPlan(test.input);
  const evidence = [];
  const remote = plan.queries.filter(q => q.family !== 'andromeda_local');
  const remoteTopK = remote.length ? Math.max(2, Math.floor(plan.max_total_evidence_chunks / remote.length)) : 0;

  for (const q of plan.queries) {
    if (q.family === 'andromeda_local') {
      evidence.push(...localAndromedaEvidence());
      continue;
    }
    evidence.push(...await retrieve(q.family, q.query, Math.min(4, remoteTopK || 4)));
  }

  const verdict = router.validateEvidence(test.input, evidence);
  const sources = uniqueSources(evidence);
  let pass = verdict.ready === test.expectReady;
  if (test.expectCopyOnly) pass = pass && plan.intent.copyOnly === true && plan.intent.wantsVisual === false;

  const out = {
    case:test.id,
    status:pass?'PASS':'FAIL',
    ready:verdict.ready,
    intent:plan.intent,
    evidence_count:evidence.length,
    sources,
    source_counts:verdict.source_counts,
    violations:verdict.violations,
  };
  console.log(`[ASTRA_NEXT_KR] case=${out.case} status=${out.status} ready=${out.ready} evidence=${out.evidence_count} sources=${JSON.stringify(out.sources)} counts=${JSON.stringify(out.source_counts)} violations=${JSON.stringify(out.violations)}`);
  return out;
}

async function main() {
  if (!KB_URL || !KB_KEY) {
    console.log('[ASTRA_NEXT_KR] status=FAIL reason=knowledge_bridge_not_configured');
    process.exitCode=2;
    return;
  }

  const results=[];
  for (const test of cases) {
    try { results.push(await runCase(test)); }
    catch (error) {
      const out={case:test.id,status:'FAIL',error:String(error.message || error).slice(0,240)};
      results.push(out);
      console.log(`[ASTRA_NEXT_KR] case=${test.id} status=FAIL error=${JSON.stringify(out.error)}`);
    }
  }

  // KR-06: no retrieval means fail closed. This is deliberate and must PASS as a safety test.
  const kr06Input='Hazme un anuncio de Meta Ads para una estética.';
  const kr06Verdict=router.validateEvidence(kr06Input, []);
  const kr06Pass=kr06Verdict.ready===false && kr06Verdict.violations.length>0;
  const kr06={case:'KR-06',status:kr06Pass?'PASS':'FAIL',ready:kr06Verdict.ready,violations:kr06Verdict.violations};
  results.push(kr06);
  console.log(`[ASTRA_NEXT_KR] case=KR-06 status=${kr06.status} ready=${kr06.ready} retrieval_disabled=true violations=${JSON.stringify(kr06.violations)}`);

  const passed=results.filter(r=>r.status==='PASS').length;
  const failed=results.length-passed;
  console.log(`[ASTRA_NEXT_08_KNOWLEDGE_ROUTING] status=${failed===0?'PASS':'FAIL'} passed=${passed} failed=${failed} total=${results.length} llm_calls=0`);
  if (failed) process.exitCode=1;
}

main().catch(error=>{
  console.log(`[ASTRA_NEXT_08_KNOWLEDGE_ROUTING] status=FAIL fatal=${JSON.stringify(String(error.message || error).slice(0,240))}`);
  process.exitCode=1;
});
