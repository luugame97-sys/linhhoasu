"""Independent read-only postdeploy audit for the 365-day linkage release."""
import hashlib,json,os,shlex
from datetime import datetime,timezone
from pathlib import Path
import paramiko
ROOT=Path(__file__).resolve().parents[1];C=ROOT/'temp/linkage365_candidate_20260904';APP='/linhhoasu/lhs/newServer';WEB='/linhhoasu/webgame/game';START=1788517080000;END=1820053080000
FILES={APP+'/src/handlers/serverList.js':C/'server/serverList.js',APP+'/src/handlers/serverList1.js':C/'server/serverList1.js','/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin':C/'config/server/config_e5ac72c2.bin',WEB+'/update/resource/assets/excel/config_e5ac72c2.bin':C/'config/client/config_e5ac72c2.bin',WEB+'/js/start.min_52ac8d58.js':C/'client/js/start.min_52ac8d58.js',WEB+'/index.html':C/'client/index.html'}
def dg(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def run(s,c,timeout=180):
 _,o,e=s.exec_command(c,timeout=timeout);out=o.read().decode('utf8','replace');err=e.read().decode('utf8','replace');code=o.channel.recv_exit_status()
 if code:raise RuntimeError((err+out)[-8000:])
 return out
def main():
 expected={r:dg(l) for r,l in FILES.items()};creds=Path(os.environ['LHS_PROD_CREDENTIAL_FILE']).read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(creds[0].strip(),username='root',password=creds[2],look_for_keys=False,allow_agent=False,timeout=20)
 try:
  hashes={r:run(s,'sha256sum '+shlex.quote(r)).split()[0] for r in FILES};served={'config':run(s,'curl -fsS http://127.0.0.1:81/update/resource/assets/excel/config_e5ac72c2.bin | sha256sum').split()[0],'start':run(s,'curl -fsS http://127.0.0.1:81/js/start.min_52ac8d58.js | sha256sum').split()[0],'index':run(s,'curl -fsS http://127.0.0.1:81/')}
  runtime=json.loads(run(s,'cd '+APP+' && node -e '+shlex.quote("const C=require('./src/services/ConfigService');C.loadAllTables();const x=C.get('ActivityBaseConfig'),S=require('./src/handlers/serverList').handleReqParams({keyList:['linkage']});console.log(JSON.stringify({cfg:{start:x.linkageStartTime,end:x.linkageEndTime,mapId:x.mapId},param:JSON.parse(S.param.linkage),now:Date.now()}))")).strip().splitlines()[-1]);
  pjs='let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.stringify(JSON.parse(s).filter(p=>["lhs-s1001","lhs-s1002","lhs-real-bots","lhs-real-bots-s2","lhs-dist","lhs-admin"].includes(p.name)).map(p=>({name:p.name,pid:p.pid,status:p.pm2_env.status,restarts:p.pm2_env.restart_time})))))';pm2=json.loads(run(s,'pm2 jlist | node -e '+shlex.quote(pjs)))
  hjs='let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{let x=JSON.parse(s),r=x.runtime||{},b=r.bots||{},m=r.mapMonsters||{};console.log(JSON.stringify({status:x.status,real:Number((b.real||{}).count)||0,virtual:Number(b.botCount)||0,totalSlots:Number(m.totalSlots)||0,multiplier:Number(m.densityMultiplier)||0,invalid:Number(m.invalid)||0}))})';health=[]
  for name,port in [('S1',9200),('S2',9201)]:x=json.loads(run(s,'curl -fsS http://127.0.0.1:'+str(port)+'/health | node -e '+shlex.quote(hjs)));x['server']=name;health.append(x)
  ready={name:int(run(s,"curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:"+str(port)+'/ready').strip()) for name,port in [('S1',8080),('S2',8083)]};errors=run(s,"for f in /root/.pm2/logs/lhs-s1001-error.log /root/.pm2/logs/lhs-s1002-error.log /root/.pm2/logs/lhs-real-bots-error.log /root/.pm2/logs/lhs-real-bots-s2-error.log;do tail -150 \"$f\"|grep -Ei 'uncaught|unhandled|SyntaxError|TypeError|ReferenceError|invalid_target'|tail -10||true;done").strip()
  checks={'hashes':hashes==expected,'servedConfig':served['config']==expected[WEB+'/update/resource/assets/excel/config_e5ac72c2.bin'],'servedStart':served['start']==expected[WEB+'/js/start.min_52ac8d58.js'],'servedMarker':'20260904_linkage365_v1' in served['index'],'window':runtime['cfg']=={'start':START,'end':END,'mapId':990008} and runtime['param']=={'index':7,'start':START,'end':END} and START<=runtime['now']<END and END-START==365*86400000,'pm2Online':len(pm2)==6 and all(x['status']=='online' for x in pm2),'ready200':ready=={'S1':200,'S2':200},'health':all(x['status']=='ok' and x['real']==580 and x['virtual']==580 and x['totalSlots']==2466 and x['multiplier']==2 and x['invalid']==0 for x in health),'errorsEmpty':errors==''}
  payload={'result':'PASS' if all(checks.values()) else 'FAIL','generatedAt':datetime.now(timezone.utc).isoformat(),'checks':checks,'hashes':hashes,'served':{k:v for k,v in served.items() if k!='index'},'runtime':runtime,'pm2':pm2,'ready':ready,'health':health,'recentErrors':errors};out=ROOT/'temp/linkage365_postdeploy_20260904.json';out.write_text(json.dumps(payload,indent=2)+'\n',encoding='utf8');print(json.dumps({'result':payload['result'],'evidence':str(out),'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'checks':checks}));
  if payload['result']!='PASS':raise SystemExit(1)
 finally:s.close()
if __name__=='__main__':main()
