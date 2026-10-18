"""Read-only, bounded S1 event QA log inspection."""
import json, shlex
from release_petsoul_day1_20261007 import connect, run
js="""const fs=require('fs'),cp=require('child_process');const row=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8'})).find(x=>x.name==='lhs-s1001');for(const key of ['pm_out_log_path','pm_err_log_path']){const file=row.pm2_env[key];const stat=fs.statSync(file),fd=fs.openSync(file,'r'),size=Math.min(stat.size,4000000),buf=Buffer.alloc(size);fs.readSync(fd,buf,0,size,stat.size-size);fs.closeSync(fd);const lines=buf.toString('utf8').split('\\n').filter(x=>/08:(58|59)|09:0[0-3]|15:(58|59)|16:0[0-3]/.test(x)&&/1700|1000|1801|MAINTENANCE|52001|21001|27001|30001|fulu/i.test(x));console.log(JSON.stringify({file,lines:lines.slice(-80)}));}"""
ssh=connect()
try:
 print(run(ssh,'node -e '+shlex.quote(js),60))
finally: ssh.close()
