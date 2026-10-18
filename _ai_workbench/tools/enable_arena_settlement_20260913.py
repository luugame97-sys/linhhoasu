"""Enable the already-tested Arena settlement scheduler for S1/S2 only."""
from __future__ import annotations
import base64, hashlib, json, paramiko, sys

HOST = '103.116.105.154'; USER = 'root'; FP = 'SHA256:9hrzv0d3h/tdyep0ma+RUFi99n7YGXjQt3J4fI99osQ'
REMOTE = '/linhhoasu/lhs/newServer/ecosystem.config.js'
BACKUP_DIR = '/linhhoasu/_ai_workbench/backups/arena_settlement_enable_20260913'
ACTIVATION = '1789318800000'  # 2026-09-14 00:00 GMT+7; no historical payout.

class Pinned(paramiko.MissingHostKeyPolicy):
    def missing_host_key(self, client, hostname, key):
        fp = 'SHA256:' + base64.b64encode(hashlib.sha256(key.asbytes()).digest()).decode().rstrip('=')
        if hostname != HOST or fp != FP: raise RuntimeError('SSH_HOST_KEY_MISMATCH')

def run(ssh, cmd, timeout=120):
    _i, o, e = ssh.exec_command(cmd, timeout=timeout)
    out = o.read().decode('utf-8', 'replace'); err = e.read().decode('utf-8', 'replace')
    code = o.channel.recv_exit_status()
    if code: raise RuntimeError(f'remote exit {code}: {err[-1500:]}')
    return out.strip()

def main():
    password = sys.stdin.readline().rstrip('\r\n')
    if not password: raise SystemExit('password missing on stdin')
    ssh = paramiko.SSHClient(); ssh.set_missing_host_key_policy(Pinned())
    ssh.connect(HOST, username=USER, password=password, look_for_keys=False, allow_agent=False, timeout=20)
    try:
        before = run(ssh, f"sha256sum {REMOTE} | awk '{{print $1}}'")
        content = run(ssh, f"base64 -w0 {REMOTE}")
        raw = base64.b64decode(content).decode('utf-8')
        if "name: 'lhs-s1001'" not in raw or "name: 'lhs-s1002'" not in raw: raise RuntimeError('ECOSYSTEM_SCOPE_NOT_FOUND')
        if raw.count('ARENA_SETTLEMENT_ENABLED') > 0: raise RuntimeError('SETTLEMENT_FLAGS_ALREADY_PRESENT')
        updated = raw.replace("        SERVER_NAME: '长安一区',\n", "        SERVER_NAME: '长安一区',\n        ARENA_SETTLEMENT_ENABLED: '1',\n        ARENA_SETTLEMENT_APPROVED: '1',\n        ARENA_SETTLEMENT_ACTIVATION_AT: " + ACTIVATION + ",\n", 1)
        updated = updated.replace("        SERVER_NAME: '长安二区',\n", "        SERVER_NAME: '长安二区',\n        ARENA_SETTLEMENT_ENABLED: '1',\n        ARENA_SETTLEMENT_APPROVED: '1',\n        ARENA_SETTLEMENT_ACTIVATION_AT: " + ACTIVATION + ",\n", 1)
        payload = base64.b64encode(updated.encode('utf-8')).decode('ascii')
        run(ssh, f"mkdir -p {BACKUP_DIR}; cp -a {REMOTE} {BACKUP_DIR}/ecosystem.config.js.before; echo {payload} | base64 -d > /tmp/ecosystem.config.js.arena_settlement; node --check /tmp/ecosystem.config.js.arena_settlement; mv /tmp/ecosystem.config.js.arena_settlement {REMOTE}")
        # PM2 receives the same scoped variables immediately; the ecosystem
        # file keeps them across the next daemon restart.
        run(ssh, "ARENA_SETTLEMENT_ENABLED=1 ARENA_SETTLEMENT_APPROVED=1 ARENA_SETTLEMENT_ACTIVATION_AT=" + ACTIVATION + " pm2 restart lhs-s1002 --update-env", 120)
        run(ssh, "ARENA_SETTLEMENT_ENABLED=1 ARENA_SETTLEMENT_APPROVED=1 ARENA_SETTLEMENT_ACTIVATION_AT=" + ACTIVATION + " pm2 restart lhs-s1001 --update-env", 120)
        run(ssh, "for i in $(seq 1 30); do curl -fsS --max-time 2 http://127.0.0.1:8083/ready >/tmp/lhs_ready2 && break; sleep 1; done; test -s /tmp/lhs_ready2")
        run(ssh, "for i in $(seq 1 30); do curl -fsS --max-time 2 http://127.0.0.1:8080/ready >/tmp/lhs_ready1 && break; sleep 1; done; test -s /tmp/lhs_ready1")
        flags = run(ssh, "pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",c=>s+=c);process.stdin.on(\"end\",()=>console.log(JSON.stringify(JSON.parse(s).filter(x=>[\"lhs-s1001\",\"lhs-s1002\"].includes(x.name)).map(x=>({name:x.name,pid:x.pid,status:x.pm2_env.status,enabled:x.pm2_env.ARENA_SETTLEMENT_ENABLED,approved:x.pm2_env.ARENA_SETTLEMENT_APPROVED,activation:x.pm2_env.ARENA_SETTLEMENT_ACTIVATION_AT})))));'")
        print(json.dumps({'ok': True, 'beforeSha256': before, 'backup': BACKUP_DIR, 'activationAt': int(ACTIVATION), 'flags': flags, 'ready1': run(ssh, 'cat /tmp/lhs_ready1'), 'ready2': run(ssh, 'cat /tmp/lhs_ready2')}, ensure_ascii=False))
    finally: ssh.close()

if __name__ == '__main__': main()
