"""Fast CAS deployment for the already QA'd VUSA pet candidate.

Uses remote cp/sha256 for backups instead of downloading live binaries over
SFTP. It aborts on any CAS drift and rolls back exact paths on post-swap gate
failure. No player or database mutation is performed.
"""
from __future__ import annotations
import hashlib, json, posixpath, shlex, time
from datetime import datetime, timezone
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect, run
from parse_resource_config import parse

ROOT = Path(__file__).resolve().parents[2]
RELEASE = ROOT / '_ai_workbench/temp/pet_vusa_port_20260929/release'
REMOTE_ROOT = '/linhhoasu'; APP = REMOTE_ROOT + '/lhs/newServer'; GAME = REMOTE_ROOT + '/webgame/game'
STAMP = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
BACKUP = f'{REMOTE_ROOT}/_ai_workbench/backups/pet_vusa_port_20260929_{STAMP}'
STAGE = f'{REMOTE_ROOT}/_ai_workbench/temp/pet_vusa_port_20260929_{STAMP}'

MAPPING = {
 'server/src/handlers/pet.js': APP + '/src/handlers/pet.js',
 'server/update/resource/assets/excel/config_e5ac72c2.bin': REMOTE_ROOT + '/lhs/update/resource/assets/excel/config_e5ac72c2.bin',
 'server/update/resource/assets/excel/config_fashion_20260909.bin': REMOTE_ROOT + '/lhs/update/resource/assets/excel/config_fashion_20260909.bin',
 'client/update/resource/assets/excel/config_e5ac72c2.bin': GAME + '/update/resource/assets/excel/config_e5ac72c2.bin',
 'client/update/resource/assets/excel/config_fashion_20260909.bin': GAME + '/update/resource/assets/excel/config_fashion_20260909.bin',
 'client/update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin': GAME + '/update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin',
 'client/update/resource/default.res_main_c669f2c0_pet_vusa_20260929.bin': GAME + '/update/resource/default.res_main_c669f2c0_pet_vusa_20260929.bin',
 'client/update/resource/default.res_cn_main_f70d4753_pet_vusa_20260929.bin': GAME + '/update/resource/default.res_cn_main_f70d4753_pet_vusa_20260929.bin',
 'client/index.html': GAME + '/index.html',
 'client/js/main.min_drop100.js': GAME + '/js/main.min_drop100.js',
}
# Resolve assets from the manifest, never from a recursively copied directory:
# the rejected draft accidentally uploaded assets/assets/... . HTTP 200 alone
# could not detect that because its URL probe requested the same wrong path.
ASSET_SOURCES = {}
candidate_root = RELEASE.parent / 'candidate'
resource_rows = parse(candidate_root / 'default.res_main_c669f2c0_pet_vusa_20260929.bin')['resources']
asset_names = set(json.loads((candidate_root / 'manifest-build.json').read_text(encoding='utf8'))['added'])
for row in resource_rows:
 if row['name'] in asset_names:
  remote = GAME + '/update/resource/' + row['url']
  ASSET_SOURCES[remote] = candidate_root / row['url']
assert len(ASSET_SOURCES) == 31

