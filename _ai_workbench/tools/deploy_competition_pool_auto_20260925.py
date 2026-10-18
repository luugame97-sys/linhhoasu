"""Roll out page-1 competition pool + S5 Arena activation with CAS/backup.

The rollout lets schedulers catch up only from each server's activation/open
time. It never invokes settlement directly; the existing idempotent scheduler
creates historical receipts and will process the next daily cutoff normally.
"""
import hashlib, json, shlex, time
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect, run

ROOT=Path(__file__).resolve().parents[2]
APP=ROOT/'linhhoasu/lhs/newServer'
REL=[
 'src/config/crossServerEventSchedule.json',
 'src/services/CrossServerEventService.js',
 'src/services/CrossArenaService.js',
 'src/handlers/basic.js',
 'src/app.js',
 'src/config/competitionsRelease.js',
]
REMOTE_ROOT='/linhhoasu/lhs/newServer'
BACK='/linhhoasu/_ai_workbench/backups/competition_auto_pool_20260925'
STAGE='/linhhoasu/_ai_workbench/temp/competition_auto_pool_20260925'
EXPECTED={
 'src/config/crossServerEventSchedule.json':'b45e70e500c50a2285dfe30901fc07e574f82c976ea438a842c1b326fb696340',
 'src/services/CrossServerEventService.js':'462d8c33bb30667ad44e5d267fe1b10345e06f30970e77f56f04f04b74691258',
 'src/services/CrossArenaService.js':'894d2786431abdbf17e2cbec24472483f4026275f6121b6da437bb1ed68e2500',
 'src/handlers/basic.js':'7f7885c55c67678519be0d9862b3442ae11e641564fbaeebc8c2f440bbdf3d11',
 'src/app.js':'66c20b49656fdc1461cad92afd835115a05a5c06d458d2dde90b2f95e48e4bfc',
 'src/config/competitionsRelease.js':'cd75cd40885a3f9ee199eac57fad1222125f152e60138373395b00917cd914e1',
}
NEW_ACTIVATION=1790350835879
NODES=[('lhs-s1005',8086),('lhs-s1001',8080),('lhs-s1002',8083),('lhs-s1003',8084),('lhs-s1004',8085)]
sha=lambda b:hashlib.sha256(b).hexdigest()

def read(sf,p):
    with sf.open(p,'rb') as f:return f.read()
def put(sf,p,d,attrs):
    with sf.open(p,'wb') as f:f.write(d)
    sf.chmod(p,attrs.st_mode&0o777)
    try:sf.chown(p,attrs.st_uid,attrs.st_gid)
    except OSError:pass

