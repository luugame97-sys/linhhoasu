from __future__ import annotations
import datetime as dt, hashlib, json, shlex, stat, time
from pathlib import Path
from skin_incident_remote import connect, run

ROOT = Path(__file__).resolve().parents[2]
CAND = ROOT / '_ai_workbench/temp/mainline_infinite_20261014/candidate'
OUT = ROOT / '_ai_workbench/temp/mainline_infinite_20261014/tasks_deployment.json'
APP = '/linhhoasu/lhs/newServer'; WEB = '/linhhoasu/webgame/game'
NODES = {'lhs-s1001':8080,'lhs-s1002':8083,'lhs-s1003':8084,'lhs-s1004':8085,'lhs-s1005':8086,'lhs-s1006':8087,'lhs-s1007':8088,'lhs-s1008':8089}
FILES = {
 f'{APP}/src/config/infiniteMainline.js': CAND/'src/config/infiniteMainline.js',
 f'{APP}/src/handlers/raid.js': CAND/'src/handlers/raid.js',
 f'{APP}/src/handlers/playerPayload.js': CAND/'src/handlers/playerPayload.js',
 f'{WEB}/js/lhs-mainline-infinite-data-v1.js': CAND/'web/js/lhs-mainline-infinite-data-v1.js',
}

def sha(data): return hashlib.sha256(data).hexdigest()
def jrun(c, cmd): return json.loads(run(c, cmd))

def main():
 if OUT.exists(): raise RuntimeError('RECEIPT_EXISTS')
 payload={p:(Path(l).read_bytes(),sha(Path(l).read_bytes())) for p,l in FILES.items()}
 report={'at':dt.datetime.now(dt.timezone.utc).isoformat(),'scope':'S1-S8','playerWrites':0,'productionWrites':0,'restarts':[]}
 swapped=[]; restarted=[]; stages={}; backup=''
 with connect() as c:
  s=c.open_sftp()
  def ready(name):
   deadline=time.monotonic()+60
   while time.monotonic()<deadline:
    try:
     v=jrun(c,f'curl -fsS --max-time 5 http://127.0.0.1:{NODES[name]}/ready')
     if v.get('status')=='ok' and v.get('checks',{}).get('mongo') is True and v.get('checks',{}).get('redis') is True:return v
    except Exception: pass
    time.sleep(1)
   raise RuntimeError('READY_TIMEOUT:'+name)
  try:
   rows=jrun(c,'pm2 jlist'); pre={x['name']:{'pid':x['pid'],'status':x['pm2_env']['status'],'restarts':x['pm2_env']['restart_time'],'watch':x['pm2_env'].get('watch',False)} for x in rows if x['name'] in NODES}
   if set(pre)!=set(NODES) or any(x['status']!='online' or x['watch'] for x in pre.values()): raise RuntimeError('NODE_PRECONDITION')
   report['preProcesses']=pre; report['preReady']={n:ready(n) for n in NODES}
   stamp=dt.datetime.now(dt.timezone(dt.timedelta(hours=7))).strftime('%Y%m%d_%H%M%S'); backup=f'/linhhoasu/_ai_workbench/backups/mainline_tasks_{stamp}'; report['backupDir']=backup
   run(c,'mkdir -m 700 -- '+shlex.quote(backup))
   for remote,(data,after) in payload.items():
    st=s.stat(remote); current=sha(s.open(remote,'rb').read()); safe=remote.strip('/').replace('/','__'); bp=backup+'/'+safe
    run(c,'cp -p -- '+shlex.quote(remote)+' '+shlex.quote(bp))
    with s.open(bp,'rb') as h:
     if sha(h.read())!=current: raise RuntimeError('BACKUP_HASH:'+remote)
    stage=remote+'.mainline_tasks_'+stamp; stages[remote]=stage
    with s.open(stage,'wb') as h:h.write(data)
    s.chmod(stage,stat.S_IMODE(st.st_mode));s.chown(stage,st.st_uid,st.st_gid)
    with s.open(stage,'rb') as h:
     if sha(h.read())!=after:raise RuntimeError('STAGE_HASH:'+remote)
    report.setdefault('files',{})[remote]={'before':current,'after':after}
   for remote in FILES:
    if sha(s.open(remote,'rb').read())!=report['files'][remote]['before']:raise RuntimeError('CAS:'+remote)
   for remote,stage in stages.items():
    run(c,'mv -f -- '+shlex.quote(stage)+' '+shlex.quote(remote));swapped.append(remote)
   contract=r'''const c=require('./src/services/ConfigService'),t=c.loadAllTables(),g=require('./src/config/infiniteMainline');g.ensure({LevelConfig:t.LevelConfig,ChapterConfig:t.ChapterConfig,MonsterConfig:t.MonsterConfig,TaskConfig:t.TaskConfig,LanguageConfig:t.LanguageConfig},1811);if(!t.TaskConfig[990024]||t.TaskConfig[10406].nextId!==990024||!t.LanguageConfig[39804024])throw Error('TASK_CHAIN');console.log('TASK_CONTRACT='+JSON.stringify({version:g.VERSION,firstTask:t.TaskConfig[990024].id,next:t.TaskConfig[990024].nextId,playerWrites:0}));'''
   out=run(c,'cd '+shlex.quote(APP)+' && node -',contract)
   if 'TASK_CONTRACT=' not in out:raise RuntimeError('CONTRACT_MISSING')
   report['contract']=json.loads(out.split('TASK_CONTRACT=',1)[1].splitlines()[0])
   for name in NODES:
    run(c,'pm2 restart '+shlex.quote(name)+' --update-env');restarted.append(name);v=ready(name);report['restarts'].append({'name':name,'ready':v})
   report['postReady']={n:ready(n) for n in NODES}
   served=run(c,'curl -fsS --max-time 20 https://linhhoasu.lol/js/lhs-mainline-infinite-data-v1.js | sha256sum').split()[0]
   if served!=payload[f'{WEB}/js/lhs-mainline-infinite-data-v1.js'][1]:raise RuntimeError('SERVED_HASH')
   report['servedHash']=served;report['result']='PASS';OUT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
   print(json.dumps({'result':'PASS','scope':'S1-S8','backupDir':backup,'restarts':len(restarted),'playerWrites':0,'productionWrites':0,'servedHash':served}))
  except Exception as e:
   report['error']=repr(e)
   if swapped:
    for remote in reversed(swapped):
     safe=remote.strip('/').replace('/','__');bp=backup+'/'+safe;stage=remote+'.tasks_rollback';run(c,'cp -p -- '+shlex.quote(bp)+' '+shlex.quote(stage)+' && mv -f -- '+shlex.quote(stage)+' '+shlex.quote(remote))
    for n in restarted:run(c,'pm2 restart '+shlex.quote(n)+' --update-env');ready(n)
   report['rollback']=bool(swapped);OUT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');raise
  finally:
   for stage in stages.values():
    try:run(c,'rm -f -- '+shlex.quote(stage))
    except Exception:pass
   s.close()

if __name__=='__main__':main()
