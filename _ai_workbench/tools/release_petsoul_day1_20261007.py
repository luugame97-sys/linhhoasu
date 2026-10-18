"""Narrow, recoverable System231 day-metadata release; no player writes."""
import base64, hashlib, json, shlex, sys, time
from datetime import datetime, timezone
from pathlib import Path
import paramiko

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'_ai_workbench/temp/hunth_day1_20261007'
MANIFEST=OUT/'release.json'
REMOTE='/linhhoasu'
STAGE='/linhhoasu/_ai_workbench/temp/petsoul_day1_20261007'
NODES={f'lhs-s100{i}':8080 if i==1 else 8081+i for i in range(1,8)}
STAMP='petsoul_day1_20261007'
sys.stdout.reconfigure(encoding='utf-8')

def sha(data):return hashlib.sha256(data).hexdigest()
def now():return datetime.now(timezone.utc).isoformat()
def connect():
 c=(ROOT/'_ai_workbench/VPS103.116.104.165.txt').read_text(encoding='utf-8-sig').splitlines()
 if len(c)!=3 or c[0].strip()!='103.116.104.165' or c[1].strip()!='root':raise RuntimeError('CREDENTIAL_TARGET_MISMATCH')
 s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy())
 s.connect(c[0].strip(),username='root',password=c[2],look_for_keys=False,allow_agent=False,timeout=15,banner_timeout=15,auth_timeout=15)
 return s

def run(s,cmd,timeout=60):
 i,o,e=s.exec_command(cmd,timeout=timeout);out=o.read().decode('utf-8',errors='replace');err=e.read().decode('utf-8',errors='replace');rc=o.channel.recv_exit_status()
 if rc:raise RuntimeError(f'COMMAND_FAILED:{rc}:{err[-1000:]}')
 return out

def rh(s,p):return run(s,'sha256sum '+shlex.quote(p)).split()[0]
def exists(s,p):return run(s,'test -e '+shlex.quote(p)+' && echo yes || echo no').strip()=='yes'
def upload(s,path,data):
 run(s,'mkdir -p '+shlex.quote(path.rsplit('/',1)[0]))
 i,o,e=s.exec_command('base64 -d > '+shlex.quote(path),timeout=120)
 i.write(base64.b64encode(data));i.channel.shutdown_write()
 err=e.read().decode(errors='replace');rc=o.channel.recv_exit_status()
 if rc:raise RuntimeError('UPLOAD_FAILED:'+err[-300:])
 if rh(s,path)!=sha(data):raise RuntimeError('UPLOAD_HASH:'+path)

def save(m):MANIFEST.write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def procs(s):
 js="const a=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log(JSON.stringify(a.filter(p=>p.name.startsWith('lhs-')).map(p=>({name:p.name,pid:p.pid,status:p.pm2_env.status,restarts:p.pm2_env.restart_time,launch:p.pm2_env.env?.SERVER_OPEN_TIME??null,disabled:p.pm2_env.env?.DISABLED_SYSTEM_IDS??null,ignore:p.pm2_env.env?.IGNORE_DAY_GATE_SYSTEM_IDS??null}))));"
 return json.loads(run(s,'pm2 jlist | node -e '+shlex.quote(js)))
def ready(s,name,attempts=1):
 for i in range(attempts):
  try:
   raw=run(s,f'curl -fsS --max-time 5 http://127.0.0.1:{NODES[name]}/ready',timeout=10);obj=json.loads(raw)
   if obj.get('status')=='ok' and obj.get('checks',{}).get('mongo') is True and obj.get('checks',{}).get('redis') is True:return obj
  except Exception:
   if i==attempts-1:raise
  if i<attempts-1:time.sleep(2)
 raise RuntimeError('NOT_READY:'+name)
def runtime(s):
 js="const c=require('/linhhoasu/lhs/newServer/src/services/ConfigService');const t=c.loadAllTables(),r=t.SystemConfig[231];console.log(JSON.stringify({system231:r,system206:t.SystemConfig[206],maxMount:Object.fromEntries([2,3,4,6,7].map(q=>[q,Object.keys(t.SwordLevelConfig[q]).length])),policy:require('/linhhoasu/lhs/newServer/src/config/featureDayAccess.json').version}));"
 return json.loads(run(s,"NODE_ENV=test LOG_DIR='' node -e "+shlex.quote(js),120).splitlines()[-1])

