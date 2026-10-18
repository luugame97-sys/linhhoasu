"""A/B test: suppress only cross-user box broadcasts on the test VPS."""
from __future__ import annotations

import getpass
import hashlib
import json
import posixpath
import shlex
from datetime import datetime, timezone

import paramiko

HOST = "192.168.200.151"
ROOT = "/linhhoasu/lhs/newServer"
FILES = ["src/handlers/box.js", "src/handlers/compat.js", "ecosystem.config.js"]
BOX_IF = b"if (wsServer && typeof wsServer.broadcastExceptUser === 'function') {"
NEW_IF = b"if (process.env.LHS_TEST_DISABLE_BOX_BROADCAST !== '1' && wsServer && typeof wsServer.broadcastExceptUser === 'function') {"
S1 = b"name: 'lhs-s1001'"
S2 = b"name: 'lhs-s1002'"
ENV = b"        LHS_TEST_DISABLE_BOX_BROADCAST: '1',"


def q(value: str) -> str:
    return shlex.quote(value)


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def run(ssh: paramiko.SSHClient, command: str, timeout: int = 90, check: bool = True) -> str:
    _, out, err = ssh.exec_command(command, timeout=timeout)
    text = out.read().decode("utf-8", "replace")
    error = err.read().decode("utf-8", "replace")
    code = out.channel.recv_exit_status()
    if check and code:
        raise RuntimeError(error[-4000:] or text[-4000:] or f"remote exit {code}")
    return text


def patch_eco(data: bytes) -> bytes:
    start = data.find(S1)
    end = data.find(S2, start + 1)
    if start < 0 or end < 0:
        raise RuntimeError("S1/S2 ecosystem boundaries not found")
    block = data[start:end]
    if ENV in block:
        raise RuntimeError("test flag already present")
    marker = b"NODE_ENV: 'production',"
    pos = block.find(marker)
    if pos < 0:
        raise RuntimeError("S1 NODE_ENV marker not found")
    pos += len(marker)
    return data[:start] + block[:pos] + b"\n" + ENV + block[pos:] + data[end:]


def main() -> None:
    password = getpass.getpass("Test VPS password (not logged): ")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup = f"/linhhoasu/_ai_workbench/backups/ab_disable_box_broadcast_v2_pre_{stamp}"
    originals: dict[str, bytes] = {}
    candidates: dict[str, bytes] = {}
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False, allow_agent=False,
                timeout=20, banner_timeout=20, auth_timeout=20)
    try:
        sftp = ssh.open_sftp()
        try:
            for relative in FILES:
                with sftp.open(posixpath.join(ROOT, relative), "rb") as handle:
                    originals[relative] = handle.read()
        finally:
            sftp.close()
        if originals["src/handlers/box.js"].count(BOX_IF) != 1 or originals["src/handlers/compat.js"].count(BOX_IF) != 1:
            raise RuntimeError("broadcast precondition mismatch")
        candidates["src/handlers/box.js"] = originals["src/handlers/box.js"].replace(BOX_IF, NEW_IF, 1)
        candidates["src/handlers/compat.js"] = originals["src/handlers/compat.js"].replace(BOX_IF, NEW_IF, 1)
        candidates["ecosystem.config.js"] = patch_eco(originals["ecosystem.config.js"])
        run(ssh, f"set -eu; mkdir -p {q(backup)}")
        sftp = ssh.open_sftp()
        try:
            for relative, data in originals.items():
                path = posixpath.join(backup, relative)
                run(ssh, f"mkdir -p {q(posixpath.dirname(path))}")
                with sftp.open(path, "wb") as handle:
                    handle.write(data)
        finally:
            sftp.close()
        stages: list[tuple[str, str]] = []
        sftp = ssh.open_sftp()
        try:
            for relative, data in candidates.items():
                remote = posixpath.join(ROOT, relative)
                stage = remote + f".abv2-{stamp}{posixpath.splitext(relative)[1] or '.tmp'}"
                with sftp.open(stage, "wb") as handle:
                    handle.write(data)
                stages.append((remote, stage))
        finally:
            sftp.close()
        for relative, data in candidates.items():
            remote = posixpath.join(ROOT, relative)
            stage = next(s for r, s in stages if r == remote)
            if run(ssh, f"sha256sum -- {q(stage)} | awk '{{print $1}}'").strip().lower() != digest(data):
                raise RuntimeError(f"stage hash mismatch: {relative}")
            if relative.endswith(".js"):
                run(ssh, f"node --check {q(stage)}")
        for remote, stage in stages:
            run(ssh, f"mv -f -- {q(stage)} {q(remote)}")
        run(ssh, "set -eu; cd /linhhoasu/lhs/newServer; pm2 restart ecosystem.config.js --only lhs-s1001 --update-env >/dev/null", timeout=120)
        wait = "set -eu; for i in $(seq 1 90); do c=$(curl -sS -o /tmp/abv2-ready.$$ -w '%{http_code}' --max-time 5 http://127.0.0.1:8080/ready || true); if [ \"$c\" = 200 ] && ss -lnt | grep -q ':9200 '; then exit 0; fi; sleep 1; done; exit 1"
        run(ssh, wait, timeout=150)
        row = next(x for x in json.loads(run(ssh, "pm2 jlist")) if x.get("name") == "lhs-s1001")
        env = row.get("pm2_env") or {}
        print(json.dumps({"result":"ok","host":HOST,"backup":backup,"ready":run(ssh,"curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/ready").strip(),"pid":row.get("pid"),"restartCount":env.get("restart_time"),"testFlag":env.get("LHS_TEST_DISABLE_BOX_BROADCAST"),"hashes":{k:digest(v) for k,v in candidates.items()}},ensure_ascii=False,indent=2))
    except Exception:
        try:
            for relative in FILES:
                run(ssh, f"cp -p {q(posixpath.join(backup, relative))} {q(posixpath.join(ROOT, relative))}")
            run(ssh, "cd /linhhoasu/lhs/newServer; pm2 restart ecosystem.config.js --only lhs-s1001 --update-env >/dev/null", timeout=120)
            run(ssh, "for i in $(seq 1 90); do c=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:8080/ready || true); if [ \"$c\" = 200 ]; then exit 0; fi; sleep 1; done; exit 1", timeout=150)
            print("ROLLBACK=completed")
        except Exception as error:
            print(f"ROLLBACK_ERROR={error}")
        raise
    finally:
        if ssh.get_transport() and ssh.get_transport().is_active():
            run(ssh, f"find {q(ROOT + '/src/handlers')} -maxdepth 1 -type f -name {q('*.abv2-' + stamp + '*')} -delete", timeout=30, check=False)
            run(ssh, f"rm -f -- {q(ROOT + '/ecosystem.config.js.abv2-' + stamp + '.js')}", timeout=30, check=False)
        ssh.close()


if __name__ == "__main__":
    main()
