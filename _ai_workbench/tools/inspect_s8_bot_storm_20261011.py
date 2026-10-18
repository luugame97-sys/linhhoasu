import ast, json, sys
from pathlib import Path
import paramiko
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT=Path(__file__).resolve().parents[2]
t=ast.parse((ROOT/'_ai_workbench/tools/vps_exec.py').read_text(encoding='utf-8-sig'))
n=next(n for n in ast.walk(t) if isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and n.func.attr=='connect')
a=[ast.literal_eval(x) for x in n.args]
k={x.arg:ast.literal_eval(x.value) for x in n.keywords}; k.update(timeout=20,banner_timeout=20,auth_timeout=20)
c=paramiko.SSHClient(); c.set_missing_host_key_policy(paramiko.AutoAddPolicy()); c.connect(*a,**k)
cmds={
 'pm2':'pm2 jlist | node -e "let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>console.log(JSON.stringify(JSON.parse(s).filter(p=>/bot|s1008|fleet/i.test(p.name)).map(p=>({name:p.name,pid:p.pid,status:p.pm2_env.status,restarts:p.pm2_env.restart_time,uptime:Date.now()-p.pm2_env.pm_uptime})))));"',
 'bot_logs':"for f in /root/.pm2/logs/*s8* /root/.pm2/logs/*bot*; do test -f $f || continue; echo ===$f; tail -n 3000 $f | grep -Ei 'connect|reconnect|close|error|s1008|socket|active|spawn|restart' | tail -n 80; done",
 'connections':"ss -tanp | grep -E ':9207|:8089' | awk '{print $1,$4,$5,$6}' | head -120",
 's8log':"tail -n 2000 /root/.pm2/logs/lhs-s1008-out.log | grep -Ei 'runtime ready|socket connected|socket close|socket closed|map dormant|login|handler stuck|queue wait' | tail -n 200",
}
for key,cmd in cmds.items():
    _,o,e=c.exec_command(cmd,timeout=90); print('=== '+key+' ==='); print(o.read().decode('utf8','replace')); print(e.read().decode('utf8','replace'))
c.close()
