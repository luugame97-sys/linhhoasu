"""Read-only final gates and source-only package for custom fishing balance."""
import hashlib,json,sys,zipfile
from datetime import datetime,timezone
import paramiko
from release_fishing_balance_20260906 import WB,ROOT,APP,FILES,run,node,hashes,ready,pm2
sys.stdout.reconfigure(encoding='utf-8');deploy=json.loads((ROOT/'deploy.json').read_text());stage=json.loads((ROOT/'stage.json').read_text());c=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(c[0].strip(),username='root',password=c[2],look_for_keys=False,allow_agent=False,timeout=20)
try:
 f=s.open_sftp();f.put(str(WB/'tools/test_fishing_balance_20260906.js'),deploy['stage']+'/tools/test_fishing_balance_20260906.js');f.put(str(ROOT/'main.fixed.js'),deploy['stage']+'/main.fixed.js');f.close()
 final_tests=json.loads(run(s,f"NODE_PATH={APP}/node_modules FISH_ACORN_PATH={deploy['stage']}/tools/acorn.js node {deploy['stage']}/tools/test_fishing_balance_20260906.js {deploy['stage']}",timeout=60));assert final_tests['result']=='PASS';(ROOT/'final-staging-tests.json').write_text(json.dumps(final_tests,indent=2)+'\n')
 expected={**stage['baseline'],**deploy['expected']};assert hashes(s,list(expected))==expected
 out={'checkedAt':datetime.now(timezone.utc).isoformat(),'stagingTests':final_tests['count'],'trackedHashes':len(expected),'releaseFiles':len(deploy['expected']),'ready':ready(s),'pm2':pm2(s)};assert out['ready']=={'8080':200,'8083':200};assert out['pm2']==deploy['afterPm2']
 out['qaRemaining']=node(s,"""const{MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');(async()=>{const c=new MongoClient('mongodb://127.0.0.1:27017');await c.connect();let n=0;for(const db of ['lhs_s1001','lhs_s1002'])n+=await c.db(db).collection('players').countDocuments({userId:/^qa_fish_balance_/});await c.close();console.log(JSON.stringify(n));})().catch(e=>{console.error(e.name);process.exitCode=1})""");assert out['qaRemaining']==0
 out['localMatches']={rel:(WB.parent/'linhhoasu/lhs/newServer'/rel).read_text(encoding='utf-8')==(ROOT/'app'/rel).read_text(encoding='utf-8')for rel in FILES};assert all(out['localMatches'].values())
 for kind,url,wanted in [('main','js/main.min_a6195824.js',stage['clientHash']),('index','',stage['indexHash'])]:
  out['served'+kind]=run(s,'curl -fsS --max-time 15 http://127.0.0.1:81/'+url+' | sha256sum').split()[0];assert out['served'+kind]==wanted
 out['wsReady']={str(p):json.loads(run(s,f'curl -fsS --max-time 5 http://127.0.0.1:{p}/ready'))['status'] for p in [9200,9201]};assert all(x=='ok'for x in out['wsReady'].values())
 package=ROOT/'fishing_custom_balance_v1_20260906.zip'
 with zipfile.ZipFile(package,'w',zipfile.ZIP_DEFLATED)as z:
  for rel in FILES:z.write(ROOT/'app'/rel,'newServer/'+rel)
  z.write(ROOT/'main.fixed.js','game/js/main.min_a6195824.js');z.write(ROOT/'index.fixed.html','game/index.html')
  z.writestr('manifest.json',json.dumps({'requires':'fishing_bait_order_soul_v2','version':'lhs-fishing-custom-20260906-v1','hashes':deploy['expected'],'noCompensation':True,'officialOdds':False,'opened':['wash','box94821-94825'],'notIncluded':['Homeland fragment activation','soul RNG rework']},indent=2))
 out['package']={'path':str(package),'sha256':hashlib.sha256(package.read_bytes()).hexdigest(),'bytes':package.stat().st_size,'entries':9};out['result']='PASS';(ROOT/'final-check.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out))
finally:s.close()
