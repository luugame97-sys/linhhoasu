"""Deploy REST login opening-time gate to S1/S2 with rollback."""
from __future__ import annotations

import hashlib
import json
import os
import shlex
from datetime import datetime, timezone
from pathlib import Path

import paramiko


HOST = "103.116.105.154"
ROOT = Path(__file__).resolve().parents[1]
LOCAL = ROOT.parent / "linhhoasu" / "lhs" / "newServer" / "src" / "net" / "HTTPServer.js"
REMOTE = "/linhhoasu/lhs/newServer/src/net/HTTPServer.js"
EXPECTED_BEFORE = "d061f571f0c73cd72f3587f5f886cecb4b8a116c5324f82feed15220720587bb"


def run(ssh, command, timeout=180):
    _, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    output = stdout.read().decode("utf-8", "replace")
    error = stderr.read().decode("utf-8", "replace")
    return stdout.channel.recv_exit_status(), output, error


def require_ok(ssh, command, timeout=180):
    code, output, error = run(ssh, command, timeout)
    if code:
        raise RuntimeError((error + "\n" + output)[-10000:])
    return output


def role_counts(ssh):
    expression = 'JSON.stringify({players:db.getSiblingDB("lhs_s1002").players.countDocuments({isBot:{$ne:true}}),roles:db.accounts.aggregate([{$unwind:"$roles"},{$match:{"roles.serverId":1002}},{$count:"n"}]).toArray()})'
    return json.loads(require_ok(ssh, "mongosh --quiet mongodb://127.0.0.1:27017/lhs_s1001 --eval " + shlex.quote(expression)).strip())


def probe(ssh, port):
    command = (
        "curl -sS --max-time 10 -o /tmp/s2_rest_gate.json -w '%{http_code}' "
        f"-H 'Content-Type: application/json' -d '{{\"accountId\":\"gate_probe_only\",\"password\":\"never_used_password\",\"serverId\":1002}}' http://127.0.0.1:{port}/api/user/login"
    )
    code = require_ok(ssh, command).strip()
    data = json.loads(require_ok(ssh, "cat /tmp/s2_rest_gate.json; rm -f /tmp/s2_rest_gate.json"))
    return {"http": int(code), "code": data.get("code"), "openTime": int(data.get("openTime") or 0)}


def main():
    credentials = [line.strip() for line in Path(os.environ["LHS_PROD_CREDENTIAL_FILE"]).read_text(encoding="utf-8-sig").splitlines() if line.strip()]
    if len(credentials) != 3 or credentials[0] != HOST or credentials[1] != "root":
        raise RuntimeError("CREDENTIAL_FILE_TARGET_MISMATCH")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup = f"/linhhoasu/_ai_workbench/backups/server2_rest_gate_pre_{stamp}"
    stage = f"/linhhoasu/_ai_workbench/temp/server2_rest_gate_{stamp}.js"
    evidence = ROOT / "temp" / f"server2_rest_gate_deploy_{stamp}.json"

    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
    ssh.connect(HOST, username="root", password=credentials[2], look_for_keys=False, allow_agent=False, timeout=20)
    backup_ready = False
    installed = False
    try:
        before_hash = require_ok(ssh, f"sha256sum {shlex.quote(REMOTE)}").split()[0].lower()
        if before_hash != EXPECTED_BEFORE:
            raise RuntimeError("REMOTE_DRIFT:HTTPServer.js")
        before_roles = role_counts(ssh)
        require_ok(ssh, f"install -d -m 700 {shlex.quote(backup)} && cp -a {shlex.quote(REMOTE)} {shlex.quote(backup + '/HTTPServer.js')}")
        backup_ready = True
        sftp = ssh.open_sftp()
        try:
            sftp.put(str(LOCAL), stage)
        finally:
            sftp.close()
        require_ok(ssh, f"node --check {shlex.quote(stage)}")
        require_ok(ssh, f"install -m 644 {shlex.quote(stage)} {shlex.quote(REMOTE)}")
        installed = True
        require_ok(ssh, "cd /linhhoasu/lhs/newServer && pm2 restart ecosystem.config.js --only lhs-s1002 --update-env", timeout=180)
        require_ok(ssh, "for i in $(seq 1 45); do c=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8083/ready||true); [ \"$c\" = 200 ] && exit 0; sleep 1; done; exit 1", timeout=60)
        s2_probe = probe(ssh, 8083)
        require_ok(ssh, "cd /linhhoasu/lhs/newServer && pm2 restart ecosystem.config.js --only lhs-s1001 --update-env", timeout=180)
        require_ok(ssh, "for i in $(seq 1 45); do c=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/ready||true); [ \"$c\" = 200 ] && exit 0; sleep 1; done; exit 1", timeout=60)
        s1_probe = probe(ssh, 8080)
        if any(p["http"] != 403 or p["code"] != "SERVER_NOT_OPEN" or p["openTime"] != 1788516000000 for p in [s1_probe, s2_probe]):
            raise RuntimeError("REST_GATE_PROBE_FAILED")
        after_roles = role_counts(ssh)
        if after_roles != before_roles:
            raise RuntimeError("REST_GATE_CREATED_DATA")
        require_ok(ssh, "pm2 save")
        payload = {
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "backup": backup,
            "beforeRoles": before_roles,
            "afterRoles": after_roles,
            "s1Probe": s1_probe,
            "s2Probe": s2_probe,
            "sha256": hashlib.sha256(LOCAL.read_bytes()).hexdigest(),
        }
        evidence.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps({"result":"PASS","backup":backup,"evidence":str(evidence),"sha256":hashlib.sha256(evidence.read_bytes()).hexdigest()}, ensure_ascii=False, indent=2))
    except Exception:
        if installed and backup_ready:
            run(ssh, f"cp -a {shlex.quote(backup + '/HTTPServer.js')} {shlex.quote(REMOTE)}")
            run(ssh, "cd /linhhoasu/lhs/newServer && pm2 restart ecosystem.config.js --only lhs-s1002 --update-env", timeout=180)
            run(ssh, "cd /linhhoasu/lhs/newServer && pm2 restart ecosystem.config.js --only lhs-s1001 --update-env", timeout=180)
            run(ssh, "pm2 save")
        raise
    finally:
        run(ssh, f"rm -f -- {shlex.quote(stage)} /tmp/s2_rest_gate.json")
        ssh.close()


if __name__ == "__main__":
    main()