def prepare(s,m):
 for name in ['test_client.json','test_server.json']:
  t=json.loads((OUT/name).read_text(encoding='utf-8-sig'))
  if t.get('result')!='PASS' or t.get('playerWrites', t.get('productionWrites'))!=0 or t.get('networkCalls', t.get('networkAttemptsInFixture'))!=0:raise RuntimeError('TEST_GATE:'+name)
 m['tests']={n:json.loads((OUT/n).read_text(encoding='utf-8-sig')) for n in ['build.json','test_client.json','test_server.json']}
 m['preflightProcesses']=procs(s)
 if len([p for p in m['preflightProcesses'] if p['name'] in NODES and p['status']=='online'])!=7:raise RuntimeError('GAME_PROCESS_BASELINE')
 m['preflightReady']={name:ready(s,name,3) for name in NODES}
 for row in m['files']:
  target=REMOTE+'/'+row['relative'];data=(OUT/'next'/row['name']).read_bytes()
  if sha(data)!=row['candidate'] or rh(s,target)!=row['expected']:raise RuntimeError('PREFLIGHT_CAS:'+target)
  path=STAGE+'/candidate/'+row['name'];upload(s,path,data)
  if row['name'].endswith('.js'):run(s,'node --check '+shlex.quote(path))
 # Policy module resolves its colocated JSON; this stage uses its exact candidate file.
 check="const fs=require('fs'),assert=require('assert/strict'),c=require('/linhhoasu/lhs/newServer/src/services/ConfigService'),policy=require('"+STAGE+"/candidate/featureDayAccess');const t=c.decodeTables(fs.readFileSync('"+STAGE+"/candidate/server_fashion.bin'));policy.apply(t);assert.equal(t.SystemConfig[231].openDay,1);assert.deepEqual(t.SystemConfig[231].conditions,[{type:7,value:206,cond:4},{type:3,value:135,cond:4}]);assert.equal(Object.keys(t.SwordLevelConfig[7]).length,5000);console.log(JSON.stringify({result:'PASS',openDay:1,mountMax:5000}));"
 m['remoteCandidate']=json.loads(run(s,"NODE_ENV=test LOG_DIR='' node -e "+shlex.quote(check),120).splitlines()[-1])
 m['phase']='prepared';save(m)
 print(json.dumps({'phase':'prepared','targets':len(m['files']),'ready':7,'remoteCandidate':m['remoteCandidate']},ensure_ascii=False),flush=True)

def publish(s,m):
 if m.get('phase')!='prepared':raise RuntimeError('PREPARE_REQUIRED')
 for row in m['files']:
  if rh(s,REMOTE+'/'+row['relative'])!=row['expected']:raise RuntimeError('FINAL_CAS:'+row['relative'])
 backup=REMOTE+'/_ai_workbench/backups/'+STAMP+'_'+datetime.now(timezone.utc).strftime('%H%M%S')
 if exists(s,backup):raise RuntimeError('BACKUP_EXISTS')
 m['backup']=backup;m['published']=[];m['restarted']=[];save(m)
 for row in m['files']:
  target=REMOTE+'/'+row['relative'];dest=backup+'/'+row['relative']
  run(s,'mkdir -p '+shlex.quote(dest.rsplit('/',1)[0])+' && cp -p '+shlex.quote(target)+' '+shlex.quote(dest))
  if rh(s,dest)!=row['expected']:raise RuntimeError('BACKUP_HASH:'+row['relative'])
 for row in m['files']:
  target=REMOTE+'/'+row['relative'];tmp=target+'.'+STAMP+'.tmp'
  if exists(s,tmp):raise RuntimeError('TEMP_EXISTS:'+tmp)
  src=STAGE+'/candidate/'+row['name']
  # Copy attributes, recheck destination, then rename on the same filesystem.
  run(s,'cp '+shlex.quote(src)+' '+shlex.quote(tmp)+' && chmod --reference='+shlex.quote(target)+' '+shlex.quote(tmp)+' && chown --reference='+shlex.quote(target)+' '+shlex.quote(tmp))
  if rh(s,tmp)!=row['candidate'] or rh(s,target)!=row['expected']:raise RuntimeError('PUBLISH_CAS:'+row['relative'])
  run(s,'mv -f '+shlex.quote(tmp)+' '+shlex.quote(target))
  if rh(s,target)!=row['candidate']:raise RuntimeError('PUBLISH_HASH:'+row['relative'])
  m['published'].append(row['relative']);save(m)
 m['installedRuntime']=runtime(s)
 assert m['installedRuntime']['system231']['openDay']==1
 assert m['installedRuntime']['system231']['conditions']==[{'type':7,'value':206,'cond':4},{'type':3,'value':135,'cond':4}]
 for name in NODES:
  run(s,'pm2 restart '+shlex.quote(name),60)
  m['restarted'].append(name);save(m)
  m.setdefault('rollingReady',{})[name]=ready(s,name,30);save(m)
  print(json.dumps({'phase':'rolling','server':name,'ready':'ok','mongo':True,'redis':True}),flush=True)
 m['phase']='published';save(m)

