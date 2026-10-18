"""Bounded, read-only production performance summary (no restart or mutation)."""
from __future__ import annotations

import getpass
import paramiko


def main() -> None:
    password = getpass.getpass("VPS password (not logged): ")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect("103.116.105.154", username="root", password=password,
                look_for_keys=False, allow_agent=False, timeout=20)
    command = r"""
set -u
echo '===HEALTH==='; curl -fsS --max-time 8 http://127.0.0.1:9200/health
echo; echo '===PROCESS==='; pid=$(pm2 pid lhs-s1001 | tail -1); ps -p "$pid" -o pid=,pcpu=,pmem=,etime=,rss=,stat=,cmd=
echo '===RUNTIME_MARKER==='; f=/root/.pm2/logs/lhs-s1001-out.log; n=$(grep -n '\[WSServer\] runtime ready revision=' "$f" | tail -1 | cut -d: -f1); echo "line=${n:-none}"; [ -n "$n" ] || n=1
g="$(mktemp)"; tail -n +"$n" "$f" > "$g"
echo '===COUNTS==='; for p in 'handler stuck' 'deadline exceeded' 'RPC timeout' 'EPIPE' 'SyntaxError' 'ReferenceError' 'TypeError' 'FATAL'; do printf '%s=' "$p"; grep -F -c "$p" "$g" || true; done
echo '===SLOW_TAGS==='; grep -Eo 'tag=[0-9]+[^\n]*totalMs=[0-9.]+' "$g" | awk '{tag="";ms=""; for(i=1;i<=NF;i++){if($i ~ /^tag=/)tag=$i; if($i ~ /^totalMs=/)ms=$i} if(tag!=""&&ms!="") {sub("tag=","",tag);sub("totalMs=","",ms); c[tag]++; sum[tag]+=ms; if(ms+0>max[tag])max[tag]=ms}} END{for(t in c) printf "%s count=%d max=%.3f avg=%.3f\n",t,c[t],max[t],sum[t]/c[t]}' | sort -k3,3nr | head -25
echo '===RECENT_STUCK==='; grep -E 'handler stuck|deadline exceeded|RPC timeout|EPIPE' "$g" | tail -40 || true
rm -f "$g"
"""
    try:
        _, stdout, stderr = ssh.exec_command(command, timeout=90)
        print(stdout.read().decode("utf-8", "replace"), end="")
        error = stderr.read().decode("utf-8", "replace")
        if error:
            print("STDERR=" + error)
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
