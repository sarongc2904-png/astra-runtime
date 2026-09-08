"""ASTRA-03C evidence remap. Read-only retrieval; only registry.json is updated."""
import collections, datetime as dt, hashlib, json, shutil, sys
from pathlib import Path
import numpy as np

BASE=Path(__file__).resolve().parents[2]; OUT=BASE/'astra'/'method_remap'; REG=BASE/'astra'/'methods'/'registry.json'
sys.path.insert(0,str(BASE)); import retrieval_strategy_f as sf
AUTH='HUMAN_AUTHORIZATION_ASTRA_03C_METHOD_REMAP_AND_METADATA_ADJUDICATION_2026-09-06'
def now(): return dt.datetime.now(dt.timezone.utc).isoformat()
def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def write(n,o): (OUT/n).write_text(json.dumps(o,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

PROTECTED=['knowledge.js','classifier_decision_cache.js','retrieval_strategy_f.py','rag_retrieval_refinement/recommended_pipeline.json','rag_retrieval_refinement/corpus_snapshot.json','rag_retrieval_qa/benchmark.json','rag_retrieval_qa/benchmark_ground_truth.json','e2e_benchmark_evidence_rebuild/rebuilt_evidence.json','rag_answer_policy_runtime.js','config.json','evaluator_reselection/selected_evaluator.json']

QUERIES=[
('Q01','Velocity Funnels: pilares, etapas y selección del funnel','Velocity Funnels','SRC_VEL_FUNNELS'),
('Q02','proceso multietapa y modelo económico de un funnel de ventas','Funnel framework','SRC_VEL_FUNNELS'),
('Q03','Venta Elegante: estrategia, táctica y guion de conversación de ventas','Sales conversion','SRC_VEL_SALES'),
('Q04','manejo de contexto y estructura de un guion de ventas','Sales conversion','SRC_VEL_SALES'),
('Q05','MIDAS: creación de demanda, estrategia de precios, modelo de negocio y LTV','MIDAS framework','SRC_VEL_MIDAS'),
('Q06','estrategia de precios y activos intangibles en MIDAS','MIDAS framework','SRC_VEL_MIDAS'),
('Q07','negocio de infoproductos de la A a la Z: audiencia propuesta lanzamiento crecimiento','Infoproduct framework','SRC_VEL_INFO_AZ'),
('Q08','cómo lanzar y hacer crecer un negocio de infoproductos','Infoproduct framework','SRC_VEL_INFO_AZ'),
('Q09','propuesta irresistible: elementos, valor, conversión y oferta','Offer design','SRC_VEL_OFFER'),
('Q10','propuesta en fase imán y fase de venta de un funnel','Offer design','SRC_VEL_FUNNELS'),
('Q11','CRO: investigación experimentación test ejecución y priorización','CRO framework','SRC_PRO_CRO'),
('Q12','psicología del consumidor y oportunidades de optimización CRO','CRO framework','SRC_PRO_CRO'),
('Q13','Growth Marketing: mercado posicionamiento loops crecimiento ICE score','Growth marketing','SRC_PRO_GROWTH'),
('Q14','cliente en el mercado métrica principal y oportunidades de crecimiento','Growth/ICP','SRC_PRO_GROWTH'),
('Q15','creative strategy concept idea campaign execution advertising','Creative Strategy','LEGACY'),
('Q16','single-minded proposition one clear benefit advertising','SMP','LEGACY'),
('Q17','tagline craft functions development advertising','Tagline Craft','LEGACY'),
('Q18','copywriting tone of voice headlines body copy advertising','Copywriting/Tone','LEGACY'),
('Q19','visual ideas visual metaphor visual pun advertising','Visual Ideas','LEGACY'),
('Q20','ambient advertising forms site-specific media guerrilla distinction','Ambient Advertising','LEGACY'),
('Q21','advertising execution craft turn concept into campaign executions','Execution Craft','LEGACY'),
('Q22','target audience definition buyer pains avatar selection','Target Audience / ICP','SRC_VEL_FUNNELS'),
('Q23','Meta Ads Ads Manager campaign configuration targeting optimization','Unsupported Meta Ads',None),
('Q24','WhatsApp sales follow-up objection handling closing process','Unsupported WhatsApp',None),
('Q25','course curriculum learning objectives lesson sequence pedagogy','Unsupported Course Creation',None),
]

NEW_SPECS={
'METHOD_SALES_ACCELERATION':dict(name='Venta Elegante Sales Conversion',source='Velocity — La Venta Elegante',stype='COURSE',domain='SALES',sub='sales conversation and conversion',jobs=['structure and conduct a sales conversation','build a sales script'],inputs=['sales context','buyer situation','offer'],outputs=['sales conversation structure','sales script'],best=['consultative sales conversion'],strengths=['connects sales mindset, context, strategy and tactics'],q=['Q03','Q04']),
'METHOD_DIGITAL_MARKETING':dict(name='Growth Marketing',source='Protégé — Growth Marketing',stype='COURSE',domain='ADS',sub='growth strategy excluding platform-specific ads operations',jobs=['identify and prioritize growth opportunities','connect market positioning with growth economics'],inputs=['market','customer','value metric','economic model'],outputs=['growth opportunity map','prioritized experiments'],best=['cross-channel growth planning'],strengths=['links market, customer, economics, loops and prioritization'],q=['Q13','Q14']),
'METHOD_OFFER_DESIGN':dict(name='Propuesta Irresistible',source='Velocity — Taller de Propuesta Irresistible',stype='MIXED',domain='OFFER',sub='value proposition and funnel-stage offer',jobs=['design a compelling value proposition','adapt the proposition to attraction and sales phases'],inputs=['audience','problem','product or service','funnel phase'],outputs=['offer proposition','phase-specific promise and action'],best=['offer and proposition design'],strengths=['focused proposition method supported by funnel context'],q=['Q09','Q10']),
'METHOD_CRO':dict(name='CRO Máxima',source='Protégé — CRO Máxima',stype='COURSE',domain='CRO',sub='conversion research and experimentation',jobs=['research conversion problems','prioritize and run experiments'],inputs=['measurable objective','conversion data','research findings'],outputs=['CRO research plan','prioritized test plan'],best=['conversion optimization programs'],strengths=['covers research through experimentation and prioritization'],q=['Q11','Q12']),
'METHOD_ICP':dict(name='Audience and Customer Definition',source='MIXED',stype='MIXED',domain='ICP',sub='audience, avatar and market customer',jobs=['define and select a target audience','describe the customer in market context'],inputs=['market','offer context','customer evidence'],outputs=['target audience definition','customer/avatar profile'],best=['audience and ICP definition before offer/funnel work'],strengths=['combines funnel audience selection with customer-in-market evidence'],q=['Q14','Q22']),
'METHOD_FUNNEL':dict(name='Velocity Funnel Method',source='Velocity — Cursos Amplify: Funnels',stype='COURSE',domain='FUNNEL',sub='funnel strategy, economics and implementation',jobs=['select and design a multi-step funnel','connect funnel architecture to audience, offer and economics'],inputs=['audience','offer','economic model','desired conversion'],outputs=['funnel architecture','stage sequence','implementation asset plan'],best=['funnel design and implementation'],strengths=['coherent strategy-to-implementation funnel curriculum'],q=['Q01','Q02']),
'METHOD_MIDAS':dict(name='MIDAS',source='Velocity — Curso MIDAS',stype='COURSE',domain='RESEARCH',sub='demand, pricing, business model/LTV and intangible assets',jobs=['design demand and pricing strategy','connect business model to LTV and assets'],inputs=['market demand','price context','business model'],outputs=['demand strategy','pricing strategy','business-model/LTV map'],best=['business positioning and pricing decisions'],strengths=['integrates four explicit strategic/tactical pillars'],q=['Q05','Q06']),
'METHOD_INFOPRODUCT':dict(name='Negocio de Infoproductos A-Z',source='Velocity — Negocio de infoproductos de la A a la Z',stype='COURSE',domain='INFOPRODUCT',sub='audience, proposition, launch and growth',jobs=['design and launch an infoproduct business'],inputs=['audience','proposition','product concept'],outputs=['infoproduct launch path','growth plan'],best=['infoproduct business creation and launch'],strengths=['coherent end-to-end sequence'],q=['Q07','Q08']),
'METHOD_GROWTH_MARKETING':dict(name='Growth Marketing',source='Protégé — Growth Marketing',stype='COURSE',domain='RESEARCH',sub='market, growth loops, positioning and prioritization',jobs=['find and prioritize growth opportunities','define positioning and growth loops'],inputs=['market','customer','value metric','economic equation'],outputs=['positioning direction','growth-loop map','prioritized opportunities'],best=['growth-stage market and opportunity planning'],strengths=['explicit market-to-prioritization process'],q=['Q13','Q14']),
'METHOD_COURSE_DESIGN':dict(name='Course Design',source='unverified',stype='MIXED',domain='COURSE',sub=None,jobs=[],inputs=[],outputs=[],best=[],strengths=[],q=[]),
}

def ref(hit,qid,i):
 return {'query_id':qid,'evidence_id':'E'+str(i+1),'chunk_id':hit['chunk_id'],'source_pdf_name':hit['source_pdf_name'],'pdf_page_refs':hit.get('pdf_page_refs',[]),'retrieval_cosine_diagnostic':hit['original_query_cosine'],'source_id':(hit.get('provenance') or {}).get('source_id')}

def confidence(refs,fields,alias='CERTAIN'):
 source_quality=.75 # ASR transcripts with explicit warnings
 evidence=min(1,len(refs)/6); specificity=.9 if len(refs)>=4 else .7; agreement=.85; coverage=min(1,fields/10); alias_score=1 if alias=='CERTAIN' else .7; diversity=min(1,len(set(x['source_pdf_name'] for x in refs))/2)
 score=.20*source_quality+.20*evidence+.20*specificity+.15*agreement+.15*coverage+.05*alias_score+.05*diversity
 return round(min(.86,score),2)

def main():
 OUT.mkdir(parents=True,exist_ok=True)
 current=json.loads(REG.read_text(encoding='utf-8'))
 if not (OUT/'registry_before.json').exists(): shutil.copy2(REG,OUT/'registry_before.json')
 cache=sorted((BASE/'.cache'/'classifier_decisions').glob('*.json'))
 write('protection_before.json',{'captured_at':now(),'files':{p:sha(BASE/p) for p in PROTECTED},'corpus_rows':1380,'embeddings':1380,'cache_records':len(cache),'cache_hash':hashlib.sha256('\n'.join(f'{p.name}:{sha(p)}' for p in cache).encode()).hexdigest()})
 results=[]
 for qid,q,purpose,expected in QUERIES:
  o=sf.retrieve(sf.embed_query(q),q,5); hits=[]
  for i,h in enumerate(o['top5']):
   sid=(h.get('provenance') or {}).get('source_id')
   subject=(sid is None) if expected=='LEGACY' else (sid==expected if expected else False)
   hits.append({**ref(h,qid,i),'subject_hit':subject,'quality_status':h.get('quality_status'),'warning_flags':h.get('warning_flags')})
  results.append({'query_id':qid,'query':q,'purpose':purpose,'expected_source_id':expected,'returned_chunk_ids':[h['chunk_id'] for h in hits],'source_names':[h['source_pdf_name'] for h in hits],'provenance':hits,'subject_hits':sum(h['subject_hit'] for h in hits),'retrieval_score_diagnostics':[h['retrieval_cosine_diagnostic'] for h in hits],'notes':'Scores diagnostic only; subject/source evidence controls remap.','pipeline':o['pipeline'],'corpus_rows':o['corpus_rows']})
 write('rediscovery_queries.json',{'authorization_id':AUTH,'query_count':len(results),'queries':results})
 byq={x['query_id']:x for x in results}; methods=current['methods']; byid={m['method_id']:m for m in methods}
 rediscovered=[]; remaps=[]
 for mid,s in NEW_SPECS.items():
  refs=[]
  for qid in s['q']:
   refs += [x for x in byq[qid]['provenance'] if x['subject_hit']][:3]
  supported=len(refs)>=2
  aliases=[s['name']] if supported else []
  base=byid.get(mid,{'method_id':mid,'method_name':s['name'],'source':'unverified','source_type':s['stype'],'domain':s['domain'],'subdomain':None,'primary_jobs':[],'business_stage':[],'funnel_stage':[],'best_for':[],'not_recommended_for':[],'required_inputs':[],'expected_outputs':[],'strengths':[],'limitations':[],'dependencies':[],'compatible_methods':[],'conflicting_methods':[],'evidence_refs':[],'confidence':0,'version':'mr-0.1','mapping_status':'DISCOVERED'})
  if supported:
   base.update({'method_name':s['name'],'source':s['source'],'source_type':s['stype'],'domain':s['domain'],'subdomain':s['sub'],'primary_jobs':s['jobs'],'business_stage':[],'funnel_stage':[],'best_for':s['best'],'not_recommended_for':[],'required_inputs':s['inputs'],'expected_outputs':s['outputs'],'strengths':s['strengths'],'limitations':[],'dependencies':[],'compatible_methods':[],'conflicting_methods':[],'evidence_refs':refs,'confidence':confidence(refs,6),'version':'mr-0.3-astra03c','mapping_status':'PARTIALLY_MAPPED'})
  else: base.update({'evidence_refs':[],'confidence':0,'mapping_status':'DISCOVERED','version':'mr-0.3-astra03c'})
  if mid in byid: methods[methods.index(byid[mid])]=base
  else: methods.append(base)
  byid[mid]=base
  if supported: rediscovered.append({'method_id':mid,'raw_name':s['name'],'canonical_name':s['name'],'aliases_observed':aliases,'primary_source':s['source'],'supporting_sources':sorted(set(x['source_pdf_name'] for x in refs)),'source_type':s['stype'],'domain':s['domain'],'subdomain':s['sub'],'evidence_refs':refs,'existence_confidence':base['confidence']})
  remaps.append({'method_id':mid,'mapping_status':base['mapping_status'],'field_evidence':{k:[x['chunk_id'] for x in refs] for k in ['primary_jobs','best_for','required_inputs','expected_outputs','strengths'] if base[k]},'unsupported_fields':['business_stage','funnel_stage','not_recommended_for','limitations','dependencies','compatible_methods','conflicting_methods']})
 current['version']='mr-0.3-astra03c'; current['note']='ASTRA-03C evidence remap over 1380-row corpus; no global ranking; empty relationship fields mean no direct evidence.'
 REG.write_text(json.dumps(current,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 write('rediscovered_methods.json',{'count':len(rediscovered),'methods':rediscovered})
 write('evidence_remap.json',{'methods':remaps,'rule':'Only populated fields have direct query evidence; absent fields remain empty.'})
 write('normalized_methods.json',{'registry_version':current['version'],'methods':methods})
 write('confidence_recalculation.json',{'formula':'0.20 source_quality + 0.20 evidence_count(cap 6) + 0.20 specificity + 0.15 agreement + 0.15 field_coverage(cap 10) + 0.05 alias_certainty + 0.05 source_diversity(cap 2); ASR source_quality=0.75; cap=0.86','retrieval_score_not_confidence':True,'methods':[{'method_id':m['method_id'],'confidence':m['confidence'],'evidence_count':len(m['evidence_refs'])} for m in methods]})
 write('alias_resolution.json',{'resolutions':[{'status':'MERGED','terms':['Velocity Funnel Method','Funnel Design'],'canonical_method_id':'METHOD_FUNNEL','rationale':'Same coherent funnel curriculum and source package.','evidence_refs':[x['chunk_id'] for x in byid['METHOD_FUNNEL']['evidence_refs']]},{'status':'KEPT_SEPARATE','terms':['MIDAS','Growth Marketing'],'rationale':'Distinct named curricula and different core process scopes.','evidence_refs':[x['chunk_id'] for x in byid['METHOD_MIDAS']['evidence_refs']+byid['METHOD_GROWTH_MARKETING']['evidence_refs']]},{'status':'AMBIGUOUS','terms':['Velocity','Velocity Funnel Method'],'rationale':'Velocity is a source/brand umbrella across multiple courses; evidence does not establish one universal Velocity method.','evidence_refs':[x['chunk_id'] for x in byid['METHOD_FUNNEL']['evidence_refs']]}]})
 write('method_relationships.json',{'methods':[{'method_id':m['method_id'],'compatible_methods':[],'conflicting_methods':[],'dependencies':[],'reason':'No direct relationship claim found in bounded evidence; left empty.'} for m in methods]})
 print(json.dumps({'queries':len(results),'rediscovered':len(rediscovered),'methods':len(methods),'partial':sum(m['mapping_status']=='PARTIALLY_MAPPED' for m in methods),'discovered':sum(m['mapping_status']=='DISCOVERED' for m in methods)}))
if __name__=='__main__': main()
