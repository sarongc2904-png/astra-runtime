import json,sys,time
from pathlib import Path
BASE=Path(__file__).resolve().parents[2]; OUT=Path(__file__).resolve().parent/'meta_course_transcripts'; OUT.mkdir(parents=True,exist_ok=True)
sys.path.insert(0,r'C:\Users\saro_\Documents\Codex\2026-09-06\files-pasted-by-the-user-you\work\faster_whisper_vendor')
from faster_whisper import WhisperModel
MODEL=r'C:\Users\saro_\.cache\huggingface\hub\models--Systran--faster-whisper-small\snapshots\536b0662742c02347bc0e980a01041f333bce120'
model=WhisperModel(MODEL,device='cpu',compute_type='int8')
rows=[]
for p in sorted((BASE/'velocity_media'/'cursos'/'75_facebook').glob('*.mp4')):
 out=OUT/(p.stem+'.txt')
 if out.exists() and out.stat().st_size>100: text=out.read_text(encoding='utf8'); rows.append({'file':p.name,'status':'REUSED','chars':len(text)}); continue
 t=time.time(); segs,info=model.transcribe(str(p),language='es',beam_size=1,vad_filter=True,condition_on_previous_text=True)
 text=' '.join(s.text.strip() for s in segs if s.text.strip()).strip(); out.write_text(text+'\n',encoding='utf8')
 rows.append({'file':p.name,'status':'TRANSCRIBED','chars':len(text),'duration_seconds':info.duration,'seconds':round(time.time()-t,1)})
 print(json.dumps(rows[-1],ensure_ascii=False),flush=True)
(OUT/'transcription_manifest.json').write_text(json.dumps({'model':'faster-whisper-small','language':'es','files':rows},ensure_ascii=False,indent=2)+'\n',encoding='utf8')
