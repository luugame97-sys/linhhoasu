"""Final read-only source/health/cleanup gates and source-only gear package."""
import hashlib,json,sys,zipfile
from datetime import datetime,timezone
import paramiko
from release_fishing_gear_20260906 import WB,ROOT,APP,FILES,run,node,hashes,ready,pm2
sys.stdout.reconfigure(encoding='utf-8');deploy=json.loads((ROOT/'deploy.json').read_text());stage=json.loads((ROOT/'stage.json').read_text());c=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(c[0].strip(),username='root',password=c[2],look_for_keys=False,allow_agent=False,timeout=20)
try:
 f=s.open_sftp();f.put(str(WB/'tools/test_fishing_gear_fix_20260906.js'),deploy['stage']+'/tools/test_fishing_gear_fix_20260906.js');f.close()
 tests=json.loads(run(s,f"NODE_PATH={APP}/node_modules FISH_ACORN_PATH={deploy['stage']}/tools/acorn.js GEAR_BASELINE_RUNTIME={deploy['stage']}/gear-fixtures.json node {deploy['stage']}/tools/test_fishing_gear_fix_20260906.js {deploy['stage']}",timeout=60));assert tests['result']=='PASS';(ROOT/'final-staging-tests.json').write_text(json.dumps(tests,indent=2)+'\n')
 expected={**stage['baseline'],**deploy['expected']};assert hashes(s,list(expected))==expected
 out={'checkedAt':datetime.now(timezone.utc).isoformat(),'gearTests':tests['count'],'matrixCases':tests['matrixCases'],'trackedHashes':len(expected),'releaseFiles':len(deploy['expected']),'ready':ready(s),'pm2':pm2(s),'liveQa':deploy['liveQa']};assert out['ready']=={'8080':200,'8083':200};assert out['pm2']==deploy['afterPm2']
 out['qaRemaining']=node(s,"""const{MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');(async()=>{const c=new MongoClient('mongodb://127.0.0.1:27017');await c.connect();let n=0;for(const db of ['lhs_s1001','lhs_s1002'])n+=await c.db(db).collection('players').countDocuments({userId:/^qa_gear_/});await c.close();console.log(JSON.stringify(n));})().catch(e=>{console.error(e.name);process.exitCode=1})""");assert out['qaRemaining']==0
 out['localMatches']={rel:(WB.parent/'linhhoasu/lhs/newServer'/rel).read_text(encoding='utf-8')==(ROOT/'app'/rel).read_text(encoding='utf-8')for rel in FILES};assert all(out['localMatches'].values())
 for name,rel,key in [('main','js/main.min_a6195824.js','clientHash'),('index','','indexHash')]:
  out['served'+name]=run(s,'curl -fsS --max-time 15 http://127.0.0.1:81/'+rel+' | sha256sum').split()[0];assert out['served'+name]==stage[key]
 out['wsReady']={str(p):json.loads(run(s,f'curl -fsS --max-time 6 http://127.0.0.1:{p}/ready'))['status']for p in [9200,9201]};assert all(v=='ok'for v in out['wsReady'].values())
 out['errorTail']=run(s,'tail -n 35 /root/.pm2/logs/lhs-s1001-error.log /root/.pm2/logs/lhs-s1002-error.log')
 package=ROOT/'fishing_gear_fix_v1_20260906.zip'
 with zipfile.ZipFile(package,'w',zipfile.ZIP_DEFLATED)as z:
  for rel in FILES:z.write(ROOT/'app'/rel,'newServer/'+rel)
  z.write(ROOT/'main.fixed.js','game/js/main.min_a6195824.js');z.write(ROOT/'index.fixed.html','game/index.html')
  z.writestr('manifest.json',json.dumps({'requires':'fishing_custom_balance_v1','version':'20260906_fishing_gear_v1','hashes':deploy['expected'],'historicalRepair':False,'compensation':False},indent=2))
 out['package']={'path':str(package),'sha256':hashlib.sha256(package.read_bytes()).hexdigest(),'bytes':package.stat().st_size,'entries':6};out['result']='PASS';(ROOT/'final-check.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps({k:v for k,v in out.items()if k!='errorTail'}))
finally:s.close()
