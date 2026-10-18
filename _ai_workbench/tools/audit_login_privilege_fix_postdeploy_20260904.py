"""Independent read-only postdeploy audit for the Activity 9 merge."""
import hashlib,json,os,shlex
from datetime import datetime,timezone
from pathlib import Path
import paramiko
ROOT=Path(__file__).resolve().parents[1];APP='/linhhoasu/lhs/newServer';EXPECTED={APP+'/src/handlers/activity.js':'92f5442cb02dd958b3876a29c9b1cf0388be9e943ff407f7973cd9c109dbd54c',APP+'/src/handlers/account.js':'ecf01d4e92731652c28fe5a7c0722b55cf2d514c6e4bd335d6b310a3520996c5'}
TOOLS=['test_activity9_candidate.js','test_fortune_event_full.js','test_fortune_event_real_config.js','test_fortune_player_consumption_tracking.js']
def run(s,c,timeout=300):
 _,o,e=s.exec_command(c,timeout=timeout);out=o.read().decode('utf8','replace');err=e.read().decode('utf8','replace');code=o.channel.recv_exit_status()
 if code:raise RuntimeError((err+out)[-12000:])
 return out
def main():
 creds=Path(os.environ['LHS_PROD_CREDENTIAL_FILE']).read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(creds[0].strip(),username='root',password=creds[2],look_for_keys=False,allow_agent=False,timeout=20);stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S');stage='/linhhoasu/_ai_workbench/temp/login_privilege_post_'+stamp;out=ROOT/'temp/login_privilege_fix_postdeploy_20260904.json'
 try:
  run(s,'install -d -m 700 '+stage);f=s.open_sftp()
  try:
   for tool in TOOLS:f.put(str(ROOT/'tools'/tool),stage+'/'+tool)
  finally:f.close()
  hashes={p:run(s,'sha256sum '+shlex.quote(p)).split()[0] for p in EXPECTED};markers=json.loads(run(s,'node -e '+shlex.quote("const fs=require('fs'),a=fs.readFileSync('"+APP+"/src/handlers/activity.js','utf8'),c=fs.readFileSync('"+APP+"/src/handlers/account.js','utf8'),n=x=>a.split(x).length-1;console.log(JSON.stringify({import:n(\"require('../services/Activity9Service')\"),handler:n('function operateLoginPrivileges('),branch:n('activityType === 9'),ensure:n('const activity9State = ensureActivity9State(player);'),accountImport:c.split(\"require('../services/Activity9Service')\").length-1,accountChanged:c.split('const activity9Changed =').length-1,fortune43:n('activityType === 43'),fortune44:n('activityType === 44')}))")).strip())
  env='TIEN_DUYEN_CANDIDATE_ROOT=/ TIEN_DUYEN_CLIENT_CONFIG=/linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin TIEN_DUYEN_INDEX=/linhhoasu/webgame/game/index.html TIEN_DUYEN_CLIENT_MAIN=/linhhoasu/webgame/game/js/main.min_a6195824.js '
  tests={'activity9':run(s,'cd '+APP+' && '+env+' node '+stage+'/test_activity9_candidate.js',300).strip()}
  for tool in TOOLS[1:]:tests[tool]=run(s,'cd '+APP+' && FORTUNE_APP_ROOT='+APP+' node '+stage+'/'+tool,300).strip()
  tests['core']=run(s,'cd '+APP+' && npm run test:core-contract',300).strip()
  pjs='let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.stringify(JSON.parse(s).filter(p=>["lhs-s1001","lhs-s1002","lhs-real-bots","lhs-real-bots-s2","lhs-dist","lhs-admin"].includes(p.name)).map(p=>({name:p.name,pid:p.pid,status:p.pm2_env.status,restarts:p.pm2_env.restart_time})))))';pm2=json.loads(run(s,'pm2 jlist | node -e '+shlex.quote(pjs)))
  hjs='let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{let x=JSON.parse(s),r=x.runtime||{},b=r.bots||{},m=r.mapMonsters||{};console.log(JSON.stringify({status:x.status,real:Number((b.real||{}).count)||0,virtual:Number(b.botCount)||0,totalSlots:Number(m.totalSlots)||0,multiplier:Number(m.densityMultiplier)||0,invalid:Number(m.invalid)||0}))})';health=[]
  for name,port in [('S1',9200),('S2',9201)]:x=json.loads(run(s,'curl -fsS http://127.0.0.1:'+str(port)+'/health | node -e '+shlex.quote(hjs)));x['server']=name;health.append(x)
  ready={name:int(run(s,"curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:"+str(port)+'/ready').strip()) for name,port in [('S1',8080),('S2',8083)]};residue=json.loads(run(s,'cd '+APP+' && node -e '+shlex.quote("const {MongoClient}=require('./node_modules/mongodb');(async()=>{const c=new MongoClient('mongodb://127.0.0.1:27017');await c.connect();let out={};for(const d of ['lhs_s1001','lhs_s1002'])out[d]=await c.db(d).collection('players').countDocuments({userId:/^qa_login_priv_/});await c.close();console.log(JSON.stringify(out))})().catch(e=>{console.error(e);process.exit(1)})")).strip());errors=run(s,"for f in /root/.pm2/logs/lhs-s1001-error.log /root/.pm2/logs/lhs-s1002-error.log;do tail -180 \"$f\"|grep -Ei 'uncaught|unhandled|SyntaxError|TypeError|ReferenceError|Activity9'|tail -12||true;done").strip()
  checks={'hashes':hashes==EXPECTED,'markers':all(markers[k]==1 for k in ['import','handler','branch','ensure','accountImport','accountChanged']) and markers['fortune43']>=1 and markers['fortune44']>=1,'activity9':'"sweepOpenDays":3' in tests['activity9'],'fortune':all('PASS' in tests[k] for k in TOOLS[1:]),'core':'"tables":714' in tests['core'],'pm2Online':len(pm2)==6 and all(x['status']=='online' for x in pm2),'ready200':ready=={'S1':200,'S2':200},'health':all(x['status']=='ok' and x['real']==580 and x['virtual']==580 and x['totalSlots']==2466 and x['multiplier']==2 and x['invalid']==0 for x in health),'qaResidueZero':residue=={'lhs_s1001':0,'lhs_s1002':0},'errorsEmpty':errors==''}
  payload={'result':'PASS' if all(checks.values()) else 'FAIL','generatedAt':datetime.now(timezone.utc).isoformat(),'checks':checks,'hashes':hashes,'markers':markers,'tests':tests,'pm2':pm2,'ready':ready,'health':health,'qaResidue':residue,'recentErrors':errors};out.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n',encoding='utf8');print(json.dumps({'result':payload['result'],'evidence':str(out),'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'checks':checks},ensure_ascii=False));
  if payload['result']!='PASS':raise SystemExit(1)
 finally:
  try:run(s,'rm -rf '+shlex.quote(stage))
  except Exception:pass
  s.close()
if __name__=='__main__':main()
