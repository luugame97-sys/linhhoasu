"""Staged, CAS-scoped S1 release. Never use the superseded v1 deploy scripts."""
from pathlib import Path
import importlib.util, hashlib, json, shlex, sys, time
import paramiko
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT=Path(__file__).resolve().parents[1]
LOCAL=ROOT/'temp/drop46_release_20260914'
APP='/linhhoasu/lhs/newServer'
FILES={
 'candidate/src/services/DropLevel46Service.js':(APP+'/src/services/DropLevel46Service.js',None),
 'candidate/src/handlers/compat.js':(APP+'/src/handlers/compat.js','d3d832da0fe39935f3299172bee5fcd53d09a19e6ded9e00e8e46bce5d6ea4f5'),
 'main.min_drop46_s1.js':('/linhhoasu/webgame/game/js/main.min_drop46_s1.js','23c5ccdd0800506ccc4f94d7833ff41e0d9dc21d6828ec7690e0687d93073f7b'),
 'index_drop46_s1.html':('/linhhoasu/webgame/game/index.html','1191cb1f2d77acdd73e3925a574433ac32a481c73a9a533fdd19087e1f3b74ed'),
}
def sha(b):return hashlib.sha256(b).hexdigest()
def run(s,command,check=True):
 _,o,e=s.exec_command(command,timeout=75);out=o.read().decode('utf8','replace');err=e.read().decode('utf8','replace');code=o.channel.recv_exit_status()
 if check and code:raise RuntimeError(f'command failed ({code}): {err[-1200:]} {out[-1200:]}')
 return out,err,code
def node(s,js):return run(s,'node -e '+shlex.quote(js))[0]
def inventory(s):
 return json.loads(node(s,"const cp=require('child_process');console.log(JSON.stringify(JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8'})).map(p=>({name:p.name,pid:p.pid,status:p.pm2_env.status,restarts:p.pm2_env.restart_time,drop:(p.pm2_env.env||{}).DROP_LEVEL_46_ENABLED||null}))));"))
def main():
 spec=importlib.util.spec_from_file_location('access',ROOT/'tools/diagnose_auto_delegate_tier_remote.py');access=importlib.util.module_from_spec(spec);spec.loader.exec_module(access)
 ssh=paramiko.SSHClient();ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy());ssh.connect(access.HOST,username=access.USER,password=access.PASSWORD,look_for_keys=False,allow_agent=False,timeout=20)
 stamp=time.strftime('%Y%m%d_%H%M%S',time.gmtime());stage='/linhhoasu/_ai_workbench/temp/drop46_verified_'+stamp;backup='/linhhoasu/_ai_workbench/backups/drop46_verified_'+stamp
 report={'stage':stage,'backup':backup,'realPlayerWrites':0,'files':{},'status':'STAGING'}
 published=[]
 try:
  report['before']=inventory(ssh)
  run(ssh,'mkdir -p '+shlex.quote(stage)+' '+shlex.quote(backup))
  # Exact snapshots + only data needed by the fixture (no DB connection).
  with ssh.open_sftp() as sf:
   def mkdir(p):
    try:sf.stat(p)
    except FileNotFoundError:mkdir(str(Path(p).parent).replace('\\','/'));sf.mkdir(p)
   fixtures=[p for p in (LOCAL/'linhhoasu').rglob('*') if p.is_file() and p.suffix in ['.js','.bin']]
   fixtures += [LOCAL/'candidate/src/config/dropLevel46.js',LOCAL/'candidate/src/services/DropLevel46Service.js',LOCAL/'client_drop46_function.js']
   for p in fixtures:
    rel=p.relative_to(LOCAL).as_posix();dest=stage+'/'+rel;mkdir(dest.rsplit('/',1)[0]);sf.put(str(p),dest)
   sf.put(str(ROOT/'tools/test_drop46_release_20260914.js'),stage+'/test.js')
   for rel,(target,expected) in FILES.items():
    try:b=sf.open(target,'rb').read();actual=sha(b)
    except FileNotFoundError:b=None;actual=None
    if actual!=expected:raise RuntimeError('CAS '+target+' actual='+str(actual))
    dest=stage+'/publish/'+Path(target).name;mkdir(stage+'/publish');sf.put(str(LOCAL/rel),dest);sf.chmod(dest,0o644)
    if b is not None:
     with sf.open(backup+'/'+Path(target).name+'.before','wb') as f:f.write(b)
    report['files'][target]={'before':actual,'after':sha((LOCAL/rel).read_bytes()),'staged':dest}
  for target,row in report['files'].items():
   if target.endswith('.js'):run(ssh,'node --check '+shlex.quote(row['staged']))
  out,err,_=run(ssh,'DROP46_ROOT='+shlex.quote(stage)+' DROP46_APP='+shlex.quote(APP)+' node '+shlex.quote(stage+'/test.js'))
  report['remoteFixture']=json.loads(out)
  assert report['remoteFixture']['result']=='PASS'
  # Recheck ALL targets immediately before the first rename.
  node(ssh,"const fs=require('fs'),c=require('crypto');const rows="+json.dumps(report['files'])+";for(const [p,r]of Object.entries(rows)){const h=fs.existsSync(p)?c.createHash('sha256').update(fs.readFileSync(p)).digest('hex'):null;if(h!==r.before)throw Error('CAS '+p)}console.log('CAS_PASS')")
  for target,row in report['files'].items():
   run(ssh,'mv -- '+shlex.quote(row['staged'])+' '+shlex.quote(target));published.append(target)
  run(ssh,'DROP_LEVEL_46_ENABLED=1 pm2 reload lhs-s1001 --update-env')
  deadline=time.monotonic()+55
  while True:
   out,_,_=run(ssh,"curl -s -o /dev/null -w '%{http_code}' --max-time 3 http://127.0.0.1:8080/ready",False)
   if out=='200':break
   if time.monotonic()>deadline:raise RuntimeError('S1 readiness timeout')
   time.sleep(2)
  report['readyS1']=out;report['after']=inventory(ssh)
  old={p['name']:p for p in report['before']};new={p['name']:p for p in report['after']}
  for name in old:
   if name!='lhs-s1001':assert old[name]['pid']==new[name]['pid'],name+' unexpectedly restarted'
  assert new['lhs-s1001']['drop']=='1'
  report['readback']=json.loads(node(ssh,"const fs=require('fs'),c=require('crypto');const rows="+json.dumps(report['files'])+";const out={};for(const[p,r]of Object.entries(rows)){const h=c.createHash('sha256').update(fs.readFileSync(p)).digest('hex');if(h!==r.after)throw Error('HASH '+p);out[p]=h}console.log(JSON.stringify(out));"))
  report['status']='RELEASED_S1_V2'
 except Exception as error:
  report['error']=str(error);report['status']='FAILED_REQUIRES_READBACK';raise
 finally:
  (LOCAL/'release_verified.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
  ssh.close()
 print(json.dumps({'status':report['status'],'backup':backup,'readyS1':report.get('readyS1'),'tests':report.get('remoteFixture',{}).get('checks'),'unchangedOtherPids':True}))
if __name__=='__main__':main()
