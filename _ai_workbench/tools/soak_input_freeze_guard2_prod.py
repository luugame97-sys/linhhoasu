"""Concise read-only 2-minute post-deploy soak for runtime stability."""
from __future__ import annotations

import getpass
import paramiko


HOST = "103.116.105.154"


def main() -> None:
    password = getpass.getpass("VPS password (not logged): ")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False, allow_agent=False, timeout=20)
    try:
        command = r'''
set -eu
out=/root/.pm2/logs/lhs-s1001-out.log
marker=$(grep -n '\[WSServer\] runtime ready revision=' "$out" | tail -1 | cut -d: -f1)
marker=${marker:-1}
for i in $(seq 1 6); do
  now=$(date '+%Y-%m-%dT%H:%M:%S%z')
  health=$(curl -fsS --max-time 5 http://127.0.0.1:9200/health)
  pid=$(pm2 pid lhs-s1001 2>/dev/null | tail -1)
  restarts=$(pm2 jlist | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const p=JSON.parse(s).find(x=>x.name==="lhs-s1001");process.stdout.write(String((p&&p.pm2_env&&p.pm2_env.restart_time)||0))})')
  pending=$(tail -n +"$marker" "$out" | grep -E 'handler stuck|deadline exceeded|handler still pending' | wc -l)
  fatal=$(tail -n +"$marker" "$out" | grep -Ei 'ReferenceError|TypeError|SyntaxError|uncaught|unhandled rejection|async-save-failed' | wc -l)
  backlog=$(tail -n +"$marker" "$out" | grep -c 'queue backlog' || true)
  slow=$(tail -n +"$marker" "$out" | grep -c '\[WSServer\] slow tag=' || true)
  node -e 'const h=JSON.parse(process.argv[1]);const r=h.runtime||{};const b=r.bots||{};const real=b.real||{};console.log(`SAMPLE ${process.argv[2]} pid=${process.argv[3]} restarts=${process.argv[4]} clients=${r.clients||0} virtual=${b.botCount||0} real=${real.count||0} pending=${process.argv[5]} fatal=${process.argv[6]} backlog=${process.argv[7]} slow=${process.argv[8]}`)' "$health" "$now" "$pid" "$restarts" "$pending" "$fatal" "$backlog" "$slow"
  sleep 20
done
'''
        _stdin, stdout, stderr = ssh.exec_command(command, timeout=180)
        output = stdout.read().decode("utf-8", "replace")
        error = stderr.read().decode("utf-8", "replace")
        code = stdout.channel.recv_exit_status()
        if code:
            raise RuntimeError(error[-4000:] or output[-4000:])
        print(output)
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
