"""Rollback only the tower sweep batch release; preserve tower daily reset."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib,json,shlex,sys,time
from auction_ops_20261015 import connect,run

ROOT=Path(__file__).resolve().parents[2]
TASK=ROOT/'_ai_workbench/temp/baodian_sweep_20261017'
REMOTE='/linhhoasu'
q=shlex.quote
DEPLOY=json.loads((TASK/'deployment.json').read_text(encoding='utf-8'))
ROLLBACK_FILES={rel:meta for rel,meta in DEPLOY['files'].items() if rel!='lhs/newServer/src/services/TowerSweepService.js'}
BASE=TASK/'baseline'
SNAP="node -e \"const cp=require('child_process');console.log(JSON.stringify(JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8',maxBuffer:8e6})).map(p=>({name:p.name,pid:p.pid,restarts:p.pm2_env.restart_time,status:p.pm2_env.status,port:p.pm2_env.HTTP_PORT,cwd:p.pm2_env.pm_cwd,entry:p.pm2_env.pm_exec_path}))))\""
def sha(b):return hashlib.sha256(b).hexdigest()

def main():
 sys.stdout.reconfigure(encoding='utf-8')
 assert DEPLOY['status']=='DEPLOYED_VERIFIED'
 backup=REMOTE+'/_ai_workbench/backups/tower_sweep_rollback_'+datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
 receipt={'at':datetime.now(timezone.utc).isoformat(),'status':'PREPARING','backup':backup,'rolledBackFiles':list(ROLLBACK_FILES),'removedNewFiles':['lhs/newServer/src/services/TowerSweepService.js'],'restarts':[],'directPlayerWrites':0,'preserved':'tower daily reset v1; mount star fix; all player state'}
 c=connect()
 try:
  def rh(path):return run(c,'sha256sum -- '+q(path),timeout=15).split()[0]
  before=json.loads(run(c,SNAP));nodes=sorted([n for n in before if n['name'].startswith('lhs-s') and n['name'][5:].isdigit()],key=lambda n:n['name']);assert len(nodes)==9
  assert all(n['cwd']=='/linhhoasu/lhs/newServer' and n['entry']=='/linhhoasu/lhs/newServer/src/app.js' for n in nodes)
  with c.open_sftp() as s:
   for rel,meta in ROLLBACK_FILES.items():
    target=REMOTE+'/'+rel;assert rh(target)==meta['after'],'LIVE_DRIFT:'+rel
    localrel=rel[len('lhs/newServer/'):] if rel.startswith('lhs/newServer/') else ('web/'+rel[len('webgame/game/'):] if rel.startswith('webgame/game/') else rel)
    baseline=BASE/localrel;assert baseline.exists(),'BASELINE_MISSING:'+str(localrel);assert sha(baseline.read_bytes())==meta['before'],'BASELINE_HASH:'+rel
   service=REMOTE+'/lhs/newServer/src/services/TowerSweepService.js';assert rh(service)==DEPLOY['files']['lhs/newServer/src/services/TowerSweepService.js']['after'],'SERVICE_DRIFT'
   run(c,'install -d -m 700 -- '+q(backup+'/current')+' '+q(backup+'/rollback'),timeout=10)
   # Backup current post-sweep state and stage exact pre-sweep bytes.
   for rel in list(ROLLBACK_FILES)+['lhs/newServer/src/services/TowerSweepService.js']:
    target=REMOTE+'/'+rel;current=backup+'/current/'+rel;stage=backup+'/rollback/'+rel
    run(c,'install -d -m 700 -- '+q(current.rsplit('/',1)[0])+' '+q(stage.rsplit('/',1)[0]),timeout=10)
    run(c,'cp -p -- '+q(target)+' '+q(current),timeout=20)
    if rel in ROLLBACK_FILES:
     localrel=rel[len('lhs/newServer/'):] if rel.startswith('lhs/newServer/') else ('web/'+rel[len('webgame/game/'):] if rel.startswith('webgame/game/') else rel)
     s.put(str(BASE/localrel),stage);st=s.stat(target);s.chmod(stage,st.st_mode&0o7777);s.chown(stage,st.st_uid,st.st_gid);assert rh(stage)==ROLLBACK_FILES[rel]['before']
   # CAS then swap preimages; remove new service by atomic move into backup.
   for rel in ROLLBACK_FILES:
    target=REMOTE+'/'+rel;assert rh(target)==ROLLBACK_FILES[rel]['after'],'CAS_DRIFT:'+rel;s.posix_rename(backup+'/rollback/'+rel,target);assert rh(target)==ROLLBACK_FILES[rel]['before']
   s.posix_rename(service,backup+'/current/lhs/newServer/src/services/TowerSweepService.js')
   for rel in ROLLBACK_FILES:assert rh(REMOTE+'/'+rel)==ROLLBACK_FILES[rel]['before'],'ROLLBACK_HASH:'+rel
   receipt['status']='FILES_ROLLED_BACK';print(json.dumps({'status':receipt['status'],'backup':backup}),flush=True)
   for n in nodes:
    run(c,'pm2 restart '+q(n['name'])+' >/dev/null',timeout=30);ready=None
    for _ in range(100):
     try:
      body=json.loads(run(c,'curl -fsS --max-time 3 http://127.0.0.1:'+str(n['port'])+'/ready',timeout=5))
      if body['checks']['mongo'] and body['checks']['redis']:ready=body;break
     except RuntimeError:pass
     time.sleep(.5)
    assert ready,'READY_TIMEOUT:'+n['name'];now=next(x for x in json.loads(run(c,SNAP)) if x['name']==n['name']);assert now['pid']!=n['pid'] and now['restarts']==n['restarts']+1
    receipt['restarts'].append({**now,'ready':ready});print(json.dumps({'server':n['name'],'ready':True}),flush=True)
   run(c,'pm2 save >/dev/null',timeout=15);final=json.loads(run(c,SNAP));names={n['name'] for n in nodes};receipt['outsideProcessChanges']=[{'before':n,'after':next((x for x in final if x['name']==n['name']),None)} for n in before if n['name'] not in names and next((x['pid'] for x in final if x['name']==n['name']),None)!=n['pid']]
   receipt['status']='ROLLED_BACK_VERIFIED';
   # Read back: daily reset remains, sweep route/addon gone, and target service absent.
   code="const fs=require('fs'),C=require('./src/services/ConfigService');C.loadAllTables();const a=fs.readFileSync('src/handlers/index.js','utf8'),t=fs.readFileSync('src/handlers/tower.js','utf8'),d=fs.readFileSync('src/services/TowerDailyResetService.js','utf8');if(a.includes('3705')||t.includes('TowerSweepService')||!d.includes('tower_daily_reset_v1'))process.exit(2);console.log(JSON.stringify({sweepRoute:false,dailyReset:true,serviceAbsent:!fs.existsSync('src/services/TowerSweepService.js')}));"
   out=run(c,"cd /linhhoasu/lhs/newServer && node - <<'READ'\n"+code+"\nREAD",timeout=20);receipt['readback']=json.loads(out)
   save=TASK/'rollback.json';save.write_text(json.dumps(receipt,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({'status':receipt['status'],'nodes':len(receipt['restarts']),'readback':receipt['readback'],'outsideProcessChanges':len(receipt['outsideProcessChanges'])}),flush=True)
 finally:
  (TASK/'rollback.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2),encoding='utf-8');c.close()

if __name__=='__main__':main()
