'use strict';

const fs = require('fs');
const router = require(process.env.ASTRA_NEXT_CREATIVE_ROUTER || '/opt/astra-next-creative/creative_knowledge_router.js');

const KB_URL = process.env.ASTRA_NEXT_KB_URL || '';
const KB_KEY = process.env.ASTRA_NEXT_KB_API_KEY || '';
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';
const ANDROMEDA_PATH = process.env.ASTRA_NEXT_ANDROMEDA_SOURCE || '/opt/astra-next-creative/META_ANDROMEDA_VERIFIED_2026.md';
const BASE = 'http://127.0.0.1:3001';
const REQUEST = 'Hazme un anuncio visual de Meta Ads formato 4:5 para una estética. Objetivo: llenar agenda por WhatsApp. Usa poco texto, un hook dominante y un CTA simple. No inventes resultados, descuentos ni testimonios.';

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
function sourceOf(e={}){ return e.source_file || e.source_pdf_name || e.sourceDocument || null; }

async function waitApi(){
  for(let i=0;i<120;i++){
    try{ const r=await fetch(`${BASE}/api/ping`); if(r.ok) return true; }catch{}
    await sleep(1000);
  }
  throw new Error('anythingllm_api_not_ready');
}

async function retrieve(family, query, topK){
  const r=await fetch(KB_URL,{method:'POST',headers:{'Content-Type':'application/json','x-astra-next-key':KB_KEY},body:JSON.stringify({family,query,top_k:topK})});
  const j=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(`kb_${family}_${r.status}:${j.error||'unknown'}`);
  return Array.isArray(j.results)?j.results:[];
}

function localAndromeda(){
  if(!fs.existsSync(ANDROMEDA_PATH)) throw new Error('andromeda_source_missing');
  return [{evidence_id:'LOCAL:META_ANDROMEDA_VERIFIED_2026',family:'andromeda_local',source_file:'META_ANDROMEDA_VERIFIED_2026.md',excerpt:fs.readFileSync(ANDROMEDA_PATH,'utf8').slice(0,1600),match_type:'local_versioned_source'}];
}

async function buildEvidence(){
  const plan=router.buildPlan(REQUEST);
  const localCount=plan.queries.filter(q=>q.family==='andromeda_local').length;
  const remote=plan.queries.filter(q=>q.family!=='andromeda_local');
  const remaining=Math.max(0,plan.max_total_evidence_chunks-localCount);
  const perRemote=remote.length?Math.max(1,Math.floor(remaining/remote.length)):0;
  const evidence=[];
  for(const q of plan.queries){
    if(q.family==='andromeda_local'){ evidence.push(...localAndromeda()); continue; }
    evidence.push(...await retrieve(q.family,q.query,Math.min(4,perRemote||1)));
  }
  const bounded=evidence.slice(0,plan.max_total_evidence_chunks);
  const verdict=router.validateEvidence(REQUEST,bounded);
  if(!verdict.ready) throw new Error(`evidence_gate_blocked:${verdict.violations.join(',')}`);
  if(bounded.length>12) throw new Error(`evidence_budget_exceeded:${bounded.length}`);
  return {plan,evidence:bounded,verdict};
}

async function localAuth(){
  if(!AUTH_TOKEN) throw new Error('AUTH_TOKEN_missing');
  const r=await fetch(`${BASE}/api/request-token`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:AUTH_TOKEN})});
  const j=await r.json();
  if(!r.ok||!j.valid||!j.token) throw new Error('local_auth_failed');
  return j.token;
}

