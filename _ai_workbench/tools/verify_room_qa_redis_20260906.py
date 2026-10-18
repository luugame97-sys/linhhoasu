"""Read-only check for own QA session/rank residues. Never expose Redis credentials."""
import json,sys
import paramiko
from inspect_room_qa_cleanup_20260906 import WB,ROOT
from release_huyenvu_daily_20260906 import run
SCRIPT=r"""
const fs=require('fs'),assert=require('assert/strict'),cp=require('child_process');
const app='/linhhoasu/lhs/newServer',Redis=require(app+'/node_modules/ioredis'),dotenv=require(app+'/node_modules/dotenv');
(async()=>{
 const processes=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8'})),report={};
 for(const sid of [1001,1002]){
  const process=processes.find(p=>p.name==='lhs-s'+sid);assert(process);assert.equal(process.pm2_env.pm_cwd,app);
  const inherited=Object.fromEntries(fs.readFileSync('/proc/'+process.pid+'/environ','utf8').split('\0').filter(Boolean).map(line=>{const i=line.indexOf('=');return [line.slice(0,i),line.slice(i+1)];}));
  const env={...dotenv.parse(fs.readFileSync(app+'/.env')),...inherited};const prefix=env.REDIS_PREFIX||'';assert.equal(prefix,'s'+sid+':');
  const client=new Redis({host:env.REDIS_HOST||'127.0.0.1',port:Number(env.REDIS_PORT||6379),password:env.REDIS_PASSWORD||undefined,lazyConnect:true,maxRetriesPerRequest:0,connectTimeout:5000,commandTimeout:5000});
  await client.connect();const sessionKeys=[];let cursor='0';
  do{const [next,keys]=await client.scan(cursor,'MATCH',prefix+'session:qa_room_*','COUNT',100);cursor=next;sessionKeys.push(...keys);}while(cursor!=='0');
  const ranks={};for(const kind of ['arena','tower']){const found=[];cursor='0';do{const [next,items]=await client.zscan(prefix+'rank:'+kind,cursor,'MATCH','p_qa_room_*','COUNT',100);cursor=next;for(let i=0;i<items.length;i+=2)found.push({id:items[i],score:items[i+1]});}while(cursor!=='0');ranks[kind]=found;}
  await client.quit();report[sid]={sessionKeys,ranks};
 }
 console.log(JSON.stringify(report));
})().catch(e=>{console.error(e.name+': '+e.message);process.exitCode=1;});
"""
def main():
 sys.stdout.reconfigure(encoding='utf-8');c=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(c[0].strip(),username='root',password=c[2],look_for_keys=False,allow_agent=False,timeout=20)
 try:
  report=json.loads(run(s,'node -',SCRIPT,timeout=30))
  (ROOT/'qa-redis-check.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(report))
 finally:s.close()
if __name__=='__main__':main()
