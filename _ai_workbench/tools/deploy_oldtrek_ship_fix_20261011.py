from __future__ import annotations
import hashlib, importlib.util, json, shlex, time
from datetime import datetime, timezone
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('h',ROOT/'_ai_workbench/tools/release_artifact_quench_fix_20261009.py');h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
REMOTE='/linhhoasu/lhs/newServer'; BASE=ROOT/'linhhoasu/lhs/newServer/src'
FILES=['services/RewardGrantService.js','handlers/item.js','handlers/mail.js','handlers/old-trek.js']
EXPECTED={'services/RewardGrantService.js':'a32d111f90c4206b9f414295e934c7b292e911766e388bd63e9c9fc811e32898','handlers/item.js':'4de1c3618afc2620f852b5f7c9636528ef8cb3351c6cf919520b784eb2fc6a9f','handlers/mail.js':'af38306f6a0b85a2bf6a45389710e4096b30d162031986f9d236524882bed4cf','handlers/old-trek.js':'eb97499d5028ab0eba59181ab5d4cd601de2010939551db67120f98fc4e3849e'}
NODES=[('lhs-s1001',8080),('lhs-s1002',8083),('lhs-s1003',8084),('lhs-s1004',8085),('lhs-s1005',8086),('lhs-s1006',8087),('lhs-s1007',8088),('lhs-s1008',8089)]
def q(x):return shlex.quote(x)
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
 s=h.connect(); stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S'); backup=f'/linhoasu/_ai_workbench/backups/oldtrek_ship_fix_20261011_{stamp}'; stage=f'/linhoasu/_ai_workbench/temp/oldtrek_ship_fix_20261011_{stamp}'; ev={'at':datetime.now(timezone.utc).isoformat(),'result':'FAILED','productionWrites':0,'playerWrites':0}
 try:
  pre=h.procs(s);ev['preProcess']=pre
  if len(pre)!=8 or any(x['status']!='online' for x in pre):raise RuntimeError('PROCESS_BASELINE')
  ev['preReady']={str(port):h.ready(s,port) for _,port in NODES}
  if any(v!='200' for v in ev['preReady'].values()):raise RuntimeError('PRE_READY')
  h.run(s,'install -d -m 700 '+q(backup)+' '+q(stage))
  candidates={}
  for rel in FILES:
   target=REMOTE+'/src/'+rel; current=h.rh(s,target)
   if current!=EXPECTED[rel]:raise RuntimeError('CAS:'+rel+':'+current)
   data=(BASE/rel).read_bytes(); candidates[rel]=sha(BASE/rel)
   rb=backup+'/src/'+rel; rs=stage+'/src/'+rel
   h.run(s,'install -d -m 700 '+q(rb.rsplit('/',1)[0])+' '+q(rs.rsplit('/',1)[0]))
   h.run(s,'cp -p -- '+q(target)+' '+q(rb))
   with s.open_sftp() as sf:
    with sf.open(rs,'wb') as f:f.write(data)
   if h.rh(s,rb)!=current or h.rh(s,rs)!=candidates[rel]:raise RuntimeError('BACKUP_STAGE:'+rel)
  for rel in FILES:
   target=REMOTE+'/src/'+rel;rs=stage+'/src/'+rel;tmp=target+'.shipfix.tmp'
   if h.rh(s,target)!=EXPECTED[rel]:raise RuntimeError('PUBLISH_CAS:'+rel)
   h.run(s,'cp -- '+q(rs)+' '+q(tmp)+' && chmod --reference='+q(target)+' '+q(tmp)+' && chown --reference='+q(target)+' '+q(tmp)+' && mv -f -- '+q(tmp)+' '+q(target))
   if h.rh(s,target)!=candidates[rel]:raise RuntimeError('FINAL:'+rel)
  syntax=h.run(s,'for f in '+ ' '.join(q(REMOTE+'/src/'+r) for r in FILES)+'; do node --check "$f"; done; echo PASS',60).strip()
  if syntax!='PASS':raise RuntimeError('SYNTAX')
  ev['restarted']=[]
  for name,port in NODES:
   h.run(s,'pm2 restart '+q(name),120); deadline=time.time()+90;ready='000'
   while time.time()<deadline:
    ready=h.ready(s,port)
    if ready=='200':break
    time.sleep(1)
   if ready!='200':raise RuntimeError('POST_READY:'+name+':'+ready)
   ev['restarted'].append({'name':name,'port':port,'ready':ready})
  ev.update({'installedHashes':{rel:h.rh(s,REMOTE+'/src/'+rel) for rel in FILES},'postProcess':h.procs(s),'backup':backup,'syntax':'PASS','result':'PASS','verifiedAt':datetime.now(timezone.utc).isoformat()})
 except Exception as e:ev['error']=str(e);raise
 finally:
  (ROOT/'_ai_workbench/temp/oldtrek_ship_fix_20261011/deploy_release.json').write_text(json.dumps(ev,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
  try:h.run(s,'rm -rf -- '+q(stage),30)
  except Exception:pass
  s.close()
 print(json.dumps(ev,ensure_ascii=False))
if __name__=='__main__':main()
