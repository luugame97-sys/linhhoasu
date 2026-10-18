"""Deploy only the five-pet data/assets, keeping the old pet logic/client."""
from __future__ import annotations
import hashlib,json,posixpath,shlex,time
from datetime import datetime,timezone
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect,run

ROOT=Path(__file__).resolve().parents[2]; RELEASE=ROOT/'_ai_workbench/temp/pet_vusa_port_20260929/release_simple'
HOSTROOT='/linhhoasu';APP=HOSTROOT+'/lhs/newServer';GAME=HOSTROOT+'/webgame/game';STAMP=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
BACKUP=f'{HOSTROOT}/_ai_workbench/backups/pet_old_logic_port_20260929_{STAMP}';STAGE=f'{HOSTROOT}/_ai_workbench/temp/pet_old_logic_port_20260929_{STAMP}'
M={'server/src/handlers/pet.js':APP+'/src/handlers/pet.js','server/update/resource/assets/excel/config_e5ac72c2.bin':HOSTROOT+'/lhs/update/resource/assets/excel/config_e5ac72c2.bin','server/update/resource/assets/excel/config_fashion_20260909.bin':HOSTROOT+'/lhs/update/resource/assets/excel/config_fashion_20260909.bin','client/update/resource/assets/excel/config_e5ac72c2.bin':GAME+'/update/resource/assets/excel/config_e5ac72c2.bin','client/update/resource/assets/excel/config_fashion_20260909.bin':GAME+'/update/resource/assets/excel/config_fashion_20260909.bin','client/update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin':GAME+'/update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin','client/update/resource/default.res_main_c669f2c0_pet_vusa_20260929.bin':GAME+'/update/resource/default.res_main_c669f2c0_pet_vusa_20260929.bin','client/update/resource/default.res_cn_main_f70d4753_pet_vusa_20260929.bin':GAME+'/update/resource/default.res_cn_main_f70d4753_pet_vusa_20260929.bin','client/index.html':GAME+'/index.html','client/js/main.min_drop100.js':GAME+'/js/main.min_drop100.js'}
for p in (RELEASE/'client/update/resource/assets').rglob('*'):
 if p.is_file(): M['client/update/resource/'+p.relative_to(RELEASE/'client/update/resource').as_posix()]=GAME+'/update/resource/'+p.relative_to(RELEASE/'client/update/resource').as_posix()
