"""Deploy the scoped type37/type49 transport and server candidate."""
from pathlib import Path
from datetime import datetime, timezone
import base64, hashlib, json, shlex, sys
from release_petsoul_day1_20261007 import connect, run, ready, procs

ROOT=Path(__file__).resolve().parents[2]
G=ROOT/'_ai_workbench/temp/event_goal_20261007/draws'; OUT=G/'release'; MAN=OUT/'receipt.json'; REMOTE='/linhhoasu'; STAGE=REMOTE+'/_ai_workbench/temp/draws_release_20261007'
NODES={f'lhs-s100{i}':8080 if i==1 else 8081+i for i in range(1,8)}
def sha(b): return hashlib.sha256(b).hexdigest()
def rh(s,p): return run(s,'sha256sum '+shlex.quote(p)).split()[0]
def exists(s,p): return run(s,'test -e '+shlex.quote(p)+' && echo yes || echo no').strip()=='yes'
def put(s,p,data):
 run(s,'mkdir -p '+shlex.quote(p.rsplit('/',1)[0]));i,o,e=s.exec_command('base64 -d > '+shlex.quote(p),timeout=120);i.write(base64.b64encode(data));i.channel.shutdown_write();
 if o.channel.recv_exit_status(): raise RuntimeError('UPLOAD:'+p)
 if rh(s,p)!=sha(data): raise RuntimeError('UPLOAD_HASH:'+p)
def save(m): OUT.mkdir(parents=True,exist_ok=True);MAN.write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def build():
 for p in [G/'test-result.json',G/'integration-result.json',G/'client-test-result.json']:
  x=json.loads(p.read_text(encoding='utf-8-sig'))
  if not x.get('pass',False) or x.get('productionWrites',0) or x.get('networkAttempts',x.get('networkCalls',0)): raise RuntimeError('TEST:'+p.name)
 base=(ROOT/'_ai_workbench/temp/event_goal_20261007/phase_ab/candidate/webgame/game/index.html').read_text(encoding='utf-8')
 if 'lhs-event-maintenance-v1.js?v=20261007_event_gate_v1' not in base: raise RuntimeError('INDEX_BASE')
 index=base.replace('"js/lhs-event-maintenance-v1.js?v=20261007_event_gate_v1",','"js/lhs-event-maintenance-v1.js?v=20261007_event_gate_v1",\n\t\t"js/lhs-draws-safe-v1.js?v=20261007_draws_safe_v1",')
 files={
  'lhs/newServer/src/handlers/activity.js':G/'candidate/handlers/activity.js',
  'lhs/newServer/src/services/Activity37Service.js':G/'candidate/services/Activity37Service.js',
  'lhs/newServer/src/services/Activity49Service.js':G/'candidate/services/Activity49Service.js',
  'webgame/game/js/lhs-draws-safe-v1.js':G/'candidate/lhs-draws-safe-v1.js',
  'webgame/game/index.html':None,
 }
 outfiles=[]
 for rel,p in files.items():
  data=index.encode() if p is None else p.read_bytes(); dest=OUT/'candidate'/rel;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data);outfiles.append({'relative':rel,'candidate':sha(data),'bytes':len(data)})
 (OUT/'candidate'/ 'index.html').write_bytes(index.encode())
 save({'phase':'candidate','version':'draws_3749_safe_v1','files':outfiles,'playerWrites':0,'scope':'type37 full / type49 exchange only; board modules closed'})
 print(json.dumps({'phase':'candidate','files':len(outfiles),'playerWrites':0}))
def prepare(s,m):
 m['preProcesses']=procs(s);m['preReady']={n:ready(s,n,3) for n in NODES};
 expected={'lhs/newServer/src/handlers/activity.js':'8a8b4995946a4b6843299aeac5560073590f0b414c5b4e5ececb6225a03cb664','webgame/game/index.html':'a4595207f6d49811c3cc475c09fa5ada0f78bf43d8bb470296bda81b56b93bcc'}
 for row in m['files']:
  target=REMOTE+'/'+row['relative'];actual=rh(s,target) if exists(s,target) else None
  if row['relative']=='webgame/game/index.html' and actual!=expected[row['relative']]:
   current=s.open_sftp().open(target,'rb').read()
   text=current.decode('utf-8')
   if 'lhs-fulu-safe-v1.js' not in text or 'lhs-event-maintenance-v1.js' not in text: raise RuntimeError('INDEX_REQUIRED_ADDONS_MISSING')
   if 'lhs-draws-safe-v1.js?v=20261007_draws_safe_v1' not in text:
    text=text.replace('"js/lhs-event-maintenance-v1.js?v=20261007_event_gate_v2",','"js/lhs-event-maintenance-v1.js?v=20261007_event_gate_v2",\n\t\t"js/lhs-draws-safe-v1.js?v=20261007_draws_safe_v1",')
    if text==current.decode('utf-8'): text=text.replace('"js/lhs-event-maintenance-v1.js?v=20261007_event_gate_v1",','"js/lhs-event-maintenance-v1.js?v=20261007_event_gate_v1",\n\t\t"js/lhs-draws-safe-v1.js?v=20261007_draws_safe_v1",')
   dest=OUT/'candidate'/row['relative'];dest.write_bytes(text.encode());row['candidate']=sha(dest.read_bytes());row['bytes']=len(dest.read_bytes());m['indexPreimage']=actual;save(m)
  elif row['relative'] in expected and actual!=expected[row['relative']]: raise RuntimeError('BASELINE:'+row['relative']+':'+str(actual))
  if row['relative'].startswith('lhs/newServer/src/handlers/') and actual!='8a8b4995946a4b6843299aeac5560073590f0b414c5b4e5ececb6225a03cb664': raise RuntimeError('ACTIVITY_BASE:'+str(actual))
  data=(OUT/'candidate'/row['relative']).read_bytes();put(s,STAGE+'/candidate/'+row['relative'],data)
  if row['relative'].endswith('.js'):run(s,'node --check '+shlex.quote(STAGE+'/candidate/'+row['relative']))
 m['phase']='prepared';m['preparedAt']=datetime.now(timezone.utc).isoformat();save(m);print(json.dumps({'phase':m['phase'],'ready':7}))
