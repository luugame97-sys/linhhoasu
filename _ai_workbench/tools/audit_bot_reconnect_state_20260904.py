"""Read-only scoped bot reconnect state and recent worker errors."""
import os
from pathlib import Path
import paramiko
c=Path(os.environ['LHS_PROD_CREDENTIAL_FILE']).read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(c[0].strip(),username='root',password=c[2],look_for_keys=False,allow_agent=False,timeout=20)
try:
 cmd="pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>console.log(JSON.stringify(JSON.parse(s).filter(p=>[\"lhs-s1001\",\"lhs-s1002\",\"lhs-real-bots\",\"lhs-real-bots-s2\"].includes(p.name)).map(p=>({name:p.name,pid:p.pid,status:p.pm2_env.status,restarts:p.pm2_env.restart_time,uptime:p.pm2_env.pm_uptime})))))'; echo HEALTH1; curl -fsS http://127.0.0.1:9200/health; echo; echo WORKER1_OUT; tail -80 /root/.pm2/logs/lhs-real-bots-out.log | grep -Ei 'connect|close|error|ready|580|worker' | tail -30 || true; echo WORKER1_ERR; tail -80 /root/.pm2/logs/lhs-real-bots-error.log | tail -30"
 _,o,e=s.exec_command(cmd,timeout=90);out=o.read().decode('utf8','replace');err=e.read().decode('utf8','replace');code=o.channel.recv_exit_status()
 if code:raise RuntimeError(err or out)
 print(out)
finally:s.close()
