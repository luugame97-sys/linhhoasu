"""Bounded read-only log slice for one inconsistent legacy mail receipt."""
import json
from snapshot_web_multiserver_20260906 import connect,run
from snapshot_donate_revision_20260907 import ROOT
script=r'''const fs=require('fs'),readline=require('readline');
(async()=>{const file='/root/.pm2/logs/lhs-s1001-out.log',from='2026-09-06 23:28:45',to='2026-09-06 23:31:15',uid='u_Wk_1001_770460_1788525948362',mid='6a9d86bc1dc0ef899791716f';
const fd=fs.openSync(file,'r'),size=fs.fstatSync(fd).size;let lo=0,hi=size;function stamp(offset){const b=Buffer.alloc(Math.min(131072,size-offset));fs.readSync(fd,b,0,b.length,offset);const s=b.toString('utf8');return /\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]/.exec(s.slice(s.indexOf('\n')+1))?.[1]||null;}
for(let i=0;i<40&&hi-lo>131072;i++){const n=Math.floor((hi+lo)/2),t=stamp(n);if(!t)break;if(t<from)lo=n;else hi=n;}fs.closeSync(fd);
const start=Math.max(0,lo-262144),end=Math.min(size-1,start+16*1024*1024),stream=fs.createReadStream(file,{start,end}),reader=readline.createInterface({input:stream});let lines=0,samples=[],first=null,last=null;
for await(const line of reader){const t=/\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]/.exec(line)?.[1];if(!t||t<from)continue;if(t>to)break;first||=t;last=t;lines++;if(line.includes(uid)||line.includes(mid)||line.includes('[Mail]')){samples.push(line.replaceAll(uid,'[TARGET_UID]').replace(/(?:token|password|authorization|cookie|secret)[=:][^\s]+/ig,'credential=[REDACTED]').slice(0,1800));if(samples.length>200)throw Error('TOO_MANY_MATCHES');}}
reader.close();stream.destroy();console.log(JSON.stringify({from,to,start,end,lines,first,last,samples,readOnly:true}));})().catch(e=>{console.error(e.message);process.exitCode=1;});'''
ssh=connect()
try:
 result=json.loads(run(ssh,'node -',script));(ROOT/'held-claim-log.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 print(json.dumps(result,ensure_ascii=True))
finally:ssh.close()