def main():
    payload={rel:(APP/rel).read_bytes() for rel in REL}
    for rel,data in payload.items():
        if sha(data)==EXPECTED[rel]:raise RuntimeError('LOCAL_CANDIDATE_NOT_CHANGED:'+rel)
    ssh=connect();stage=None;swapped=[];restarted=[]
    try:
      with ssh.open_sftp() as sf:
        remote={REMOTE_ROOT+'/'+rel:read(sf,REMOTE_ROOT+'/'+rel) for rel in REL}
        attrs={p:sf.stat(p) for p in remote}
        for rel in REL:
          if sha(remote[REMOTE_ROOT+'/'+rel])!=EXPECTED[rel]:raise RuntimeError('REMOTE_CAS_DRIFT:'+rel)
        # Capture relevant S5 settlement/mail state before any scheduler run.
        backup_js=r"""const {MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');
        (async()=>{const c=new MongoClient('mongodb://127.0.0.1:27017');await c.connect();try{const d=c.db('lhs_s1005');const a=await d.collection('arenasettlements').find({}).toArray();const m=await d.collection('mails').find({$or:[{eventKey:/^arena_/i},{eventKey:/^cross:/i},{title:/Võ Đạo Hội|Đỉnh Phong/i}]}).toArray();console.log(JSON.stringify({at:new Date().toISOString(),directPlayerWrites:0,arenaSettlements:a,mails:m}));}finally{await c.close()}})().catch(e=>{console.error(e.stack);process.exitCode=1});"""
        before=json.loads(run(ssh,'node -',backup_js))
        run(ssh,'install -d -m 700 '+shlex.quote(BACK))
        with sf.open(BACK+'/s5_rewards_before.json','wb') as f:f.write(json.dumps(before,ensure_ascii=False,indent=2).encode())
        sf.chmod(BACK+'/s5_rewards_before.json',0o600)
        for p,data in remote.items():
          bp=BACK+'/'+Path(p).name+'.before'
          try:old=read(sf,bp)
          except FileNotFoundError:
            put(sf,bp,data,attrs[p]);sf.chmod(bp,0o600)
          else:
            if old!=data:raise RuntimeError('BACKUP_DRIFT:'+bp)
        stage=STAGE+'_'+str(int(time.time()));run(ssh,'install -d -m 700 '+shlex.quote(stage))
        for rel,data in payload.items():
          run(ssh,'install -d -m 700 '+shlex.quote(str(Path(stage+'/'+rel).parent).replace('\\','/')))
          put(sf,stage+'/'+rel,data,attrs[REMOTE_ROOT+'/'+rel])
        for rel in REL:
          sp=stage+'/'+rel
          if rel.endswith('.js'): run(ssh,'node --check '+shlex.quote(sp))
          else: run(ssh,'node -e '+shlex.quote("JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));console.log('JSON_STAGE_PASS')")+' '+shlex.quote(sp))
        if not json.loads(read(sf,stage+'/src/config/crossServerEventSchedule.json'))['serverPool']['autoInclude']:raise RuntimeError('POOL_AUTO_FLAG_MISSING')
        for rel in REL:
          src=REMOTE_ROOT+'/'+rel;st=stage+'/'+rel
          if read(sf,src)!=remote[src]:raise RuntimeError('PRE_SWAP_CAS_DRIFT:'+rel)
          sf.posix_rename(st,src);swapped.append(src)
      # S5 activation override is explicit and still starts from the server
      # opening time. The app auto-enables disabled page-1 templates.
      run(ssh,"export COMPETITION_REWARD_ACTIVATION_AT="+str(NEW_ACTIVATION)+"; pm2 restart lhs-s1005 --update-env")
      restarted.append('lhs-s1005')
      for name,port in NODES[1:]:
        run(ssh,'pm2 restart '+shlex.quote(name)+' --update-env');restarted.append(name)
      readiness={}
      for name,port in NODES:
        code=''
        for _ in range(20):
          code=run(ssh,f"curl -sS -o /dev/null -w '%{{http_code}}' --max-time 3 http://127.0.0.1:{port}/ready || true").strip()
          if code=='200':break
          time.sleep(2)
        readiness[name]=code
        if code!='200':raise RuntimeError('READY_FAILED:'+name)
      run(ssh,'pm2 save')
      time.sleep(8)
      after=json.loads(run(ssh,'node -',r"""const {MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');(async()=>{const c=new MongoClient('mongodb://127.0.0.1:27017');await c.connect();try{const d=c.db('lhs_s1005');const a=await d.collection('arenasettlements').find({}).sort({cutoffAt:-1}).limit(20).project({recipients:0,snapshotHash:0}).toArray();const m=await d.collection('mails').find({$or:[{eventKey:/^arena_/i},{eventKey:/^cross:/i},{title:/Võ Đạo Hội|Đỉnh Phong/i}]}).sort({createdAt:-1}).limit(10).project({attachments:1,title:1,eventKey:1,userId:1,createdAt:1}).toArray();console.log(JSON.stringify({at:new Date().toISOString(),directPlayerWrites:0,arenaSettlements:a,mails:m}));}finally{await c.close()}})().catch(e=>{console.error(e.stack);process.exitCode=1});"""))
      out={'result':'DEPLOYED_COMPETITION_POOL_AUTO','at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'productionWrites':'settlement_scheduler_only','directPlayerWrites':0,'beforeHashes':{p:sha(d) for p,d in remote.items()},'afterHashes':{REMOTE_ROOT+'/'+rel:sha(data) for rel,data in payload.items()},'backup':BACK,'restarted':restarted,'readiness':readiness,'s5After':after,'activationPolicy':'S5 Arena from SERVER_OPEN_TIME; S4 retained prior activation; page1 CrossArena auto pool 1001-1099; no historical CrossArena backpay without frozen roster'}
      report=ROOT/'_ai_workbench/temp/competition_auto_pool_20260925_release.json';report.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf8');print(json.dumps(out,ensure_ascii=False,indent=2))
    except Exception:
      if swapped:
        try:
          with ssh.open_sftp() as sf:
            for p in swapped:
              bp=BACK+'/'+Path(p).name+'.before';tmp=p+'.rollback_tmp';data=read(sf,bp);sf.open(tmp,'wb').write(data);sf.posix_rename(tmp,p)
          for name,_ in NODES:
            try:run(ssh,'pm2 restart '+shlex.quote(name)+' --update-env')
            except Exception:pass
        except Exception:pass
      raise
    finally:
      if stage:
        try:run(ssh,'rm -rf -- '+shlex.quote(stage))
        except Exception:pass
      ssh.close()
if __name__=='__main__':main()