BEFORE={APP+'/src/handlers/pet.js':'5518f1601b640def06c1fb89e5dd36672411d90747e20475735c69ed7ec5c32f',HOSTROOT+'/lhs/update/resource/assets/excel/config_e5ac72c2.bin':'5606cb77752f7330b3a904fab4bec2a2ba65dc2856166e13834654e9824ae787',HOSTROOT+'/lhs/update/resource/assets/excel/config_fashion_20260909.bin':'5606cb77752f7330b3a904fab4bec2a2ba65dc2856166e13834654e9824ae787',GAME+'/update/resource/assets/excel/config_e5ac72c2.bin':'5606cb77752f7330b3a904fab4bec2a2ba65dc2856166e13834654e9824ae787',GAME+'/update/resource/assets/excel/config_fashion_20260909.bin':'5606cb77752f7330b3a904fab4bec2a2ba65dc2856166e13834654e9824ae787',GAME+'/update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin':'8d41ea06a4406d7e70ab5790b07c36927f2c42e07c538f9190712764760d154f',GAME+'/index.html':'25c1dde3681a11c95829fc3aedb1b193fd735a7b230edc4519c9ac60da8e60a1',GAME+'/js/main.min_drop100.js':'4a6b12eea8863a1b02d9d80b4bef91deb6312ea7678e8d513fab92c4bae40230'}
AFTER={remote:hashlib.sha256((RELEASE/rel).read_bytes()).hexdigest() for rel,remote in M.items()}
NODES=[('lhs-s1006',8087),('lhs-s1005',8086),('lhs-s1004',8085),('lhs-s1003',8084),('lhs-s1002',8083),('lhs-s1001',8080)]
q=shlex.quote;sha=lambda b:hashlib.sha256(b).hexdigest()
def hashes(s,paths): return {x.split()[1]:x.split()[0] for x in run(s,'sha256sum -- '+' '.join(q(p) for p in paths)).splitlines() if len(x.split())>=2}
def main():
 payload={remote:{'local':RELEASE/rel,'sha':sha((RELEASE/rel).read_bytes())} for rel,remote in M.items()};s=connect();swapped=[];restarted=[];report={'result':'STARTED','backup':BACKUP,'stage':STAGE,'productionWrites':0,'playerWrites':0}
 try:
  existing=list(BEFORE);live=hashes(s,existing)
  for p,h in BEFORE.items():
   if live.get(p)!=h: raise RuntimeError('CAS_DRIFT:'+p)
  run(s,'install -d -m 700 '+q(BACKUP)+' '+q(STAGE))
  for p in existing: run(s,'install -d -m 700 '+q(BACKUP+posixpath.dirname(p))+'; cp -p -- '+q(p)+' '+q(BACKUP+p))
  with s.open_sftp() as sf:
   for remote,item in payload.items():
    stage=STAGE+remote[len(HOSTROOT):];run(s,'install -d -m 700 '+q(posixpath.dirname(stage)));sf.put(str(item['local']),stage);sf.chmod(stage,0o644)
  stages=[STAGE+p[len(HOSTROOT):] for p in payload];st=hashes(s,stages)
  for remote,item in payload.items():
   if st.get(STAGE+remote[len(HOSTROOT):])!=item['sha']: raise RuntimeError('STAGE_HASH:'+remote)
  for remote in payload:
   stage=STAGE+remote[len(HOSTROOT):];run(s,'install -d -m 755 '+q(posixpath.dirname(remote))+'; mv -f -- '+q(stage)+' '+q(remote));swapped.append(remote)
  after=hashes(s,list(payload))
  for remote,item in payload.items():
   if after.get(remote)!=item['sha']:raise RuntimeError('LIVE_HASH:'+remote)
  run(s,'node --check '+q(APP+'/src/handlers/pet.js')+'; node --check '+q(GAME+'/js/main.min_drop100.js'))
  for name,port in NODES:
   run(s,'pm2 restart '+q(name));restarted.append(name);code=''
   for _ in range(20):
    code=run(s,f"curl -sS -o /dev/null -w '%{{http_code}}' --max-time 3 http://127.0.0.1:{port}/ready || true").strip()
    if code=='200':break
    time.sleep(1)
   report.setdefault('readiness',{})[str(port)]=code
   if code!='200':raise RuntimeError('READY:'+name)
  probe="const c=require('/linhhoasu/lhs/newServer/src/services/ConfigService'),t=c.loadAllTables();console.log(JSON.stringify({pets:Object.keys(t.PetConfig).length,q10:t.PetQualityConfig[10]?.passiveSkillCount,ids:[810101,810201,810301,810401,810501].map(id=>!!t.PetConfig[id])}));"
  report['config']=json.loads(run(s,'cd '+q(APP)+' && node -e '+q(probe)).strip().splitlines()[-1]);report['result']='DEPLOYED'
 except Exception as e:
  report['result']='FAILED';report['error']=str(e)
  if swapped:
   for p in existing:run(s,'cp -p -- '+q(BACKUP+p)+' '+q(p))
   for p in payload:
    if p not in existing:run(s,'rm -f -- '+q(p))
   for n,_ in NODES:
    try:run(s,'pm2 restart '+q(n))
    except Exception:pass
   report['rollback']='RESTORED'
  raise
 finally:
  try:run(s,'rm -rf -- '+q(STAGE))
  except Exception:pass
  s.close();(ROOT/'_ai_workbench/temp/pet_vusa_port_20260929/old-logic-release.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8');print(json.dumps(report,ensure_ascii=False,indent=2))
if __name__=='__main__':main()
