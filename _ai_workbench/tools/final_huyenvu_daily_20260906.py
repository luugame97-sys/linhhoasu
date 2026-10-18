"""Read-only final deployment checks and source-only package for daily card fix."""
import hashlib,json,sys,zipfile
from datetime import datetime,timezone
import paramiko
from release_huyenvu_daily_20260906 import WB,ROOT,APP,FILES,run,node,hashes,ready,pm2
sys.stdout.reconfigure(encoding='utf-8');deploy=json.loads((ROOT/'deploy.json').read_text());stage=json.loads((ROOT/'stage.json').read_text());c=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(c[0].strip(),username='root',password=c[2],look_for_keys=False,allow_agent=False,timeout=20)
try:
 expected={**stage['baseline'],**deploy['expected']};assert hashes(s,list(expected))==expected
 out={'checkedAt':datetime.now(timezone.utc).isoformat(),'trackedHashes':len(expected),'releaseFiles':len(deploy['expected']),'ready':ready(s),'pm2':pm2(s),'liveQa':deploy['liveQa']};assert out['ready']=={'8080':200,'8083':200};assert out['pm2']==deploy['afterPm2']
 out['qaRemaining']=node(s,"""const{MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');(async()=>{const c=new MongoClient('mongodb://127.0.0.1:27017');await c.connect();let n=0;for(const db of ['lhs_s1001','lhs_s1002'])n+=await c.db(db).collection('players').countDocuments({userId:/^qa_huyenvu_/});await c.close();console.log(JSON.stringify(n));})().catch(e=>{console.error(e.name);process.exitCode=1})""");assert out['qaRemaining']==0
 local=(WB.parent/'linhhoasu/lhs/newServer/src/handlers/commerce-compat.js').read_text(encoding='utf-8')
 candidate=(ROOT/'app/src/handlers/commerce-compat.js').read_text(encoding='utf-8')
 local=local.replace('const saved = await playerService.savePlayer(session.userId, player);','const saved = await playerService.savePlayer(session.userId, player, { returnSaved: false });')
 assert local==candidate,'LOCAL_DAILY_SYNC_MISMATCH';out['localDailyMatches']=True;out['localUnrelatedSaveHelperPreserved']=True
 for name,url,key in [('main','js/main.min_a6195824.js','clientHash'),('index','','indexHash')]:
  out['served'+name]=run(s,'curl -fsS --max-time 15 http://127.0.0.1:81/'+url+' | sha256sum').split()[0];assert out['served'+name]==stage[key]
  disk=WB.parent/'linhhoasu/webgame/game'/('js/main.min_a6195824.js'if name=='main'else'index.html');assert hashlib.sha256(disk.read_bytes()).hexdigest()==stage[key]
 out['wsReady']={str(p):json.loads(run(s,f'curl -fsS --max-time 6 http://127.0.0.1:{p}/ready'))['status']for p in [9200,9201]};assert all(v=='ok'for v in out['wsReady'].values())
 out['errorTail']=run(s,'tail -n 35 /root/.pm2/logs/lhs-s1001-error.log /root/.pm2/logs/lhs-s1002-error.log')
 out['speedOriginalProof']=json.loads((ROOT/'speed-origin-proof.json').read_text(encoding='utf-8'))['nativeSpeedExists']
 out['speedLogicChanged']=False
 package=ROOT/'huyenvu_daily_fix_v1_20260906.zip'
 with zipfile.ZipFile(package,'w',zipfile.ZIP_DEFLATED)as z:
  for rel in FILES:z.write(ROOT/'app'/rel,'newServer/'+rel)
  z.write(ROOT/'main.fixed.js','game/js/main.min_a6195824.js');z.write(ROOT/'index.fixed.html','game/index.html')
  z.writestr('manifest.json',json.dumps({'requires':'fishing_auto_power_v1','version':'20260906_huyenvu_daily_v1','hashes':deploy['expected'],'historicalRepair':False,'compensation':False,'speedLogicChanged':False},indent=2))
 out['package']={'path':str(package),'sha256':hashlib.sha256(package.read_bytes()).hexdigest(),'bytes':package.stat().st_size,'entries':4};out['result']='PASS';(ROOT/'final-check.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps({k:v for k,v in out.items()if k!='errorTail'}))
finally:s.close()
