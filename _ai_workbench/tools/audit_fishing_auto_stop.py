"""Focused read-only fishing auto-stop audit. No gameplay RPC or remote files."""
from pathlib import Path
import json, hashlib, re, sys
from release_petsoul_day1_20261007 import connect, run
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'_ai_workbench/temp/fishing_auto_stop_20261012'
APP='/linhhoasu/lhs/newServer'
WEB='/linhhoasu/webgame/game'
sys.stdout.reconfigure(encoding='utf8')
NODE=r"""
const fs=require('fs'),cp=require('child_process'),crypto=require('crypto');
const {MongoClient}=require('./node_modules/mongodb');
const pms=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8',maxBuffer:8e6})).filter(p=>/^lhs-s100[1-8]$/.test(p.name));
const now=Date.now(),cut=new Date(now-3600000),dateText=d=>new Date(d+7*3600000).toISOString().slice(0,19).replace('T',' ');
const start=dateText(cut.getTime()),end=dateText(now);
const digest=x=>crypto.createHash('sha256').update(String(x)).digest('hex').slice(0,10);
const obj=x=>x&&typeof x==='object'?x:{};
function logs(file){
 try{
  const fd=fs.openSync(file,'r'),size=fs.fstatSync(fd).size,len=Math.min(size,4*1024*1024),b=Buffer.alloc(len);
  fs.readSync(fd,b,0,len,size-len);fs.closeSync(fd);
  const rows=b.toString('utf8').split('\n');if(size>len)rows.shift();
  const win=rows.filter(l=>l.startsWith('[')&&l.slice(1,20)>=start&&l.slice(1,20)<=end);
  const relevant=win.filter(l=>/tag[=: ]+(4000|4008)\b|FISH_|Fishing|REQUEST_BURST_BACKPRESSURE|REQUEST_ALREADY_PENDING/.test(l));
  const codes={};for(const l of relevant)for(const x of l.match(/FISH_[A-Z_]+|coalesced duplicate tag=\d+|REQUEST_[A-Z_]+/g)||[])codes[x]=(codes[x]||0)+1;
  return {fileBytes:size,bytesRead:len,coverageStart:rows.find(l=>l.startsWith('['))?.slice(1,20),windowLines:win.length,relevant:relevant.length,codes,
   sample:relevant.slice(-14).map(l=>l.replace(/user=\S+/g,'user=[redacted]').replace(/u_[A-Za-z0-9_]+/g,'[role]').slice(0,500))};
 }catch(e){return{error:e.code||e.name}}
}
(async()=>{
 const nodes=[];
 for(const p of pms){
  const e={...p.pm2_env,...p.pm2_env.env},node={name:p.name,pid:p.pid,status:p.pm2_env.status,uptime:p.pm2_env.pm_uptime,restarts:p.pm2_env.restart_time,logs:logs(p.pm2_env.pm_out_log_path),errors:logs(p.pm2_env.pm_err_log_path)};
  const c=new MongoClient(e.MONGO_URI,{serverSelectionTimeoutMS:4000,socketTimeoutMS:8000,maxPoolSize:1});
  try{
   await c.connect();
   const docs=await c.db().collection('players').find({isBot:{$ne:true},managedBot:{$ne:true},'fishInfo.autoPowerHistory.0':{$exists:true}},
    {projection:{_id:0,userId:1,updatedAt:1,'fishInfo.autoPowerHistory':1,'fishInfo.fishResult':1,'fishInfo.balanceRevision':1},maxTimeMS:5000}).limit(150).toArray();
   const reasons={},recentReasons={};let actions=0,recent=0,heldActions=0;
   const cases=[];
   for(const d of docs){
    const h=d.fishInfo.autoPowerHistory||[];
    for(const a of h){
      actions++;if(a.held?.length)heldActions++;
      const fresh=Number(a.time)>=cut.getTime();if(fresh)recent++;
      for(const r of a.held||[]){reasons[r.reason]=(reasons[r.reason]||0)+1;if(fresh)recentReasons[r.reason]=(recentReasons[r.reason]||0)+1;}
    }
    const last=h.at(-1);if(last?.held?.length && Number(last.time)>=cut.getTime())
      cases.push({role:digest(d.userId),time:last.time,held:last.held.map(x=>x.reason),pending:d.fishInfo.fishResult?.fishInfos?.length||0});
   }
   node.auto={players:docs.length,truncated:docs.length===150,actions,heldActions,recent,reasons,recentReasons,cases:cases.slice(0,8)};
  }catch(err){node.dbError=err.name;}finally{await c.close();}
  nodes.push(node);
 }
 console.log(JSON.stringify({at:new Date(now).toISOString(),window:{start,end,timezone:'UTC+7'},nodes,playerWrites:0,gameplayRpc:0}));
})().catch(e=>{console.error(e.name);process.exitCode=1});
"""
def main():
 OUT.mkdir(parents=True,exist_ok=True)
 s=connect()
 try:
  index=run(s,"curl -fsS --max-time 10 http://127.0.0.1:81/")
  refs=re.findall(r'js/[^"\s]+',index)
  mainref=next(x for x in refs if re.match(r'js/main\.min_drop\d+\.js',x))
  pairs={'main.js':WEB+'/'+mainref.split('?')[0],'WSServer.js':APP+'/src/net/WSServer.js','FishingAutoService.js':APP+'/src/services/FishingAutoService.js','fish.js':APP+'/src/handlers/fish.js'}
  report={'refs':[x for x in refs if 'fishing' in x or 'main.min_drop' in x],'files':{}}
  with s.open_sftp() as sf:
   for name,path in pairs.items():
    with sf.open(path,'rb') as f:data=f.read()
    (OUT/name).write_bytes(data)
    report['files'][name]={'remote':path,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)}
  i,o,e=s.exec_command('cd '+APP+' && timeout 65s node -',timeout=70)
  i.write(NODE);i.channel.shutdown_write();raw=o.read().decode('utf8');err=e.read().decode('utf8','replace');rc=o.channel.recv_exit_status()
  if rc:raise RuntimeError('AUDIT_FAILED:'+str(rc)+':'+err[-500:])
  report['live']=json.loads(raw)
  (OUT/'audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
  print(json.dumps(report,ensure_ascii=False,indent=2))
 finally:s.close()
if __name__=='__main__':main()