BEFORE = {
 APP+'/src/handlers/pet.js':'5518f1601b640def06c1fb89e5dd36672411d90747e20475735c69ed7ec5c32f',
 REMOTE_ROOT+'/lhs/update/resource/assets/excel/config_e5ac72c2.bin':'5606cb77752f7330b3a904fab4bec2a2ba65dc2856166e13834654e9824ae787',
 REMOTE_ROOT+'/lhs/update/resource/assets/excel/config_fashion_20260909.bin':'5606cb77752f7330b3a904fab4bec2a2ba65dc2856166e13834654e9824ae787',
 GAME+'/update/resource/assets/excel/config_e5ac72c2.bin':'5606cb77752f7330b3a904fab4bec2a2ba65dc2856166e13834654e9824ae787',
 GAME+'/update/resource/assets/excel/config_fashion_20260909.bin':'5606cb77752f7330b3a904fab4bec2a2ba65dc2856166e13834654e9824ae787',
 GAME+'/update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin':'8d41ea06a4406d7e70ab5790b07c36927f2c42e07c538f9190712764760d154f',
 GAME+'/index.html':'25c1dde3681a11c95829fc3aedb1b193fd735a7b230edc4519c9ac60da8e60a1',
 GAME+'/js/main.min_drop100.js':'4a6b12eea8863a1b02d9d80b4bef91deb6312ea7678e8d513fab92c4bae40230',
}
AFTER = {
 APP+'/src/handlers/pet.js':'be2444791e96f0e9d48c79bc86c437583948bb59ad7f7e7df98a4d4e7c9950b8',
 REMOTE_ROOT+'/lhs/update/resource/assets/excel/config_e5ac72c2.bin':'e1979790fe7b97177ca271fe5b29bc75f7d0407be8312acc48a5b76e21c044da',
 REMOTE_ROOT+'/lhs/update/resource/assets/excel/config_fashion_20260909.bin':'e1979790fe7b97177ca271fe5b29bc75f7d0407be8312acc48a5b76e21c044da',
 GAME+'/update/resource/assets/excel/config_e5ac72c2.bin':'e1979790fe7b97177ca271fe5b29bc75f7d0407be8312acc48a5b76e21c044da',
 GAME+'/update/resource/assets/excel/config_fashion_20260909.bin':'e1979790fe7b97177ca271fe5b29bc75f7d0407be8312acc48a5b76e21c044da',
 GAME+'/update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin':'b90f6bc0aa278841eb5618ef29d92df1f1cd1b89af7df0b3885ae5c522ab5a25',
 GAME+'/index.html':'e6bec799ad9ef6e956ad35e70ed438ae9987eea28334904032be891694eb7dcb',
 GAME+'/js/main.min_drop100.js':'2ad9c69fcf5f5669a73b87e92111930bf50265a24a62b8877bfbd4a9b9abc742',
 GAME+'/update/resource/default.res_main_c669f2c0_pet_vusa_20260929.bin':'c377de920cae08965e560d66003883b616c8c03ed71605d569284a708d8b40a2',
 GAME+'/update/resource/default.res_cn_main_f70d4753_pet_vusa_20260929.bin':'13c45ba747ea633269d11fbf0b25452f9717821d2f5fd3dbc717c1ac58d544cf',
}
NODES=[('lhs-s1006',8087),('lhs-s1005',8086),('lhs-s1004',8085),('lhs-s1003',8084),('lhs-s1002',8083),('lhs-s1001',8080)]

def sha(data): return hashlib.sha256(data).hexdigest()
def q(s): return shlex.quote(s)
def hashes(ssh, paths):
 out=run(ssh,'sha256sum -- '+' '.join(q(p) for p in paths)); return {line.split()[1]:line.split()[0] for line in out.splitlines() if len(line.split())>=2}
def local_payloads():
 out={}
 for rel,remote in MAPPING.items():
  p=RELEASE/rel
  if not p.is_file(): raise RuntimeError('CANDIDATE_MISSING:'+str(p))
  data=p.read_bytes(); out[remote]={'local':p,'sha':sha(data),'bytes':len(data)}
 for remote,want in AFTER.items():
  if out.get(remote,{}).get('sha')!=want: raise RuntimeError('LOCAL_HASH_MISMATCH:'+remote)
 for remote,local in ASSET_SOURCES.items():
  if '/assets/assets/' in remote or not local.is_file(): raise RuntimeError('ASSET_LAYOUT:'+remote)
  data=local.read_bytes();out[remote]={'local':local,'sha':sha(data),'bytes':len(data)}
 return out

