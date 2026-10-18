"""Stage/tests first; deploy only with a recorded passing stage manifest."""
from pathlib import Path
import importlib.util,hashlib,json,shlex,time,sys,paramiko
sys.stdout.reconfigure(encoding='utf8',errors='replace')
ROOT=Path(__file__).resolve().parents[1];LOCAL=ROOT/'temp/drop100_release_20260914';APP='/linhhoasu/lhs/newServer'
STATE=LOCAL/'release.json'
def sha(b):return hashlib.sha256(b).hexdigest()
def run(s,c,check=True):
 _,o,e=s.exec_command(c,timeout=120);out=o.read().decode('utf8','replace');err=e.read().decode('utf8','replace');rc=o.channel.recv_exit_status()
 if check and rc:raise RuntimeError(f'exit{rc}: {err[-1500:]} {out[-1500:]}')
 return out,err,rc
def node(s,js):return run(s,'node -e '+shlex.quote(js))[0]
def inventory(s):return json.loads(node(s,"const cp=require('child_process');console.log(JSON.stringify(JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8'})).map(p=>({name:p.name,pid:p.pid,status:p.pm2_env.status,restarts:p.pm2_env.restart_time,enabled:p.pm2_env.env?.DROP_LEVEL_100_ENABLED||null}))));"))
def main():
 mode=sys.argv[1] if len(sys.argv)>1 else 'stage';assert mode in ['stage','test','deploy','postcheck']
 sp=importlib.util.spec_from_file_location('access',ROOT/'tools/diagnose_auto_delegate_tier_remote.py');access=importlib.util.module_from_spec(sp);sp.loader.exec_module(access)
 s=paramiko.SSHClient();s.set_missing_host_key_policy(paramiko.AutoAddPolicy());s.connect(access.HOST,username=access.USER,password=access.PASSWORD,look_for_keys=False,allow_agent=False,timeout=20)
 report=json.loads(STATE.read_text(encoding='utf8')) if mode!='stage' else {}
 try:
  if mode=='stage':
   stamp=time.strftime('%Y%m%d_%H%M%S',time.gmtime());stage='/linhhoasu/_ai_workbench/temp/drop100_'+stamp;backup='/linhhoasu/_ai_workbench/backups/drop100_'+stamp
   report.update(stage=stage,backup=backup,status='STAGING',realPlayerWrites=0,before=inventory(s),files={})
   run(s,'mkdir -p '+shlex.quote(stage)+' '+shlex.quote(backup))
   expected={r['remote']:r['sha256'] for r in json.loads((LOCAL/'snapshot.json').read_text(encoding='utf8'))['files']}
   expected[APP+'/ecosystem.config.js']=sha((LOCAL/'remote_ecosystem.config.js').read_bytes())
   entries=json.loads((LOCAL/'candidate/candidate.json').read_text(encoding='utf8'))['files']
   targets=[('candidate/'+r['path'],APP+'/'+r['path']) for r in entries]
   targets += [('main.min_drop100.js','/linhhoasu/webgame/game/js/main.min_drop100.js'),('index_drop100.html','/linhhoasu/webgame/game/index.html')]
   with s.open_sftp() as sf:
    def mkdir(p):
     try:sf.stat(p)
     except FileNotFoundError:mkdir(p.rsplit('/',1)[0]);sf.mkdir(p)
    # Small targeted evidence, no dependencies or full repository copy.
    fixtures=[p for p in (LOCAL/'linhhoasu').rglob('*') if p.is_file() and p.suffix in ['.js','.bin']]
    fixtures += [p for p in (LOCAL/'candidate').rglob('*') if p.is_file()]+[LOCAL/'client_function.js']
    for p in fixtures:
     target=stage+'/'+p.relative_to(LOCAL).as_posix();mkdir(target.rsplit('/',1)[0]);sf.put(str(p),target)
    for src,dst in [('test_drop100_20260914.js','test.js'),('test_drop100_mongo_20260914.js','test_mongo.js')]:sf.put(str(ROOT/'tools'/src),stage+'/'+dst)
    mkdir(stage+'/publish')
    for rel,target in targets:
     try:
      with sf.open(target,'rb') as f:before=f.read()
      actual=sha(before)
     except FileNotFoundError:before=None;actual=None
     if actual!=expected.get(target):raise RuntimeError('CAS '+target)
     staged=stage+'/publish/'+Path(target).name;sf.put(str(LOCAL/rel),staged)
     sf.chmod(staged,0o644 if not target.endswith('ecosystem.config.js') else 0o600)
     back=backup+'/'+Path(target).name+'.before'
     if before is not None:
      with sf.open(back,'wb') as f:f.write(before)
      sf.chmod(back,0o600)
     report['files'][target]={'before':actual,'after':sha((LOCAL/rel).read_bytes()),'staged':staged,'backup':back if before else None}
   for p,r in report['files'].items():
    if p.endswith('.js'):run(s,'node --check '+shlex.quote(r['staged']))
   out,err,rc=run(s,'DROP100_ROOT='+shlex.quote(stage)+' DROP100_APP='+shlex.quote(APP)+' node '+shlex.quote(stage+'/test.js'))
   report['fixture']=json.loads(out[out.index('{\n  "result":'):]);assert report['fixture']['result']=='PASS'
   report['mongoTests']=[]
   for sid in [1001,1002,1003]:
    code="const cp=require('child_process');const p=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8'})).find(p=>p.name==='lhs-s"+str(sid)+"');const r=cp.spawnSync(process.execPath,["+json.dumps(stage+'/test_mongo.js')+"],{cwd:"+json.dumps(APP)+",env:{...process.env,...p.pm2_env.env,DROP_LEVEL_100_ENABLED:'1',DROP100_ROOT:"+json.dumps(stage)+"},encoding:'utf8',timeout:95000});process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');process.exit(r.status===null?1:r.status);"
    out=node(s,code);result=json.loads(out[out.index('{'):]);assert result['result']=='PASS' and result['cleaned'];report['mongoTests'].append(result)
   report['status']='STAGED_TESTED'
  elif mode=='test':
   stage=report['stage']
   with s.open_sftp() as sf:
    sf.put(str(ROOT/'tools/test_drop100_20260914.js'),stage+'/test.js')
    sf.put(str(ROOT/'tools/test_drop100_mongo_20260914.js'),stage+'/test_mongo.js')
    sf.put(str(LOCAL/'client_function.js'),stage+'/client_function.js')
    sf.put(str(LOCAL/'main.min_drop100.js'),report['files']['/linhhoasu/webgame/game/js/main.min_drop100.js']['staged'])
    report['files']['/linhhoasu/webgame/game/js/main.min_drop100.js']['after']=sha((LOCAL/'main.min_drop100.js').read_bytes())
   out,err,rc=run(s,'DROP100_ROOT='+shlex.quote(stage)+' DROP100_APP='+shlex.quote(APP)+' node '+shlex.quote(stage+'/test.js'))
   report['fixture']=json.loads(out[out.index('{\n  "result":'):]);assert report['fixture']['result']=='PASS'
   report['mongoTests']=[]
   for sid in [1001,1002,1003]:
    code="const cp=require('child_process');const p=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8'})).find(p=>p.name==='lhs-s"+str(sid)+"');const r=cp.spawnSync(process.execPath,["+json.dumps(stage+'/test_mongo.js')+"],{cwd:"+json.dumps(APP)+",env:{...process.env,...p.pm2_env.env,DROP_LEVEL_100_ENABLED:'1',DROP100_ROOT:"+json.dumps(stage)+"},encoding:'utf8',timeout:95000});process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');process.exit(r.status===null?1:r.status);"
    out=node(s,code);result=json.loads(out[out.index('{'):]);assert result['result']=='PASS' and result['cleaned'];report['mongoTests'].append(result)
    STATE.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
   report['status']='STAGED_TESTED'
  elif mode=='deploy':
   assert report['status']=='STAGED_TESTED'
   # Only frozen staged candidate hashes may be published.
   node(s,"const fs=require('fs'),c=require('crypto'),sha=p=>fs.existsSync(p)?c.createHash('sha256').update(fs.readFileSync(p)).digest('hex'):null;for(const[p,r]of Object.entries("+json.dumps(report['files'])+")){if(sha(p)!==r.before||sha(r.staged)!==r.after)throw Error('CAS '+p)}console.log('CAS_PASS');")
   # Keep old UI until every authoritative node can accept the new levels.
   # Publishing the index first would expose 46+ on old S2/S3 handlers.
   indexPath='/linhhoasu/webgame/game/index.html'
   for p,r in report['files'].items():
    if p!=indexPath:run(s,'mv -- '+shlex.quote(r['staged'])+' '+shlex.quote(p))
   report['published']=True;report['readiness']={}
   for name,port in [('lhs-s1001',8080),('lhs-s1002',8083),('lhs-s1003',8084)]:
    run(s,'DROP_LEVEL_100_ENABLED=1 pm2 reload '+name+' --update-env');deadline=time.monotonic()+55
    while True:
     out,_,_=run(s,"curl -s -o /dev/null -w '%{http_code}' --max-time 3 http://127.0.0.1:"+str(port)+'/ready',False)
     if out=='200':break
     if time.monotonic()>deadline:raise RuntimeError('READY_TIMEOUT '+name)
     time.sleep(2)
    report['readiness'][name]=out
   report['after']=inventory(s)
   old={p['name']:p for p in report['before']}
   for p in report['after']:
    if p['name'] in ['lhs-s1001','lhs-s1002','lhs-s1003']:assert p['enabled']=='1' and p['status']=='online'
    elif p['name'] in old:assert old[p['name']]['pid']==p['pid'],'unrelated PID '+p['name']
   r=report['files'][indexPath]
   run(s,'mv -- '+shlex.quote(r['staged'])+' '+shlex.quote(indexPath))
   node(s,"const fs=require('fs'),c=require('crypto');for(const[p,r]of Object.entries("+json.dumps(report['files'])+")){if(c.createHash('sha256').update(fs.readFileSync(p)).digest('hex')!==r.after)throw Error('READBACK '+p)}console.log('READBACK_PASS');")
   node(s,"const fs=require('fs'),cp=require('child_process');fs.copyFileSync('/root/.pm2/dump.pm2',"+json.dumps(report['backup']+'/pm2-dump.before')+");cp.execFileSync('pm2',['save']);console.log('PM2_SAVED');")
   report['status']='DEPLOYED_ALL_THREE'
  else:
   report['now']=inventory(s)
   checks=node(s,"const cp=require('child_process'),c=require('crypto');const out={};for(const p of ['/index.html','/js/main.min_drop100.js?v=20260914_drop100_v1']){const b=cp.execFileSync('curl',['-sS','--fail','--max-time','15','http://127.0.0.1:81'+p],{maxBuffer:15000000});out[p]={bytes:b.length,sha256:c.createHash('sha256').update(b).digest('hex')}}console.log(JSON.stringify(out));")
   report['served']=json.loads(checks)
   assert report['served']['/index.html']['sha256']==report['files']['/linhhoasu/webgame/game/index.html']['after']
   assert report['served']['/js/main.min_drop100.js?v=20260914_drop100_v1']['sha256']==report['files']['/linhhoasu/webgame/game/js/main.min_drop100.js']['after']
   report['postcheck']='PASS'
 except Exception as e:report['error']=str(e);raise
 finally:STATE.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');s.close()
 print(json.dumps({'mode':mode,'status':report['status'],'backup':report['backup'],'tests':report.get('fixture',{}).get('checks'),'mongoServers':[r['serverId'] for r in report.get('mongoTests',[])]}))
if __name__=='__main__':main()
