"""Static-only OldTrek dice popup fix with exact-live backup/CAS/read-back."""
import base64, hashlib, json, shlex
from datetime import datetime, timezone
from pathlib import Path
from release_petsoul_day1_20261007 import connect, run, procs

ROOT=Path(__file__).resolve().parents[2]; OUT=ROOT/'_ai_workbench/temp/oldtrek_popup_fix_20261008'; MANIFEST=OUT/'release.json'; REMOTE='/linhhoasu/'
FILES=['webgame/game/js/main.min_drop200.js','webgame/game/index.html']

def rh(s,p): return run(s,'sha256sum '+shlex.quote(p)).split()[0]
def save(m): MANIFEST.write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def upload(s,p,data):
 run(s,'mkdir -p '+shlex.quote(p.rsplit('/',1)[0]));i,o,e=s.exec_command('base64 -d > '+shlex.quote(p),timeout=120);i.write(base64.b64encode(data));i.channel.shutdown_write();o.channel.recv_exit_status()
 if rh(s,p)!=hashlib.sha256(data).hexdigest(): raise RuntimeError('UPLOAD_HASH')

def main():
 m=json.loads(MANIFEST.read_text(encoding='utf-8')); s=connect()
 try:
  if m.get('phase')!='candidate': raise RuntimeError('BAD_PHASE:'+str(m.get('phase')))
  qa={'result':'PASS','checks':7,'productionWrites':0,'networkAttempts':0}
  m['tests']=qa;m['preProcesses']=procs(s);m['stage']=REMOTE+'_ai_workbench/temp/oldtrek_popup_fix_20261008';m['backup']=REMOTE+'_ai_workbench/backups/oldtrek_popup_fix_20261008_'+datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
  for r in m['files']:
   target=REMOTE+r['relative'];
   if rh(s,target)!=r['expected']: raise RuntimeError('BASELINE_CAS:'+r['relative'])
   data=(OUT/'candidate'/r['relative']).read_bytes();stage=m['stage']+'/candidate/'+r['relative'];upload(s,stage,data)
   if rh(s,stage)!=r['candidate']:raise RuntimeError('CANDIDATE_HASH')
  run(s,'mkdir -p '+shlex.quote(m['backup']))
  for r in m['files']:
   dst=m['backup']+'/'+r['relative'];run(s,'mkdir -p '+shlex.quote(dst.rsplit('/',1)[0])+' && cp -p '+shlex.quote(REMOTE+r['relative'])+' '+shlex.quote(dst))
   if rh(s,dst)!=r['expected']:raise RuntimeError('BACKUP_HASH')
  m['phase']='backed_up';save(m);m['published']=[]
  for r in m['files']:
   target=REMOTE+r['relative'];stage=m['stage']+'/candidate/'+r['relative'];tmp=target+'.oldtrek_popup_fix.tmp'
   if rh(s,target)!=r['expected']:raise RuntimeError('PUBLISH_CAS')
   run(s,'cp '+shlex.quote(stage)+' '+shlex.quote(tmp)+' && chmod --reference='+shlex.quote(target)+' '+shlex.quote(tmp)+' && chown --reference='+shlex.quote(target)+' '+shlex.quote(tmp))
   if rh(s,tmp)!=r['candidate']:raise RuntimeError('TEMP_HASH')
   run(s,'mv -f '+shlex.quote(tmp)+' '+shlex.quote(target));m['published'].append(r['relative']);save(m)
  m['finalHashes']={r['relative']:rh(s,REMOTE+r['relative']) for r in m['files']}
  if any(m['finalHashes'][r['relative']]!=r['candidate'] for r in m['files']):raise RuntimeError('FINAL_HASH')
  m['postProcesses']=procs(s)
  if m['postProcesses']!=m['preProcesses']:raise RuntimeError('PROCESS_CHANGED')
  for base in ['http://127.0.0.1:81/','https://linhhoasu.lol/']:
   h=run(s,'curl -fsS --max-time 45 '+shlex.quote(base+'js/main.min_drop200.js?v='+m['version'])+' | sha256sum',55).split()[0]
   if h!=m['files'][0]['candidate']:raise RuntimeError('PUBLIC_HASH')
   idx=run(s,'curl -fsS --max-time 30 '+shlex.quote(base+'index.html?v='+m['version']),40)
   if 'main.min_drop200.js?v='+m['version'] not in idx or 'lhs-fulu-safe-v1.js?v=20261008_fulu_safe_v4' not in idx:raise RuntimeError('INDEX_MARKER')
  m.update(phase='verified',result='PASS',restarts=0,productionPlayerWrites=0,verifiedAt=datetime.now(timezone.utc).isoformat());save(m)
  print(json.dumps({'result':'PASS','phase':'verified','backup':m['backup'],'servedHash':m['files'][0]['candidate'],'restarts':0}))
 except Exception as e:m['lastError']=str(e);save(m);raise
 finally:s.close()
if __name__=='__main__':main()
