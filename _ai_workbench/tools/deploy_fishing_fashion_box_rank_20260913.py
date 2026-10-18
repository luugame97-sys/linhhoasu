"""Scoped CAS deploy of Activity6RankConfig fashion-box rewards."""
import hashlib,json,shlex,subprocess
from datetime import datetime,timezone
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect,run
WB=Path(__file__).resolve().parents[1]; ROOT=WB.parent/'linhhoasu/lhs/newServer'; STAGE=WB/'temp/fishing_fashion_box_rank_20260913_order'; R='/linhhoasu'; BACKUP=R+'/_ai_workbench/backups/fishing_fashion_box_rank_20260913_order_pre'; APP=R+'/lhs/newServer'
FILES={'lhs/update/resource/assets/excel/config_e5ac72c2.bin':'server.bin','webgame/game/update/resource/assets/excel/config_e5ac72c2.bin':'client.bin','webgame/game/update/resource/assets/excel/config_fashion_20260909.bin':'fashion.bin'}
PROCS=['lhs-s1001','lhs-s1002','lhs-s1003'];PORTS={'1001':8080,'1002':8083,'1003':8084};sha=lambda b:hashlib.sha256(b).hexdigest()
def served_path(rel):
 return rel[len('lhs/'):] if rel.startswith('lhs/') else rel[len('webgame/game/'):]
def main():
 s=connect(); ev={'startedAt':datetime.now(timezone.utc).isoformat(),'scope':'Activity6RankConfig[6006] add item99002 only','files':{}}
 try:
  if run(s,'test -e '+shlex.quote(BACKUP)+' && echo yes || echo no').strip()!='no':raise RuntimeError('BACKUP_EXISTS')
  STAGE.mkdir(parents=True,exist_ok=True)
  with s.open_sftp() as f:
   for rel,name in FILES.items():
    remote=R+'/'+rel; data=f.open(remote,'rb').read(); before=sha(data);local=STAGE/(name+'.before.bin');local.write_bytes(data);candidate=STAGE/(name+'.next.bin')
    p=subprocess.run(['node',str(WB/'tools/patch_fishing_fashion_box_rank_file_20260913.js'),str(local),str(candidate)],capture_output=True,text=True,check=True)
    meta=json.loads(p.stdout.strip());ev['files'][rel]={'before':before,'candidate':meta['afterHash'],'changed':meta['changed']}
  with s.open_sftp() as f:
   for rel in FILES:
    remote=R+'/'+rel;data=f.open(remote,'rb').read();assert sha(data)==ev['files'][rel]['before'],'CAS_DRIFT:'+rel
  run(s,'mkdir -p '+shlex.quote(BACKUP))
  with s.open_sftp() as f:
   for rel,name in FILES.items():
    remote=R+'/'+rel;dst=BACKUP+'/'+rel;run(s,'mkdir -p '+shlex.quote(dst.rsplit('/',1)[0])+' && cp -p '+shlex.quote(remote)+' '+shlex.quote(dst))
    tmp=remote+'.fashionrank_tmp_20260913';f.put(str(STAGE/(name+'.next.bin')),tmp);f.posix_rename(tmp,remote) if hasattr(f,'posix_rename') else f.rename(tmp,remote)
    assert sha(f.open(remote,'rb').read())==ev['files'][rel]['candidate'],'POST_HASH:'+rel
  # Decode the exact deployed files and validate reward rows plus item 99002 effective overlay.
  js="""const fs=require('fs'),c=require('/linhhoasu/lhs/newServer/src/services/ConfigService');const t=c.loadAllTables();const rows=t.Activity6RankConfig[6006],want={1:10,2:7,3:5,4:3,11:2,51:2,101:2,501:2};for(const [k,n] of Object.entries(want)){const r=rows[k],x=(r.rewards||[]).find(v=>v.id===99002);if(!x||x.count!==n)process.exit(2)}if(!t.AssetsConfig[99002]||!t.AssetsUseConfig[99002])process.exit(3);console.log(JSON.stringify({result:'PASS',item:t.AssetsConfig[99002].id,rank:rows}))"""
  ev['configCheck']=json.loads(run(s,'CONFIG_BIN_PATH='+APP+'/../update/resource/assets/excel/config_e5ac72c2.bin node -e '+shlex.quote(js)))
  for n in PROCS: run(s,'pm2 restart '+n+' --update-env');ev.setdefault('restarted',[]).append(n)
  ev['ready']={sid:int(run(s,f"for i in $(seq 1 15);do c=$(curl -sS --max-time 5 -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{p}/ready||true);[ \"$c\" = 200 ]&&echo $c&&break;sleep 2;done").strip()) for sid,p in PORTS.items()}
  ev['processes']=[{'name':p['name'],'status':p['pm2_env']['status'],'pid':p['pid']} for p in json.loads(run(s,'pm2 jlist')) if p['name'] in PROCS]
  ev['served']={rel:run(s,"curl -fsS --max-time 20 http://127.0.0.1:81/"+served_path(rel)+' | sha256sum | awk \'{print $1}\'').strip() for rel in FILES}
  ev['errors']=run(s,"for f in /root/.pm2/logs/lhs-s1001-error.log /root/.pm2/logs/lhs-s1002-error.log /root/.pm2/logs/lhs-s1003-error.log;do tail -80 \"$f\"|grep -Ei 'CONFIG_DECODE_FAILED|SyntaxError|ReferenceError|uncaughtException|unhandledRejection' || true;done")
 finally:s.close()
 ev['finishedAt']=datetime.now(timezone.utc).isoformat();ev['result']='PASS' if ev.get('ready')=={'1001':200,'1002':200,'1003':200} and all(p['status']=='online' for p in ev.get('processes',[])) and not ev.get('errors') and all(ev['served'][rel]==ev['files'][rel]['candidate'] for rel in FILES) else 'HOLD';(STAGE/'deploy.json').write_text(json.dumps(ev,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps({'result':ev['result'],'ready':ev.get('ready'),'restarted':ev.get('restarted'),'evidence':str(STAGE/'deploy.json')},ensure_ascii=False))
if __name__=='__main__':main()
