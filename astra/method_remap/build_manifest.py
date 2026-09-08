import hashlib,json
from pathlib import Path
B=Path(__file__).resolve().parents[2]; O=B/'astra'/'method_remap'
extra=[B/'astra/methods/registry.json',B/'astra/ASTRA_03C_METHOD_REMAP_AND_METADATA_ADJUDICATION_REPORT.md',B/'astra/ASTRA_03C_TEST_RESULTS.md',B/'astra/CURRENT_TASK.md',B/'astra/HANDOFF_LATEST.md',B/'agent_loop/HANDOFF_ASTRA_03C_METHOD_REMAP_AND_METADATA_ADJUDICATION.md',B/'agent_loop/AGENT_STATE.md']
files=[p for p in O.iterdir() if p.is_file() and p.name!='artifact_manifest.json']+extra
items=[{'path':p.relative_to(B).as_posix(),'purpose':'ASTRA-03C registry/remap/adjudication/protection evidence','sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'created_or_modified':'modified' if p in [extra[0],extra[3],extra[4],extra[6]] else 'created'} for p in sorted(files)]
items.append({'path':'astra/method_remap/artifact_manifest.json','purpose':'Self manifest','sha256':None,'created_or_modified':'created'})
(O/'artifact_manifest.json').write_text(json.dumps({'artifact_count':len(items),'artifacts':items},ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps({'status':'PASS','artifact_count':len(items)}))
