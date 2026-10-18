"""Read-only post-deploy verification for the production input-freeze fix."""
from __future__ import annotations

import getpass
import json
import re
import time

import paramiko

HOST = "103.116.105.154"


def run(ssh, command, timeout=60):
    _stdin, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError(err[-3000:] or f"command failed {code}")
    return out


ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username="root", password=getpass.getpass("VPS password (not logged): "), look_for_keys=False, allow_agent=False, timeout=15)
try:
    # Give the worker a short reconnect window before reading the snapshot.
    time.sleep(12)
    pm2 = run(
        ssh,
        "pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{for(const p of JSON.parse(s)){if([\"lhs-s1001\",\"lhs-real-bots\",\"lhs-dist\",\"lhs-admin\"].includes(p.name))console.log(p.name+\"=\"+p.pm2_env.status+\",pid=\"+p.pid+\",restart=\"+p.pm2_env.restart_time+\",uptime=\"+(Date.now()-p.pm2_env.pm_uptime))}})'",
    ).strip()
    ready = run(ssh, "curl -fsS http://127.0.0.1:8080/ready").strip()
    health_raw = run(ssh, "curl -fsS http://127.0.0.1:9200/health").strip()
    health = json.loads(health_raw)
    pid = str(health.get("runtime", {}).get("pid") or "")
    process_row = run(ssh, f"ps -o pid,etimes,%cpu,%mem,rss,args -p {pid} | tail -n +2").strip() if pid else ""
    indexes_raw = run(
        ssh,
        "pid=$(pm2 pid lhs-s1001 2>/dev/null | tail -1); export MONGO_URI=$(tr '\\0' '\\n' < /proc/$pid/environ | sed -n 's/^MONGO_URI=//p'); "
        "cd /linhhoasu/lhs/newServer && node - <<'NODE'\n"
        "const mongo=require('./src/db/mongo');const Account=require('./src/db/models/Account');"
        "(async()=>{await mongo.connect();const x=await Account.collection.indexes();console.log(JSON.stringify(x.filter(r=>Object.keys(r.key||{}).some(k=>k.startsWith('roles.'))).map(r=>({name:r.name,key:r.key}))));})().finally(()=>mongo.disconnect());\nNODE",
        timeout=120,
    )
    index_lines = [line.strip() for line in indexes_raw.splitlines() if line.strip().startswith("[") and line.strip().endswith("]")]
    role_indexes = json.loads(index_lines[-1]) if index_lines else []

    marker = run(
        ssh,
        "grep -n '\\[WSServer\\] runtime ready revision=b15797d9e617' /root/.pm2/logs/lhs-s1001-out.log | tail -1 | cut -d: -f1",
    ).strip()
    log = run(
        ssh,
        "f=/root/.pm2/logs/lhs-s1001-out.log; m=" + (marker or "1") + "; "
        "tail -n +$m \"$f\" | grep -E 'runtime ready revision=|handler stuck|deadline exceeded|queue backlog|slow tag=|async .* failed|ReferenceError|TypeError|SyntaxError|uncaught|unhandled|save queue backlog' | tail -n 300",
    )
    pending = [line for line in log.splitlines() if re.search(r"handler stuck|deadline exceeded", line)]
    slow = [line for line in log.splitlines() if "slow tag=" in line]
    fatal = [line for line in log.splitlines() if re.search(r"ReferenceError|TypeError|SyntaxError|uncaught|unhandled", line, re.I)]
    print("PM2\n" + pm2)
    print("READY=" + ready)
    print("HEALTH=" + json.dumps({
        "revision": health.get("runtime", {}).get("revision"),
        "clients": health.get("runtime", {}).get("clients"),
        "virtualBots": health.get("runtime", {}).get("bots", {}).get("botCount"),
        "realBots": health.get("runtime", {}).get("bots", {}).get("real", {}).get("count"),
    }, ensure_ascii=False))
    print("PROCESS=" + process_row)
    print("ROLE_INDEXES=" + json.dumps(role_indexes, ensure_ascii=False))
    print("FRESH_COUNTS=" + json.dumps({"pending": len(pending), "slow": len(slow), "fatal": len(fatal)}))
    print("FRESH_TAIL")
    print("\n".join(log.splitlines()[-80:]))
finally:
    ssh.close()
