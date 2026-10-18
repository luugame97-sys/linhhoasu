"""Read-only receipt/notice/ban verification plus denied-login probes of still-banned roles."""
import json,sys
from datetime import datetime,timezone
from pathlib import Path
import paramiko
from release_huyenvu_daily_20260906 import run,hashes,pm2,ready
from release_fishing_recovery_service_20260906 import WB,ROOT,STAGE
SCRIPT=r"""
const fs=require('fs'),cp=require('child_process'),assert=require('assert/strict'),crypto=require('crypto');
const APP='/linhhoasu/lhs/newServer',plan=__PLAN__,{MongoClient}=require(APP+'/node_modules/mongodb'),WS=require(APP+'/node_modules/ws'),Redis=require(APP+'/node_modules/ioredis'),dotenv=require(APP+'/node_modules/dotenv'),{Pack,Unpack}=require(APP+'/src/protocol/Codec');
const clone=x=>JSON.parse(JSON.stringify(x)),hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
async function deniedLogin(role){
 return new Promise((resolve,reject)=>{const ws=new WS('ws://127.0.0.1:'+(role.serverId===1001?9200:9201),{headers:{Origin:'http://127.0.0.1'},handshakeTimeout:5000});let done=false,notice=false;const timer=setTimeout(()=>finish(Error('LOGIN_PROBE_TIMEOUT')),8000);
 function finish(error,value){if(done)return;done=true;clearTimeout(timer);ws.terminate();error?reject(error):resolve(value);}
 ws.on('error',e=>finish(e));ws.on('open',()=>ws.send(Pack(1,{userid:role.userId,serverid:role.serverId},60701)));
 ws.on('message',raw=>{try{const b=Buffer.from(raw),decoded=Unpack(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));for(const p of Array.isArray(decoded)?decoded:[decoded]){
  if(p.tag===500)throw Error('BANNED_ROLE_RECEIVED_PLAYER500');
  if(p.tag===9&&String(p.data?.msg||'').includes('khóa'))notice=true;
  if(p.tag===1&&p.msgUid===60701){assert.equal(p.data.result,-1);assert.equal(p.data.code,plan.code);assert(notice);finish(null,{userId:role.userId,serverId:role.serverId,denied:true,notice:true});}
 }}catch(e){finish(e);}});
 });
}
(async()=>{const c=new MongoClient('mongodb://127.0.0.1:27017');await c.connect();const out={time:new Date().toISOString(),profiles:[],accounts:[],loginProbes:[],skippedExpiredRoles:[],backup:[]};try{
 const accounts=await c.db('lhs_s1001').collection('accounts').find({accountId:{$in:plan.rows.map(r=>r.accountId)}},{projection:{passwordHash:0}}).toArray();assert.equal(accounts.length,19);
 for(const r of plan.rows){const p=await c.db('lhs_s'+r.serverId).collection('players').findOne({userId:r.userId},{projection:{_id:0,userId:1,playerId:1,accountId:1,items:1,moderation:1}});assert.equal(p.playerId,r.playerId);const m=p.moderation?.fishingFree20260906;assert.equal(m?.amount,r.amount);assert.equal(m?.incident,plan.incident);assert.equal(m.before-m.after,r.amount);assert.equal(m.evidenceSha256,plan.evidenceSha256);
  const mail=await c.db('lhs_s'+r.serverId).collection('mails').find({userId:r.userId,eventKey:plan.incident},{projection:{_id:1,attachments:1,title:1,content:1}}).toArray();assert.equal(mail.length,1);assert.equal(mail[0].attachments.length,0);assert(mail[0].content.includes(r.amount.toLocaleString('vi-VN')));
  out.profiles.push({accountId:r.accountId,serverId:r.serverId,playerId:p.playerId,recovered:m.amount,before:m.before,after:m.after,currentBaozi:p.items[4],receiptPreserved:true,noticeId:String(mail[0]._id),noticeContent:mail[0].content});
  const a=accounts.find(a=>a.accountId===r.accountId),history=(a.banHistory||[]).filter(h=>h.code===plan.code&&h.meta?.evidenceId===plan.incident);
  if(r.penaltySeconds===0){assert.equal(history.length,0);assert(a.status>0);out.accounts.push({accountId:r.accountId,banned:false,authVersion:a.authVersion,exempt:true});continue;}
  assert.equal(history.length,1);assert.equal(new Date(history[0].until)-new Date(history[0].at),r.penaltySeconds*1000);
  const until=new Date(history[0].until).getTime();out.accounts.push({accountId:r.accountId,banned:a.status<=0&&until>Date.now(),until,appliedAt:history[0].at,durationSeconds:r.penaltySeconds,roleCount:a.roles.length});
  for(const role of a.roles){if(![1001,1002].includes(role.serverId))continue;if(until-Date.now()<30000){out.skippedExpiredRoles.push({userId:role.userId,until,reason:'expired_or_less_than_30s_left'});continue;}
   const coll=c.db('lhs_s'+role.serverId).collection('players');const before=await coll.findOne({userId:role.userId},{projection:{_id:0,items:1,moderation:1,updatedAt:1}});assert(before);const denied=await deniedLogin(role);const after=await coll.findOne({userId:role.userId},{projection:{_id:0,items:1,moderation:1,updatedAt:1}});assert.equal(hash(before),hash(after),'DENIED_LOGIN_MUST_NOT_WRITE');out.loginProbes.push(denied);
  }
 }
 const processes=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8'}));out.authIndexes=[];const seen=new Set();
 for(const sid of [1001,1002]){const p=processes.find(p=>p.name==='lhs-s'+sid),inherited=Object.fromEntries(fs.readFileSync('/proc/'+p.pid+'/environ','utf8').split('\0').filter(Boolean).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1)];}));const env={...dotenv.parse(fs.readFileSync(APP+'/.env')),...inherited},prefix=env.AUTH_REDIS_PREFIX||env.REDIS_PREFIX||'';if(seen.has(prefix))continue;seen.add(prefix);
  const redis=new Redis({host:env.REDIS_HOST||'127.0.0.1',port:Number(env.REDIS_PORT||6379),password:env.REDIS_PASSWORD||undefined,lazyConnect:true,connectTimeout:4000,commandTimeout:4000,maxRetriesPerRequest:0});await redis.connect();try{for(const r of plan.rows.filter(r=>r.penaltySeconds>0)){const count=await redis.scard(prefix+'auth:account:'+r.accountId);const active=out.accounts.find(a=>a.accountId===r.accountId).banned;if(active)assert.equal(count,0);out.authIndexes.push({accountId:r.accountId,prefix,count,active});}}finally{await redis.quit();}
 }
 const backup='/linhhoasu/_ai_workbench/backups/fishing_free_recovery_20260906';for(const r of plan.rows){for(const suffix of ['-recovery-before.json',...(r.penaltySeconds>0?['-account-before.json','-web-before.json']:[])]){const f=backup+'/'+r.accountId+suffix;assert(fs.existsSync(f));out.backup.push({file:f,sha256:crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')});}}
 out.result='PASS';out.recoveredTotal=out.profiles.reduce((n,r)=>n+r.recovered,0);assert.equal(out.recoveredTotal,231860);out.productionWrites=0;console.log(JSON.stringify(out));
}finally{await c.close();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
"""
def main():
 sys.stdout.reconfigure(encoding='utf-8');plan=json.loads((ROOT/'plan.json').read_text(encoding='utf-8'));deploy=json.loads((ROOT/'service-deploy.json').read_text(encoding='utf-8'))
 cred=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(cred[0].strip(),username='root',password=cred[2],look_for_keys=False,allow_agent=False,timeout=20)
 try:
  assert hashes(s,list(deploy['expected']))==deploy['expected'];assert pm2(s)==deploy['pm2']
  result=json.loads(run(s,'timeout 50s node -',SCRIPT.replace('__PLAN__',json.dumps(plan,ensure_ascii=False)),timeout=55));result.update(ready=ready(s),hashCount=len(deploy['expected']),pm2=pm2(s),checkedAt=datetime.now(timezone.utc).isoformat())
  (ROOT/'final-native-and-db-verify.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
  print(json.dumps({'result':result['result'],'total':result['recoveredTotal'],'profiles':len(result['profiles']),'bans':sum(not a.get('exempt',False) for a in result['accounts']),'loginDenied':len(result['loginProbes']),'skipExpired':len(result['skippedExpiredRoles']),'noticeCount':len(result['profiles']),'backups':len(result['backup']),'ready':result['ready'],'hashes':result['hashCount']}))
 finally:s.close()
if __name__=='__main__':main()
