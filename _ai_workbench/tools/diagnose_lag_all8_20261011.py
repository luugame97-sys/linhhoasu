from __future__ import annotations
import ast, json, re, sys, time
from pathlib import Path
import paramiko

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT=Path(__file__).resolve().parents[2]
tree=ast.parse((ROOT/'_ai_workbench/tools/vps_exec.py').read_text(encoding='utf-8-sig'))
n=next(n for n in ast.walk(tree) if isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and n.func.attr=='connect')
args=[ast.literal_eval(x) for x in n.args]; kwargs={x.arg:ast.literal_eval(x.value) for x in n.keywords}; kwargs.update(timeout=20,banner_timeout=20,auth_timeout=20)
ssh=paramiko.SSHClient(); ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy()); ssh.connect(*args,**kwargs)
def run(cmd, timeout=60):
    _,o,e=ssh.exec_command(cmd,timeout=timeout); out=o.read().decode('utf8','replace'); err=e.read().decode('utf8','replace'); return {'code':o.channel.recv_exit_status(),'out':out,'err':err}
result={'at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'readOnly':True}
commands={
 'host':'date -Is; hostname; cat /proc/loadavg; nproc; free -m',
 'vmstat':'vmstat 1 4',
 'processes':"ps -eo pid,ppid,etimes,pcpu,pmem,rss,stat,args --sort=-pcpu | grep -E 'lhs-s100[1-8]|node|mongod|redis' | grep -v grep | head -80",
 'pm2':"pm2 jlist | node -e \"let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.stringify(JSON.parse(s).filter(p=>/^lhs-s100[1-8]$/.test(p.name)).map(p=>({name:p.name,pid:p.pid,status:p.pm2_env.status,restarts:p.pm2_env.restart_time,uptime:p.pm2_env.pm_uptime})))));\"",
 'listeners':'ss -s; ss -ltnp | grep -E ":(8080|8083|8084|8085|8086|8087|8088|8089|9200|9201|9202|9203|9204|9205|9206|9207)\\b" || true',
 'ready':'for p in 8080 8083 8084 8085 8086 8087 8088 8089; do printf "$p "; curl -sS -o /dev/null -w "%{http_code} %{time_total}\\n" --max-time 5 http://127.0.0.1:$p/ready || true; done',
 'mongo':'mongosh --quiet --eval "db.serverStatus({connections:1,opLatencies:1,metrics:1}).then(x=>printjson({connections:x.connections,opLatencies:x.opLatencies,opcounters:x.opcounters,mem:x.mem,asserts:x.asserts})).catch(e=>print(e.message))" 2>/dev/null || mongo --quiet --eval "db.serverStatus({connections:1,opLatencies:1,metrics:1})" 2>/dev/null || true',
 'redis':'(redis-cli --no-auth-warning INFO stats 2>/dev/null || true) | grep -E "instantaneous_ops_per_sec|instantaneous_input_kbps|instantaneous_output_kbps|blocked_clients|connected_clients|rejected_connections|evicted_keys" || true',
}
for key,cmd in commands.items(): result[key]=run(cmd,120 if key in ('mongo','processes') else 60)
for i in range(1,9):
    name=f'lhs-s100{i}'; path=f'/root/.pm2/logs/{name}-out.log';
    cmd=f"f={path}; echo LOG=$f; test -f $f && tail -n 50000 $f | grep -E 'slow tag=|handler still pending|handler stuck|deadline exceeded|queue wait|save queue backlog|outbound backlog|send callback pending|socket closed|EPIPE|Mongo|Redis|timeout|TypeError|ReferenceError|unhandled|uncaught|3314|4008|4000|2601|2300|1700|1000' | tail -n 5000 || true"
    result[f'log{i}']=run(cmd,90)
out=ROOT/'_ai_workbench/temp/lag_all8_20261011.json'; out.parent.mkdir(parents=True,exist_ok=True); out.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8'); print(json.dumps(result,ensure_ascii=False,indent=2))
ssh.close()
