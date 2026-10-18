"""Read-only final hashes/config/player-state check and source-only release package."""
import hashlib,json,sys,zipfile
from pathlib import Path
from datetime import datetime,timezone
import paramiko
from release_fishing_integrity_20260906 import WB,ROOT,APP,FILES,run,node,hashes,pm2,ready
sys.stdout.reconfigure(encoding='utf-8');deploy=json.loads((ROOT/'deploy.json').read_text());stage=json.loads((ROOT/'stage.json').read_text());c=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(c[0].strip(),username='root',password=c[2],look_for_keys=False,allow_agent=False,timeout=20)
out={'checkedAt':datetime.now(timezone.utc).isoformat()}
try:
 expected={**stage['baseline'],**deploy['expected']};assert hashes(s,list(expected))==expected
 out['allTrackedArtifacts']=len(expected);out['unchangedOutsideRelease']=len(expected)-len(deploy['expected']);out['ready']=ready(s);out['pm2']=pm2(s);assert out['ready']=={'8080':200,'8083':200};assert out['pm2']==deploy['afterPm2']
 # Compare only the screenshot subject's fishing state, without printing identifiers.
 current=node(s,"""const{MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');(async()=>{const c=new MongoClient('mongodb://127.0.0.1:27017');await c.connect();const out={};for(const name of ['lhs_s1001','lhs_s1002']){const db=c.db(name);out[name]={qaRemaining:await db.collection('players').countDocuments({userId:/^qa_fish_integrity_/}),fish:(await db.collection('players').findOne({name:/^nicky$/i},{projection:{_id:0,fishInfo:1}}))?.fishInfo||null};}await c.close();console.log(JSON.stringify(out));})().catch(e=>{console.error(e.name);process.exitCode=1});""")
 old=json.loads((WB/'temp/fishing_audit_20260905T232035Z/runtime.json').read_text(encoding='utf-8'));summary={}
 for db,info in current.items():
  rows=[p for p in old[db]['players']if p['isScreenshotPlayer']];summary[db]={'qaRemaining':info['qaRemaining'],'screenshotFishUnchanged':len(rows)==1 and rows[0]['fishInfo']==info['fish'] if rows else info['fish']is None};assert info['qaRemaining']==0
  if rows and info['fish']:
   before=rows[0]['fishInfo'];after=info['fish']
   summary[db]['changedTopLevelFields']=[k for k in set(before)|set(after)if before.get(k)!=after.get(k)]
   summary[db]['slotsUnchanged']=before.get('slots')==after.get('slots')
   summary[db]['pendingUnchanged']=before.get('fishResult')==after.get('fishResult')
   summary[db]['changes']={k:{'before':before.get(k),'after':after.get(k)}for k in summary[db]['changedTopLevelFields']}
 out['playerReadOnlyCheck']=summary
 out['localFilesMatch']={rel:(WB.parent/'linhhoasu/lhs/newServer'/rel).read_text(encoding='utf-8')==(ROOT/'app'/rel).read_text(encoding='utf-8')for rel in FILES};assert all(out['localFilesMatch'].values())
 out['localClientMatch']=hashlib.sha256((WB.parent/'linhhoasu/webgame/game/js/main.min_a6195824.js').read_bytes()).hexdigest()==stage['clientHash'];assert out['localClientMatch']
 package=ROOT/'fishing_integrity_release_20260906.zip'
 with zipfile.ZipFile(package,'w',zipfile.ZIP_DEFLATED)as z:
  for rel in FILES:z.write(ROOT/'app'/rel,'newServer/'+rel)
  z.write(ROOT/'main.fixed.js','game/js/main.min_a6195824.js');z.write(ROOT/'index.fixed.html','game/index.html')
  z.writestr('manifest.json',json.dumps({'version':'20260906_fishing_integrity_v1','hashes':deploy['expected'],'noCompensation':True,'held':['rod wash','order refresh','soul box','occupied soul slot swap'],'rngParity':'not verified'},indent=2))
 out['package']={'path':str(package),'sha256':hashlib.sha256(package.read_bytes()).hexdigest(),'bytes':package.stat().st_size,'entries':8}
 out['result']='PASS';(ROOT/'final-check.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out))
finally:s.close()
