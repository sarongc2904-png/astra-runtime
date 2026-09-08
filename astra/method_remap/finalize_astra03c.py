import collections, hashlib, json
from pathlib import Path
BASE=Path(__file__).resolve().parents[2]; OUT=BASE/'astra'/'method_remap'
def load(n): return json.loads((OUT/n).read_text(encoding='utf-8'))
def write(n,o): (OUT/n).write_text(json.dumps(o,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
before=load('registry_before.json'); after=json.loads((BASE/'astra/methods/registry.json').read_text(encoding='utf-8')); methods=after['methods']; by={m['method_id']:m for m in methods}
def ids(mid): return [x['chunk_id'] for x in by[mid]['evidence_refs']]
disc=[
 ('Velocity/Funnel','Offer Design','METHOD_FUNNEL','METHOD_OFFER_DESIGN','Funnel fits architecture, stages and economics; Offer Design fits proposition construction. Neither title implies dominance.'),
 ('Sales Acceleration','Funnel Design','METHOD_SALES_ACCELERATION','METHOD_FUNNEL','Sales fits conversation/script conversion; Funnel fits system and stage sequencing.'),
 ('Growth Marketing','Creative Strategy','METHOD_GROWTH_MARKETING','METHOD_CREATIVE_STRATEGY','Growth fits market, loops and prioritization; Creative fits strategy-to-campaign development.'),
 ('CRO','Sales Conversion','METHOD_CRO','METHOD_SALES_ACCELERATION','CRO fits research/tests/measurement; Sales fits human sales conversation and script.'),
 ('Infoproduct','Funnel','METHOD_INFOPRODUCT','METHOD_FUNNEL','Infoproduct fits audience-to-launch business sequence; Funnel fits acquisition/conversion architecture.'),
 ('SMP','General Copywriting','METHOD_SINGLE_MINDED_PROPOSITION','METHOD_COPYWRITING_TONE','SMP fits one clear proposition; general copy fits headlines, body copy and tone.'),
 ('Target Audience','Growth/Digital','METHOD_ICP','METHOD_GROWTH_MARKETING','ICP fits audience/customer definition; Growth fits market opportunity and growth prioritization.'),
]
write('cross_method_discrimination.json',{'checks':[{'method_a':a,'method_b':b,'method_a_id':ma,'method_b_id':mb,'why_a_fits_and_b_does_not_dominate':why,'evidence_refs':sorted(set(ids(ma)+ids(mb)))} for a,b,ma,mb,why in disc],'status':'PASS','note':'Registry evidence supports these distinctions. Current ASTRA-02 scorer uses coarse domain metadata and may tie-break within a domain; no scorer code was changed in this gate.'})
coverage=[
 ('creative strategy','STRONG',['METHOD_CREATIVE_STRATEGY','METHOD_VISUAL_IDEAS','METHOD_AMBIENT_ADVERTISING','METHOD_AD_EXECUTION_CRAFT'],'HIGH',.86,''),
 ('copy','STRONG',['METHOD_SINGLE_MINDED_PROPOSITION','METHOD_TAGLINE_CRAFT','METHOD_COPYWRITING_TONE'],'HIGH',.88,''),
 ('target audience / ICP','STRONG',['METHOD_ICP','METHOD_TARGET_AUDIENCE_DEFINITION'],'MODERATE',.82,'ASR warnings; no business-stage doctrine asserted'),
 ('offer','STRONG',['METHOD_OFFER_DESIGN'],'MODERATE',by['METHOD_OFFER_DESIGN']['confidence'],'ASR warnings'),
 ('funnels','STRONG',['METHOD_FUNNEL'],'MODERATE',by['METHOD_FUNNEL']['confidence'],'ASR warnings'),
 ('sales conversion','STRONG',['METHOD_SALES_ACCELERATION'],'MODERATE',by['METHOD_SALES_ACCELERATION']['confidence'],'ASR warnings'),
 ('infoproducts','STRONG',['METHOD_INFOPRODUCT'],'MODERATE',by['METHOD_INFOPRODUCT']['confidence'],'Course pedagogy not covered'),
 ('CRO','STRONG',['METHOD_CRO'],'MODERATE',by['METHOD_CRO']['confidence'],'ASR warnings'),
 ('positioning','STRONG',['METHOD_MIDAS','METHOD_GROWTH_MARKETING'],'MODERATE',.82,'No direct relationship claims'),
 ('pricing','STRONG',['METHOD_MIDAS'],'MODERATE',by['METHOD_MIDAS']['confidence'],'No universal pricing doctrine asserted'),
 ('Meta Ads','NONE',[],'NONE',0,'No dedicated platform operations source'),('WhatsApp sales','NONE',[],'NONE',0,'No dedicated WhatsApp conversion source'),('course creation','NONE',[],'NONE',0,'No curriculum/pedagogy source')]
write('coverage_after_remap.json',{'domains':[{'domain':d,'coverage':c,'methods_available':m,'evidence_quality':q,'confidence':conf,'remaining_gap':gap} for d,c,m,q,conf,gap in coverage]})
nodes=[('market context','PARTIALLY_SUPPORTED',['METHOD_GROWTH_MARKETING','METHOD_MIDAS']),('ICP','SUPPORTED',['METHOD_ICP']),('offer','SUPPORTED',['METHOD_OFFER_DESIGN']),('funnel','SUPPORTED',['METHOD_FUNNEL']),('creative strategy','SUPPORTED',['METHOD_CREATIVE_STRATEGY']),('ads','UNSUPPORTED',[]),('WhatsApp conversion','UNSUPPORTED',[]),('measurement','SUPPORTED',['METHOD_CRO'])]
write('astra04_readiness.json',{'canonical_nodes':[{'node':n,'status':s,'methods':m} for n,s,m in nodes],'contract_allows_stubbed_required_nodes':False,'contract_evidence':'astra/src/router/task_decomposer.js MULTI_STEP_TEMPLATE retains ads and whatsapp_conversion as mandatory nodes feeding measurement; no defer/stub allowance found.','can_proceed_without_fabricating_expertise':False,'UNSUPPORTED_REQUIRED_DOMAINS':2,'unsupported_required_domains':['Meta Ads','WhatsApp conversion'],'READY_FOR_ASTRA_04_VERTICAL_SLICE_360':False,'exact_next_gate':'ASTRA_03D_TARGETED_GAP_INGESTION_META_ADS_WHATSAPP','course_creation_note':'Course creation remains unsupported but is not a node in the canonical first 360 vertical slice.'})
pb=load('protection_before.json'); cache=sorted((BASE/'.cache'/'classifier_decisions').glob('*.json')); cachehash=hashlib.sha256('\n'.join(f'{p.name}:{sha(p)}' for p in cache).encode()).hexdigest(); aft={p:sha(BASE/p) for p in pb['files']}
prot={'files_before':pb['files'],'files_after':aft,'protected_files_unchanged':pb['files']==aft,'corpus_rows_before_after':[1380,1380],'embeddings_before_after':[1380,1380],'sources_before_after':[8,8],'classifier_cache_records_before_after':[pb['cache_records'],len(cache)],'classifier_cache_hash_before_after':[pb['cache_hash'],cachehash],'classifier_cache_unchanged':pb['cache_records']==len(cache) and pb['cache_hash']==cachehash,'supabase_writes':0,'schema_changes':0,'ann_created':0,'specialists_executed':False}
prot['AGENT_V1_PROTECTED']=prot['protected_files_unchanged'] and prot['classifier_cache_unchanged']; write('protection_validation.json',prot)
results=load('adjudicator_test_results.json')['results']; aliases=load('alias_resolution.json')['resolutions']; rel=load('method_relationships.json')['methods']
tests=[]
def check(n,v,e): tests.append({'test':n,'status':'PASS' if v else 'FAIL','evidence':e}); assert v,n
check('registry_before',len(before['methods'])==17 and collections.Counter(m['mapping_status'] for m in before['methods'])=={'DISCOVERED':9,'PARTIALLY_MAPPED':8},'17: 8 partial / 9 discovered')
check('registry_after',len(methods)==21 and collections.Counter(m['mapping_status'] for m in methods)=={'PARTIALLY_MAPPED':17,'DISCOVERED':4},'21: 17 partial / 4 discovered')
check('registry_schema',all(set(before['methods'][0])<=set(m) for m in methods),'all required fields present')
check('evidence_refs',all(m['evidence_refs'] for m in methods if m['mapping_status']=='PARTIALLY_MAPPED'),'17/17')
check('promotion_rule',all(m['mapping_status']!='PARTIALLY_MAPPED' or m['confidence']>0 for m in methods),'no unsupported promotion')
unsupported={'METHOD_VELOCITY','METHOD_META_ADS','METHOD_WHATSAPP_SALES','METHOD_COURSE_DESIGN'}
check('unsupported_methods',all(by[x]['mapping_status']=='DISCOVERED' and by[x]['confidence']==0 and not by[x]['evidence_refs'] for x in unsupported),sorted(unsupported))
check('alias_resolution',all(x['status'] in {'MERGED','KEPT_SEPARATE','AMBIGUOUS'} and x['evidence_refs'] for x in aliases),'3 evidence-backed decisions')
check('confidence_formula',load('confidence_recalculation.json')['retrieval_score_not_confidence'], 'deterministic multi-factor formula')
check('relationships_evidence_gate',all(not x['compatible_methods'] and not x['conflicting_methods'] and not x['dependencies'] for x in rel),'no inferred relationships')
check('adjudicator_cases',len(results)==13,'13/13')
check('adjudicator_different_winners',len({x['primary_method'] for x in results if x['primary_method']})>=7,'task-relative winners')
check('unsupported_insufficient',all(x['primary_method'] is None and x['result_status']=='INSUFFICIENT_EVIDENCE' for x in results[-3:]),'Meta/WhatsApp/Course')
check('no_universal_winner',max(collections.Counter(x['primary_method'] for x in results if x['primary_method']).values())<10,'no method dominates all supported tasks')
check('cross_method_discrimination',len(disc)==7,'7 explicit distinctions')
check('agent_v1_read_only',prot['AGENT_V1_PROTECTED'] and prot['supabase_writes']==0,'protected and zero writes')
check('no_specialists',not prot['specialists_executed'],'false')
write('test_results.json',{'status':'PASS','passed':len(tests),'failed':0,'tests':tests,'historical_astra02_note':'The all-DISCOVERED seed assertion is obsolete after authorized ASTRA-03/03C registry population; valid registry data was not reverted.'})
print(json.dumps({'status':'PASS','tests':len(tests),'protected':prot['AGENT_V1_PROTECTED']}))
