"""CAS deploy custom PvP ruleset; backup, staged rename, rolling readiness."""
import hashlib,json,shlex,time
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect,run
ROOT=Path(__file__).resolve().parents[2]; APP=ROOT/'linhhoasu/lhs/newServer'
FILES=['src/services/BattleService.js','src/services/CrossArenaService.js','src/handlers/arena.js','src/handlers/raid.js','src/services/CustomCombatService.js','ecosystem.config.js']
REMOTE='/linhhoasu/lhs/newServer'; BACKUP='/linhhoasu/_ai_workbench/backups/custom_combat_v1_20260922'; STAGE='/linhhoasu/_ai_workbench/temp/custom_combat_v1_20260922'
NODES=[('lhs-s1002',8083),('lhs-s1001',8080),('lhs-s1003',8084),('lhs-s1004',8085),('lhs-s1005',8086)]
def sha(b): return hashlib.sha256(b).hexdigest()
def ready(s,p):
    return run(s,f"for i in $(seq 1 90);do c=$(curl -fsS -o /dev/null -w '%{{http_code}}' --max-time 5 http://127.0.0.1:{p}/ready||true);[ \"$c\" = 200 ]&&echo 200&&exit 0;sleep 1;done;exit 1").strip()
def main():
    local={rel:(APP/rel).read_bytes() for rel in FILES}
    if b'CUSTOM_PVP_FORMULA_ENABLED' not in local['ecosystem.config.js']:
        # Activation must be explicit and persistent in the release manifest.
        raise RuntimeError('CUSTOM_FLAG_MISSING')
    s=connect(); before={}; touched=[]; published=[]
    try:
      with s.open_sftp() as sf:
        run(s,'install -d -m 700 '+shlex.quote(BACKUP)); run(s,'install -d -m 700 '+shlex.quote(STAGE))
        for rel in FILES:
          rp=REMOTE+'/'+rel
          try: old=sf.open(rp,'rb').read()
          except FileNotFoundError: old=b''
          before[rel]=old
          bp=BACKUP+'/'+rel.replace('/','__')+'.before'
          try: saved=sf.open(bp,'rb').read()
          except FileNotFoundError:
            with sf.open(bp,'wb') as f:f.write(old)
            sf.chmod(bp,0o600)
          else:
            if saved!=old: raise RuntimeError('BACKUP_DRIFT:'+rel)
          if rel!='ecosystem.config.js' and rel!='src/services/CustomCombatService.js':
            # Existing files must match the audited baseline before mutation.
            expected={'src/services/BattleService.js':'4690d027f9e55f17bb6791215e4f10e4bbd4d1b2e260160a32db80b644614530','src/services/CrossArenaService.js':'8d0ad27f442a33a144267218e1d6953f459e4e7803dec3558ca5a71cdcacce29','src/handlers/arena.js':'9aed28e773a262cb198974ac4edf0bf2bd0423c8053bba5fce9f83f211946f18','src/handlers/raid.js':'143201e1b699ce65f6b3c98a5ac77ed6285dd257f2e12b4fd8b5cdc5cd951776'}[rel]
            if sha(old)!=expected: raise RuntimeError('REMOTE_CAS_DRIFT:'+rel+':'+sha(old))
          staged=STAGE+'/'+str(int(time.time()))+'/'+rel; run(s,'install -d -m 700 '+shlex.quote(staged.rsplit('/',1)[0]))
          with sf.open(staged,'wb') as f:f.write(local[rel])
          sf.chmod(staged,0o600)
          run(s,'node --check '+shlex.quote(staged))
          sf.posix_rename(staged,rp); published.append(rel)
      # ecosystem update-env requires full PM2 reload; only the five game nodes.
      for name,port in NODES:
        run(s,'pm2 restart '+name+' --update-env'); touched.append(name)
        if ready(s,port)!='200': raise RuntimeError('READY_FAILED:'+name)
      pm=json.loads(run(s,"pm2 jlist | node -e "+shlex.quote("let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.stringify(JSON.parse(s).filter(p=>/^lhs-s100[1-5]$/.test(p.name)).map(p=>({name:p.name,status:p.pm2_env.status,restarts:p.pm2_env.restart_time})))));")))
      out={'result':'DEPLOYED_AND_READY','at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'rulesVersion':'custom-pvp-v1','productionWrites':0,'backup':BACKUP,'files':{r:{'before':sha(before[r]),'after':sha(local[r])} for r in FILES},'restartOrder':touched,'readiness':{str(p):run(s,f'curl -fsS http://127.0.0.1:{p}/ready').strip() for _,p in NODES},'pm2':pm}
      (ROOT/'_ai_workbench/temp/combat_parity_20260922/custom_release.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf8'); print(json.dumps(out,ensure_ascii=False,indent=2))
    except Exception:
      # Restore only files published by this attempt; do not touch DB/player state.
      try:
        with s.open_sftp() as sf:
          for rel in published:
            tmp=STAGE+'/rollback_'+str(int(time.time()))+'/'+rel;run(s,'install -d -m 700 '+shlex.quote(tmp.rsplit('/',1)[0]))
            with sf.open(tmp,'wb') as f:f.write(before[rel])
            sf.chmod(tmp,0o600);sf.posix_rename(tmp,REMOTE+'/'+rel)
        for name,port in NODES:
          if name in touched:run(s,'pm2 restart '+name+' --update-env');ready(s,port)
      finally: s.close()
      raise
    s.close()
if __name__=='__main__': main()