def publish(s,m):
 if m['phase']!='prepared':raise RuntimeError('PREPARE_REQUIRED')
 backup=REMOTE+'/_ai_workbench/backups/draws_3749_20261007_'+datetime.now(timezone.utc).strftime('%H%M%S');run(s,'mkdir -p '+shlex.quote(backup));m['backup']=backup;m['published']=[];save(m)
 for row in m['files']:
  target=REMOTE+'/'+row['relative'];
  if exists(s,target):
   dest=backup+'/'+row['relative'];run(s,'mkdir -p '+shlex.quote(dest.rsplit('/',1)[0])+' && cp -p '+shlex.quote(target)+' '+shlex.quote(dest));
  if row['relative']=='lhs/newServer/src/handlers/activity.js' and rh(s,target)!='8a8b4995946a4b6843299aeac5560073590f0b414c5b4e5ececb6225a03cb664':raise RuntimeError('CAS_ACTIVITY')
 for row in m['files']:
  target=REMOTE+'/'+row['relative'];tmp=target+'.draws.tmp';run(s,'cp '+shlex.quote(STAGE+'/candidate/'+row['relative'])+' '+shlex.quote(tmp)+' && chmod 640 '+shlex.quote(tmp)+' && chown root:www '+shlex.quote(tmp)+' && mv -f '+shlex.quote(tmp)+' '+shlex.quote(target));
  if rh(s,target)!=row['candidate']:raise RuntimeError('PUBLISH_HASH:'+row['relative'])
  m['published'].append(row['relative']);save(m)
 for n in NODES:
  run(s,'pm2 restart '+shlex.quote(n),60);m.setdefault('rollingReady',{})[n]=ready(s,n,30);save(m);print(json.dumps({'server':n,'ready':'ok'}),flush=True)
 m['phase']='published';save(m)
def rolling(s,m):
 if m['phase'] not in ['files_published_pending_rolling','rolling','published']:raise RuntimeError('FILES_NOT_READY')
 for row in m['files']:
  if rh(s,REMOTE+'/'+row['relative'])!=row['candidate']:raise RuntimeError('PRE_ROLL_HASH:'+row['relative'])
 m['phase']='rolling';save(m)
 for n in NODES:
  if n in m.get('rollingReady',{}):continue
  run(s,'pm2 restart '+shlex.quote(n),60);m.setdefault('restarted',[]).append(n);save(m)
  m.setdefault('rollingReady',{})[n]=ready(s,n,30);save(m);print(json.dumps({'server':n,'ready':'ok'}),flush=True)
 m['phase']='published';save(m)
def verify(s,m):
 if any(rh(s,REMOTE+'/'+r['relative'])!=r['candidate'] for r in m['files']):raise RuntimeError('HASH_VERIFY')
 m['finalReady']={n:ready(s,n,3) for n in NODES};m['finalProcesses']=procs(s)
 old={p['name']:p for p in m['preProcesses']};new={p['name']:p for p in m['finalProcesses']}
 if any(new.get(n,{}).get('pid')!=v['pid'] for n,v in old.items() if n not in NODES):raise RuntimeError('UNRELATED_PID_CHANGED')
 m['public']={}
 for row in m['files']:
  if not row['relative'].startswith('webgame/game/'):continue
  url='https://linhhoasu.lol/'+row['relative'].removeprefix('webgame/game/')+'?v=20261007_draws_verify'
  observed=run(s,'curl -fsS --max-time 15 '+shlex.quote(url)+' | sha256sum',25).split()[0]
  if observed!=row['candidate']:raise RuntimeError('PUBLIC_HASH:'+row['relative'])
  m['public'][row['relative']]=observed
 m['phase']='verified_qa_pending';m['result']='PASS';m['verifiedAt']=datetime.now(timezone.utc).isoformat();save(m);print(json.dumps({'phase':m['phase'],'ready':7,'backup':m['backup'],'playerWrites':0}))
def rollback(s,m):
 if not m.get('backup'):raise RuntimeError('NO_BACKUP')
 for row in m['files']:
  target=REMOTE+'/'+row['relative'];src=m['backup']+'/'+row['relative']
  if not exists(s,src):continue
  if rh(s,target)!=row['candidate']:raise RuntimeError('ROLLBACK_CAS:'+row['relative'])
  tmp=target+'.draws.restore';run(s,'cp -p '+shlex.quote(src)+' '+shlex.quote(tmp)+' && mv -f '+shlex.quote(tmp)+' '+shlex.quote(target))
 for n in NODES:run(s,'pm2 restart '+shlex.quote(n),60);ready(s,n,30)
 m['phase']='rolled_back';save(m);print(json.dumps({'phase':m['phase'],'playerWrites':0}))
if __name__=='__main__':
 action=sys.argv[1]
 if action=='build':build()
 else:
  m=json.loads(MAN.read_text(encoding='utf-8-sig'));s=connect()
  try:{'prepare':prepare,'publish':publish,'rolling':rolling,'verify':verify,'rollback':rollback}[action](s,m)
  except Exception as e:m['lastError']=str(e);save(m);raise
  finally:s.close()