def main():
 raise RuntimeError('RELEASE_REJECTED: asset paths, combat, persistence, native QA gates unresolved; see rollback.json')
 payloads=local_payloads(); ssh=connect(); swapped=[]; restarted=[]
 report={'result':'STARTED','at':datetime.now(timezone.utc).isoformat(),'backup':BACKUP,'stage':STAGE,'productionWrites':0,'playerWrites':0,'assetCount':sum('/assets/' in p for p in payloads)}
 try:
  existing=[]
  for remote in payloads:
   if remote in BEFORE: existing.append(remote)
   else:
    if run(ssh,'test -e '+q(remote)+' && echo EXISTS || true').strip()=='EXISTS': raise RuntimeError('REMOTE_NEW_PATH_EXISTS:'+remote)
  live=hashes(ssh,existing)
  for remote,want in BEFORE.items():
   if live.get(remote)!=want: raise RuntimeError('REMOTE_CAS_DRIFT:'+remote+':'+str(live.get(remote)))
  run(ssh,'install -d -m 700 '+q(BACKUP)+' '+q(STAGE))
  for remote in existing:
   bp=BACKUP+remote; run(ssh,'install -d -m 700 '+q(posixpath.dirname(bp))+'; cp -p -- '+q(remote)+' '+q(bp))
  stage_rel=lambda remote: STAGE + remote[len(REMOTE_ROOT):]
  with ssh.open_sftp() as sf:
   for remote,item in payloads.items():
    stage=stage_rel(remote); run(ssh,'install -d -m 700 '+q(posixpath.dirname(stage)))
    sf.put(str(item['local']),stage); sf.chmod(stage,0o644)
  staged=[stage_rel(p) for p in payloads]; sh=hashes(ssh,staged)
  for remote,item in payloads.items():
   if sh.get(stage_rel(remote))!=item['sha']: raise RuntimeError('STAGE_HASH_MISMATCH:'+remote)
  run(ssh,'node --check '+q(stage_rel(APP+'/src/handlers/pet.js'))+' && node --check '+q(stage_rel(GAME+'/js/main.min_drop100.js')))
  live2=hashes(ssh,existing)
  for remote in existing:
   if live2.get(remote)!=live.get(remote): raise RuntimeError('PRE_SWAP_CAS_DRIFT:'+remote)
  for remote in payloads:
   run(ssh,'install -d -m 755 '+q(posixpath.dirname(remote))+'; mv -f -- '+q(stage_rel(remote))+' '+q(remote)); swapped.append(remote)
  after=hashes(ssh,list(payloads))
  for remote,item in payloads.items():
   if after.get(remote)!=item['sha']: raise RuntimeError('LIVE_HASH_MISMATCH:'+remote)
  for name,port in NODES:
   run(ssh,'pm2 restart '+q(name)+' --update-env'); restarted.append(name)
   code=''
   for _ in range(30):
    code=run(ssh,f"curl -sS -o /dev/null -w '%{{http_code}}' --max-time 3 http://127.0.0.1:{port}/ready || true").strip()
    if code=='200': break
    time.sleep(2)
   report.setdefault('readiness',{})[str(port)]=code
   if code!='200': raise RuntimeError('READY_FAILED:'+name)
  probe="const c=require('/linhhoasu/lhs/newServer/src/services/ConfigService');const t=c.loadAllTables();console.log(JSON.stringify({pets:Object.keys(t.PetConfig||{}).length,q9:t.PetQualityConfig?.[9]?.composeSuccessRate,q10:t.PetQualityConfig?.[10]?.passiveSkillCount,ids:[810101,810201,810301,810401,810501].map(id=>({id,pet:!!t.PetConfig[id],skill:!!t.PetSkillConfig[id],asset:!!t.AssetsConfig[id],appearance:!!t.AppearanceConfig[id]}))}));"
  report['configProbe']=json.loads(run(ssh,'cd '+q(APP)+' && node -e '+q(probe)).strip().splitlines()[-1])
  if report['configProbe'].get('pets')!=46 or report['configProbe'].get('q9')!=10 or report['configProbe'].get('q10')!=7 or not all(x['pet'] and x['skill'] and x['asset'] and x['appearance'] for x in report['configProbe']['ids']): raise RuntimeError('EFFECTIVE_CONFIG_PROBE_FAILED')
  idx=run(ssh,'cat '+q(GAME+'/index.html'))
  report['indexProbe']={'marker':'20260929_pet_vusa_port_v1' in idx,'main':'default.res_main_c669f2c0_pet_vusa_20260929.bin' in idx,'cn':'default.res_cn_main_f70d4753_pet_vusa_20260929.bin' in idx}
  if not all(report['indexProbe'].values()): raise RuntimeError('INDEX_PROBE_FAILED')
  assets=[p for p in payloads if '/update/resource/assets/' in p and p.endswith(('.png','.json','.atlas'))]
  checks=' '.join(q(p[len(GAME):]) for p in assets)
  ap=run(ssh,"for p in "+checks+"; do c=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:81$p || true); [ \"$c\" = 200 ] || { echo ASSET_HTTP_$c:$p; exit 1; }; done; echo ASSETS_HTTP_PASS").strip()
  if ap!='ASSETS_HTTP_PASS': raise RuntimeError('ASSET_HTTP_PROBE_FAILED:'+ap)
  report['assetHttp']={'count':len(assets),'result':ap}
  pmcmd="let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.stringify(JSON.parse(s).filter(p=>/^lhs-s100[1-6]$/.test(p.name)).map(p=>({name:p.name,status:p.pm2_env.status,pid:p.pid,restarts:p.pm2_env.restart_time})))))"
  report['processes']=json.loads(run(ssh,"pm2 jlist | node -e "+q(pmcmd)).strip())
  if any(x['status']!='online' for x in report['processes']): raise RuntimeError('NODE_NOT_ONLINE')
  report['result']='DEPLOYED'
 except Exception as e:
  report['result']='FAILED'; report['error']=str(e)
  if swapped:
   try:
    for remote in payloads:
     if remote in BEFORE: run(ssh,'cp -p -- '+q(BACKUP+remote)+' '+q(remote))
     else: run(ssh,'rm -f -- '+q(remote))
    for name in restarted:
     try: run(ssh,'pm2 restart '+q(name)+' --update-env')
     except Exception: pass
    report['rollback']='restored_and_restarted'
   except Exception as e2: report['rollbackError']=str(e2)
  raise
 finally:
  try: run(ssh,'rmdir -- '+q(STAGE)+' 2>/dev/null || true')
  except Exception: pass
  ssh.close(); (ROOT/'_ai_workbench/temp/pet_vusa_port_20260929/release-fast.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8'); print(json.dumps(report,ensure_ascii=False,indent=2))

if __name__=='__main__': main()