async function devApiKey(token){
  const h={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
  let r=await fetch(`${BASE}/api/system/api-keys`,{headers:h});
  let j=await r.json().catch(()=>({}));
  let found=(j.apiKeys||[]).find(k=>k.name==='astra-next-09');
  if(found?.secret) return found.secret;
  r=await fetch(`${BASE}/api/system/generate-api-key`,{method:'POST',headers:h,body:JSON.stringify({name:'astra-next-09'})});
  j=await r.json().catch(()=>({}));
  if(!r.ok||!j.apiKey?.secret) throw new Error('developer_api_key_unavailable');
  return j.apiKey.secret;
}

function buildPrompt(evidence){
  const compact=evidence.map((e,i)=>({
    evidence_id:e.evidence_id||`E${i+1}`,
    source:sourceOf(e),
    family:e.family||null,
    excerpt:String(e.excerpt||e.content||'').slice(0,1100)
  }));
  return `You are ASTRA NEXT Creative Director. Produce ONE grounded creative direction in Spanish (Mexico) for the user request below.\n\nUSER REQUEST:\n${REQUEST}\n\nEVIDENCE PACK (the only external knowledge you may treat as evidence):\n${JSON.stringify(compact)}\n\nSTRICT RULES:\n- Do not invent business facts, performance numbers, testimonials, discounts, guarantees, or campaign results.\n- Every material design/copy/platform decision must appear in decisions[] and cite one or more evidence_ids from the supplied pack.\n- If a choice is creative judgment rather than directly supported, classification must be INFERENCE, not EVIDENCE.\n- sources_used must contain only source names present in the supplied evidence pack.\n- Preserve format 4:5, WhatsApp objective, little text, dominant hook, simple CTA.\n- Separate headline from visual so they complement rather than repeat each other.\n- Return valid JSON only.\n\nREQUIRED JSON SHAPE:\n{\n  "creative_brief":{"format":"4:5","objective":"...","conversion":"WhatsApp","constraints":[]},\n  "concept":{"name":"...","single_idea":"...","visual_mechanism":"..."},\n  "art_direction":{"composition":"...","visual_hierarchy":"...","negative_space":"...","typography":"...","color_contrast":"...","hero_image":"..."},\n  "copy":{"hook":"...","supporting_line":"...","cta":"...","headline_image_relationship":"..."},\n  "decisions":[{"decision":"...","classification":"EVIDENCE|INFERENCE","evidence_ids":["..."]}],\n  "sources_used":["..."],\n  "unsupported_claims":[]\n}`;
}

function stripJson(text=''){
  return String(text).replace(/^\s*<think>[\s\S]*?<\/think>\s*/i,'').replace(/^```json\s*/i,'').replace(/\s*```\s*$/,'').trim();
}

function adjudicate(out,evidence){
  const violations=[];
  const required=['creative_brief','concept','art_direction','copy','decisions','sources_used','unsupported_claims'];
  for(const k of required) if(!(k in out)) violations.push(`MISSING_${k.toUpperCase()}`);
  const allowedSources=new Set(evidence.map(sourceOf).filter(Boolean));
  const allowedIds=new Set(evidence.map((e,i)=>e.evidence_id||`E${i+1}`));
  if(Array.isArray(out.sources_used)) for(const s of out.sources_used) if(!allowedSources.has(s)) violations.push(`UNRESOLVED_SOURCE:${s}`);
  else violations.push('SOURCES_USED_NOT_ARRAY');
  if(!Array.isArray(out.decisions)||out.decisions.length<4) violations.push('INSUFFICIENT_DECISIONS');
  else for(const [i,d] of out.decisions.entries()){
    if(!['EVIDENCE','INFERENCE'].includes(d.classification)) violations.push(`BAD_CLASSIFICATION:${i}`);
    if(!Array.isArray(d.evidence_ids)) violations.push(`BAD_EVIDENCE_IDS:${i}`);
    else for(const id of d.evidence_ids) if(!allowedIds.has(id)) violations.push(`UNRESOLVED_EVIDENCE_ID:${id}`);
    if(d.classification==='EVIDENCE'&&(!d.evidence_ids||d.evidence_ids.length===0)) violations.push(`EVIDENCE_WITHOUT_SOURCE:${i}`);
  }
  if(Array.isArray(out.unsupported_claims)&&out.unsupported_claims.length>0) violations.push('UNSUPPORTED_CLAIMS_PRESENT');
  const raw=JSON.stringify(out).toLowerCase();
  const prohibited=[/\b\d+%\b/,/garantiz/,/testimonio/,/descuento/,/resultados? asegurados?/];
  if(prohibited.some(r=>r.test(raw))) violations.push('POTENTIAL_UNSUPPORTED_PERFORMANCE_OR_PROOF_CLAIM');
  if(out.creative_brief?.format!=='4:5') violations.push('FORMAT_DRIFT');
  if(!/whatsapp/i.test(String(out.creative_brief?.conversion||''))) violations.push('CONVERSION_DRIFT');
  return {status:violations.length?'FAIL':'PASS',violations};
}

async function main(){
  if(!KB_URL||!KB_KEY) throw new Error('knowledge_bridge_not_configured');
  const {evidence}=await buildEvidence();
  console.log(`[ASTRA_NEXT_09] evidence_gate=PASS evidence=${evidence.length}/12 sources=${JSON.stringify([...new Set(evidence.map(sourceOf).filter(Boolean))])}`);
  await waitApi();
  const token=await localAuth();
  const apiKey=await devApiKey(token);
  const prompt=buildPrompt(evidence);
  const body={message:prompt,mode:'chat',sessionId:'astra-next-09-grounded-creative-v1',attachments:[],reset:true};
  const start=Date.now();
  const r=await fetch(`${BASE}/api/v1/workspace/astra-next/chat`,{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const j=await r.json().catch(()=>({}));
  const duration=Date.now()-start;
  const cleaned=stripJson(j.textResponse||'');
  let parsed=null; try{parsed=JSON.parse(cleaned);}catch{}
  if(!r.ok||!parsed){
    console.log(`[ASTRA_NEXT_09] generation=FAIL http=${r.status} json_valid=${!!parsed} duration_ms=${duration} error=${JSON.stringify(j.error||null)}`);
    process.exitCode=1; return;
  }
  const adjudication=adjudicate(parsed,evidence);
  console.log(`[ASTRA_NEXT_09] generation=PASS http=${r.status} json_valid=true duration_ms=${duration} decisions=${Array.isArray(parsed.decisions)?parsed.decisions.length:0} sources_used=${JSON.stringify(parsed.sources_used||[])}`);
  console.log(`[ASTRA_NEXT_09] adjudication=${adjudication.status} violations=${JSON.stringify(adjudication.violations)}`);
  const b64=Buffer.from(JSON.stringify(parsed),'utf8').toString('base64');
  const size=2800,n=Math.max(1,Math.ceil(b64.length/size));
  for(let i=0;i<n;i++) console.log(`[ASTRA_NEXT_09_RESULT_B64 ${i+1}/${n}] ${b64.slice(i*size,(i+1)*size)}`);
  console.log(`[ASTRA_NEXT_09_GROUNDED_CREATIVE_OUTPUT_QA] status=${adjudication.status} llm_calls=1 evidence=${evidence.length}/12`);
  if(adjudication.status!=='PASS') process.exitCode=1;
}

main().catch(e=>{console.log(`[ASTRA_NEXT_09_GROUNDED_CREATIVE_OUTPUT_QA] status=FAIL fatal=${JSON.stringify(String(e.message||e).slice(0,300))}`);process.exitCode=1;});
