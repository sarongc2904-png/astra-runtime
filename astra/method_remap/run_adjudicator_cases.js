'use strict';
const fs=require('fs'); const path=require('path');
const BASE=path.resolve(__dirname,'..','..');
const registry=require('../src/methods/registry_loader').load(path.join(BASE,'astra','methods','registry.json'));
const {adjudicate}=require('../src/router/method_adjudicator');
const defs=[
 ['ACQ','client acquisition across audience, offer and funnel','FUNNEL',['METHOD_FUNNEL','METHOD_OFFER_DESIGN','METHOD_ICP','METHOD_GROWTH_MARKETING'],null],
 ['OFFER','design an irresistible offer','OFFER',['METHOD_OFFER_DESIGN','METHOD_SINGLE_MINDED_PROPOSITION','METHOD_FUNNEL'],null],
 ['FUNNEL','design a multi-step sales funnel','FUNNEL',['METHOD_FUNNEL','METHOD_OFFER_DESIGN'],null],
 ['SALES','improve sales conversation conversion','SALES',['METHOD_SALES_ACCELERATION','METHOD_FUNNEL'],null],
 ['CREATIVE','develop advertising creative strategy','CREATIVE',['METHOD_CREATIVE_STRATEGY','METHOD_VISUAL_IDEAS','METHOD_AD_EXECUTION_CRAFT'],null],
 ['COPY','write a single clear advertising proposition','COPY',['METHOD_SINGLE_MINDED_PROPOSITION','METHOD_COPYWRITING_TONE','METHOD_TAGLINE_CRAFT'],null],
 ['INFO','create and launch an infoproduct business','INFOPRODUCT',['METHOD_INFOPRODUCT','METHOD_FUNNEL','METHOD_OFFER_DESIGN'],null],
 ['CRO','research and prioritize conversion experiments','CRO',['METHOD_CRO','METHOD_SALES_ACCELERATION'],null],
 ['POSITION','define market positioning and growth opportunities','RESEARCH',['METHOD_GROWTH_MARKETING','METHOD_MIDAS'],null],
 ['PRICING','design pricing connected to business model and LTV','RESEARCH',['METHOD_MIDAS','METHOD_GROWTH_MARKETING'],null],
 ['META','configure and optimize Meta Ads campaigns','ADS',['METHOD_META_ADS'],'META ADS'],
 ['WA','build WhatsApp follow-up and closing process','SALES',['METHOD_WHATSAPP_SALES'],'WHATSAPP SALES'],
 ['COURSE','design curriculum and learning sequence','COURSE',['METHOD_COURSE_DESIGN'],'COURSE CREATION'],
];
const cases=defs.map(([id,desc,domain,ids,gap])=>({task_id:'MR-'+id,task_description:desc,expected_supported_domain:domain,expected_possible_methods:ids,known_missing_domain_if_any:gap}));
const results=cases.map(c=>{
 const candidates=c.expected_possible_methods.map(id=>registry.byId(id)).filter(m=>m&&m.mapping_status==='PARTIALLY_MAPPED');
 // Unsupported cases deliberately pass their conservative placeholder; evidence gate withholds primary.
 const rawCandidates=candidates.length?candidates:c.expected_possible_methods.map(id=>registry.byId(id)).filter(Boolean);
 const ev={decision:c.known_missing_domain_if_any?'INSUFFICIENT':'SUFFICIENT'};
 const step={step_id:c.task_id,domain:c.expected_supported_domain};
 const a=adjudicate({brief:{funnel_stage:[],constraints:{}},step,candidates:rawCandidates,evidence:ev});
 return {task_id:c.task_id,candidate_methods:rawCandidates.map(x=>x.method_id),primary_method:a.primary_method,secondary_methods:a.secondary_methods,rejected_methods:a.rejected_methods,hybrid_strategy:a.hybrid_strategy,selection_confidence:a.selection_confidence,selection_reasons:a.selection_reasons,method_conflicts:a.method_conflicts,missing_evidence:a.missing_evidence,fallback_strategy:a.fallback_strategy,result_status:a.state,scores:a.scores};
});
fs.writeFileSync(path.join(__dirname,'adjudicator_test_cases.json'),JSON.stringify({cases},null,2)+'\n');
fs.writeFileSync(path.join(__dirname,'adjudicator_test_results.json'),JSON.stringify({results,specialists_executed:false},null,2)+'\n');
console.log(JSON.stringify(results.map(x=>[x.task_id,x.primary_method,x.result_status])));
