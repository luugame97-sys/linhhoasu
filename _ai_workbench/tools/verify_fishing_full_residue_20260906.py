"""Read-only final residue checks. Never delete Redis ranks or expose credentials."""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import paramiko
from release_huyenvu_daily_20260906 import run

WB = Path(__file__).resolve().parents[1]
ROOT = WB / 'temp/fishing_full_candidate_20260906'
SCRIPT = r"""
const fs=require('fs'),assert=require('assert/strict'),cp=require('child_process');
const app='/linhhoasu/lhs/newServer',Redis=require(app+'/node_modules/ioredis'),dotenv=require(app+'/node_modules/dotenv');
const since='2026-09-06T12:12:37.634778+00:00';
(async()=>{
 const processes=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8'})),report={};
 for(const sid of [1001,1002]){
  const process=processes.find(p=>p.name==='lhs-s'+sid);assert(process);assert.equal(process.pm2_env.pm_cwd,app);
  const inherited=Object.fromEntries(fs.readFileSync('/proc/'+process.pid+'/environ','utf8').split('\0').filter(Boolean).map(line=>{const i=line.indexOf('=');return [line.slice(0,i),line.slice(i+1)];}));
  const env={...dotenv.parse(fs.readFileSync(app+'/.env')),...inherited};const prefix=env.REDIS_PREFIX||'';assert.equal(prefix,'s'+sid+':');
  const client=new Redis({host:env.REDIS_HOST||'127.0.0.1',port:Number(env.REDIS_PORT||6379),password:env.REDIS_PASSWORD||undefined,lazyConnect:true,maxRetriesPerRequest:0,connectTimeout:5000,commandTimeout:5000});
  await client.connect();let cursor='0',sessionCount=0;
  do{const [next,keys]=await client.scan(cursor,'MATCH',prefix+'session:qafull_*','COUNT',100);cursor=next;sessionCount+=keys.length;}while(cursor!=='0');
  await client.quit();
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:env.LOG_TIMEZONE||'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(since)).map(p=>[p.type,p.value]));
  const cutoff=parts.year+'-'+parts.month+'-'+parts.day+' '+parts.hour+':'+parts.minute+':'+parts.second;
  const logs=[];
  for(const file of [process.pm2_env.pm_out_log_path,process.pm2_env.pm_err_log_path].filter(Boolean)){
   if(!fs.existsSync(file)){logs.push({file,exists:false});continue;}
   const stat=fs.statSync(file),bytes=Math.min(stat.size,262144),fd=fs.openSync(file,'r'),buf=Buffer.alloc(bytes);
   try{fs.readSync(fd,buf,0,bytes,stat.size-bytes);}finally{fs.closeSync(fd);}
   const lines=buf.toString('utf8').split(/\r?\n/),scoped=lines.filter(line=>{const date=/\b(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\b/.exec(line);return date&&date[1]>=cutoff;});
   logs.push({file,exists:true,bytesRead:bytes,timestampedLinesSinceGuard:scoped.length,errorLines:scoped.filter(l=>/\berror\b|TypeError|ReferenceError|Unhandled/i.test(l)).length,eventStateErrors:scoped.filter(l=>/eventStats|Cannot read properties.*fishInfo/.test(l)).length});
  }
  report[sid]={qaRedisSessions:sessionCount,logs,logCutoffLocal:cutoff,logTimezone:env.LOG_TIMEZONE||'Asia/Shanghai'};
 }
 const ownedHarnessProcesses=fs.readdirSync('/proc').filter(p=>/^\d+$/.test(p)).filter(p=>{
  try{const args=fs.readFileSync('/proc/'+p+'/cmdline','utf8').split('\0');return args.some(a=>a.endsWith('/qa_fishing_full_live_20260906.js')||a.endsWith('/test_fishing_mongo_integration_20260906.js'));}catch{return false;}
 }).map(Number);
 console.log(JSON.stringify({servers:report,ownedHarnessProcesses,rankScope:'No rank deletion. QA starts arenaScore=0 and maxlayer=0; random player IDs cannot be verified by prefix.'}));
})().catch(e=>{console.error(e.name+': '+e.message);process.exitCode=1;});
"""


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    creds = (WB / 'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines()
    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
    ssh.connect(creds[0].strip(), username='root', password=creds[2], look_for_keys=False, allow_agent=False, timeout=20)
    try:
        report = json.loads(run(ssh, 'node -', SCRIPT, timeout=30))
        report['checkedAt'] = datetime.now(timezone.utc).isoformat()
        report['productionWrites'] = 0
        (ROOT / 'qa-residue-final.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
        assert all(v['qaRedisSessions'] == 0 for v in report['servers'].values())
        assert not report['ownedHarnessProcesses']
        print(json.dumps(report))
    finally:
        ssh.close()


if __name__ == '__main__':
    main()
