"""Read only a timestamp-bounded slice of the owned game log; no broad download."""
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
import paramiko
from release_huyenvu_daily_20260906 import run

WB=Path(__file__).resolve().parents[1]
SCRIPT=r"""
const fs=require('fs'),readline=require('readline'),crypto=require('crypto');
const file='/linhhoasu/lhs/newServer/logs/combined-2026-09-06.log';
const from='2026-09-06 19:55:00',until='2026-09-06 23:00:00'; // UTC+8, five minutes before the event.
(async()=>{
 const fd=fs.openSync(file,'r'),size=fs.fstatSync(fd).size;let lo=0,hi=size,probes=0;
 function stamp(offset){const b=Buffer.alloc(Math.min(131072,size-offset));fs.readSync(fd,b,0,b.length,offset);const text=b.toString('utf8');const n=text.indexOf('\n'),line=n>=0?text.slice(n+1):text;const match=/\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]/.exec(line);return match?.[1]||null;}
 while(hi-lo>262144&&probes++<40){const mid=Math.floor((lo+hi)/2),t=stamp(mid);if(!t)break;if(t<from)lo=mid;else hi=mid;}
 fs.closeSync(fd);
 const start=Math.max(0,lo-1048576),bytes=size-start;if(bytes>950*1024*1024)throw Error('LOG_RANGE_TOO_LARGE_'+bytes);
 const users=__USERS__,known=new Set(users),perUser=Object.fromEntries(users.map(id=>[id,{matched:0,requestedQuantity:0,maxPerRequest:0,first:null,last:null,samples:[]}]))
 const stream=fs.createReadStream(file,{start,end:size-1,highWaterMark:262144}),reader=readline.createInterface({input:stream,crlfDelay:Infinity});
 let seen=0,scoped=0,packageMatches=0,first=null,last=null;const kinds={},samples=[],otherUsers={},responses={successLines:0,successQuantity:0,successBaozi:0,rejectedLines:0,otherLines:0,postReleaseSuccesses:[]};const hash=crypto.createHash('sha256');
 for await(const line of reader){seen++;const t=/\[(2026-09-06 \d{2}:\d{2}:\d{2})\]/.exec(line)?.[1];if(!t||t<from||t>until)continue;scoped++;first ||= t;last=t;
  if(!line.includes('11001400'))continue;
  packageMatches++;hash.update(line+'\n');
  const kind=/\[(INFO|WARN|ERROR|DEBUG)\] \[([^\]]+)\]/.exec(line)?.[2]||'unknown';kinds[kind]=(kinds[kind]||0)+1;
  // Save only package-related, non-secret log lines. Do not export unrelated traffic/IPs.
  const safe=line.replace(/(?:token|password|authorization|cookie|secret)[=:][^\s]+/ig,'credential=[REDACTED_SECRET]');
  if(samples.length<12)samples.push(safe.slice(0,900));
  const id=/\buser(?:Id)?[=:]([^\s,]+)/.exec(line)?.[1];
  if(known.has(id)){const record=perUser[id],quantity=Number(/\bcount=([\d.]+)/.exec(line)?.[1]||0);record.matched++;record.requestedQuantity+=quantity;record.maxPerRequest=Math.max(record.maxPerRequest,quantity);record.first ||= t;record.last=t;if(record.samples.length<3)record.samples.push(safe.slice(0,900));}
  else if(id){const record=otherUsers[id] ||= {matched:0,requestedQuantity:0,first:t,last:t,samples:[]};record.matched++;record.requestedQuantity+=Number(/\bcount=([\d.]+)/.exec(line)?.[1]||0);record.last=t;if(record.samples.length<3)record.samples.push(safe.slice(0,900));}
  const response=/legacy shop buy result goodsId=11001400 count=([\d.]+) result=(-?\d+) rewardItems=(\[[^\n]*?\]) rewardGems=/.exec(line);
  if(response){if(Number(response[2])===0){responses.successLines++;responses.successQuantity+=Number(response[1]);responses.successBaozi+=JSON.parse(response[3]).filter(r=>r.id===4).reduce((n,r)=>n+Number(r.count),0);if(t>='2026-09-06 22:24:00'&&responses.postReleaseSuccesses.length<20)responses.postReleaseSuccesses.push(safe.slice(0,900));}else responses.rejectedLines++;}
 }
 console.log(JSON.stringify({file,from,until,snapshotSize:size,startOffset:start,bytesRead:bytes,seekProbes:probes,linesSeen:seen,scopedLines:scoped,firstScopedTimestamp:first,lastScopedTimestamp:last,packageMatches,kinds,samples,perUser,otherUsers,responses,matchedLinesSha256:hash.digest('hex'),productionWrites:0,boundaryNote:'Approximate timestamp seek with one MiB lookback. Results lack user ID; do not assign interleaved results to a user by proximity.'}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
"""


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    root=Path(sys.argv[1]).resolve()
    assert root.parent==WB/'temp' and root.name.startswith('fishing_free_claim_audit_')
    inventory=json.loads((root/'inventory-raw.json').read_text(encoding='utf-8'))
    users=[p['userId'] for server in inventory['servers'].values() for p in server['profiles']]
    script=SCRIPT.replace('__USERS__',json.dumps(users))
    scope=sys.argv[2] if len(sys.argv)>2 else 'combined'
    assert scope in ['combined','1001','1002']
    if scope!='combined':script=script.replace('/linhhoasu/lhs/newServer/logs/combined-2026-09-06.log','/root/.pm2/logs/lhs-s'+scope+'-out.log')
    subprocess.run(['node','--check'],input=script,text=True,encoding='utf-8',check=True,capture_output=True)
    creds=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines()
    ssh=paramiko.SSHClient();ssh.load_system_host_keys();ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
    ssh.connect(creds[0].strip(),username='root',password=creds[2],look_for_keys=False,allow_agent=False,timeout=20)
    try:
        result=json.loads(run(ssh,'timeout 50s node -',script,timeout=55))
        result['checkedAt']=datetime.now(timezone.utc).isoformat()
        (root/('log-evidence.json' if scope=='combined' else 'log-evidence-'+scope+'.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        print(json.dumps(result,ensure_ascii=False))
    finally:ssh.close()


if __name__=='__main__':main()