def verify(s,m):
 m['finalHashes']={row['relative']:rh(s,REMOTE+'/'+row['relative']) for row in m['files']}
 if any(m['finalHashes'][row['relative']]!=row['candidate'] for row in m['files']):raise RuntimeError('VERIFY_HASH')
 m['finalProcesses']=procs(s);m['finalReady']={n:ready(s,n,3) for n in NODES};m['finalRuntime']=runtime(s)
 old={p['name']:p for p in m['preflightProcesses']};new={p['name']:p for p in m['finalProcesses']}
 if any(new.get(n,{}).get('status')!='online' for n in NODES):raise RuntimeError('GAME_STATUS')
 if any(new.get(n,{}).get('pid')!=p['pid'] for n,p in old.items() if n not in NODES):raise RuntimeError('NON_GAME_CHANGED')
 if any(new.get(n,{}).get(k)!=p.get(k) for n,p in old.items() for k in ['launch','disabled','ignore']):raise RuntimeError('CLOCK_OR_GATE_ENV_CHANGED')
 m['public']={}
 for name,url in [('addon','/js/lhs-feature-day1-v1.js?v=20261007_feature_day1_v2'),('client','/update/resource/assets/excel/config_e5ac72c2.bin?v=20261007_hunth_day1_v1'),('fashion','/update/resource/assets/excel/config_fashion_20260909.bin?v=20261007_hunth_day1_v1')]:
  h=run(s,'curl -fsS --max-time 25 '+shlex.quote('http://127.0.0.1:81'+url)+' | sha256sum',35).split()[0]
  filename={'addon':'feature-day1.js','client':'client_e5.bin','fashion':'client_fashion.bin'}[name];expected=next(r['candidate'] for r in m['files'] if r['name']==filename)
  if h!=expected:raise RuntimeError('PUBLIC_HASH:'+name)
  m['public'][name]=h
 idx=run(s,'curl -fsS --max-time 10 http://127.0.0.1:81/index.html',20)
 if '20261007_hunth_day1_v1' not in idx or 'js/lhs-feature-day1-v1.js?v=20261007_feature_day1_v2' not in idx:raise RuntimeError('INDEX_REFERENCE')
 m['result']='PASS';m['phase']='verified';m['finishedAt']=now();m['playerBackfillWrites']=0;m.pop('lastError',None);m.pop('errorAt',None);save(m)
 print(json.dumps({'phase':'verified','result':'PASS','ready':7,'openDay':1,'conditions':m['finalRuntime']['system231']['conditions'],'backup':m['backup'],'evidence':str(MANIFEST)},ensure_ascii=False),flush=True)

def rollback(s,m):
 if not m.get('backup'):raise RuntimeError('ROLLBACK_NO_BACKUP')
 for row in reversed(m['files']):
  if row['relative'] not in m.get('published',[]):continue
  target=REMOTE+'/'+row['relative'];actual=rh(s,target)
  if actual==row['expected']:continue
  if actual!=row['candidate']:raise RuntimeError('ROLLBACK_CAS:'+row['relative'])
  source=m['backup']+'/'+row['relative'];tmp=target+'.rollback_'+STAMP
  if rh(s,source)!=row['expected']:raise RuntimeError('ROLLBACK_BACKUP_HASH')
  run(s,'cp -p '+shlex.quote(source)+' '+shlex.quote(tmp)+' && mv -f '+shlex.quote(tmp)+' '+shlex.quote(target))
 for n in m.get('restarted',[]):run(s,'pm2 restart '+shlex.quote(n));ready(s,n,30)
 m['phase']='rolled_back';save(m)
 print(json.dumps({'phase':'rolled_back','ready':len(m.get('restarted',[]))}),flush=True)

def main():
 action=sys.argv[1] if len(sys.argv)>1 else 'prepare';m=json.loads(MANIFEST.read_text(encoding='utf-8-sig'));s=connect()
 try:
  {'prepare':prepare,'publish':publish,'verify':verify,'rollback':rollback}[action](s,m)
 except Exception as exc:
  m['lastError']=str(exc);m['errorAt']=now();save(m);raise
 finally:s.close()
if __name__=='__main__':main()
