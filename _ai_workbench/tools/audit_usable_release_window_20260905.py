"""Read-only, anonymized log coverage for the superseded release interval."""
import pathlib, json, shlex
from datetime import datetime, timezone
import paramiko
from deploy_usable_item_fixes_20260905 import run
root=pathlib.Path(__file__).resolve().parents[1]
creds=(root/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines()
s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy())
s.connect(creds[0].strip(),username='root',password=creds[2],look_for_keys=False,allow_agent=False,timeout=20)
js=r'''
const fs=require('fs'),readline=require('readline'),crypto=require('crypto');
(async()=>{
const output=[];
for(const name of ['lhs-s1001','lhs-s1002']){
  const p='/root/.pm2/logs/'+name+'-out.log',size=fs.statSync(p).size,start=Math.max(0,size-320*1024*1024);
  const stream=fs.createReadStream(p,{start}),rl=readline.createInterface({input:stream,crlfDelay:Infinity});
  const row={name,bytes:size-start,firstDate:null,lastDate:null,nonQaTag1300Lines:0,subjects:{},isCompleteTransactionLedger:false};
  for await(const l of rl){
    const date=(l.match(/2026-09-05[ T]\d\d:\d\d:\d\d/)||[])[0];if(!date)continue;
    if(!row.firstDate)row.firstDate=date;row.lastDate=date;
    if(date<'2026-09-05 10:33:00'||date>'2026-09-05 13:18:40'||!/tag=1300\b/.test(l)||/qa_/.test(l))continue;
    row.nonQaTag1300Lines++;
    const user=(l.match(/user=([^ ]+)/)||[])[1];if(user){const key=crypto.createHash('sha256').update(name+'|'+user).digest('hex').slice(0,16);row.subjects[key]=(row.subjects[key]||0)+1;}
  }
  output.push(row);
}
console.log(JSON.stringify(output));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
'''
try:
    rows=json.loads(run(s,'node -e '+shlex.quote(js),timeout=60))
    result={'generatedAt':datetime.now(timezone.utc).isoformat(),'loggerTimeZone':'UTC+8 as observed, deployment evidence is UTC','rows':rows,'conclusion':'Performance logs do not identify consumed item or reward; no compensation is inferred.'}
    out=root/'temp/usable_release_window_20260905.json';out.write_text(json.dumps(result,indent=2),encoding='utf-8')
    print(json.dumps({'evidence':str(out),**result}))
finally:s.close()
