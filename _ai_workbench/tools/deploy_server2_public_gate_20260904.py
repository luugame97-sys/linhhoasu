"""Deploy public-visible S2 with a server-authoritative opening-time gate."""
from __future__ import annotations

import base64
import hashlib
import json
import os
import shlex
from datetime import datetime, timezone
from pathlib import Path

import paramiko


HOST = "103.116.105.154"
ROOT = Path(__file__).resolve().parents[1]
CANDIDATE = ROOT / "temp" / "server2_public_gate_candidate_20260904"
SNAPSHOT = ROOT / "temp" / "server2_public_gate_snapshot_20260903_172432"
QA = ROOT / "tools" / "qa_server2_public_gate.js"
PUBLISH = ROOT / "tools" / "publish_server2_schedule.js"
REMOTE_ROOT = "/linhhoasu/lhs/newServer"
NGINX_PATH = "/www/server/panel/vhost/nginx/game.lhs.conf"
FILES = [
    "ecosystem.config.js",
    "src/handlers/serverList.js",
    "src/handlers/account.js",
    "src/net/WSServer.js",
    "src/net/HTTPServer.js",
    "src/services/AuthSessionService.js",
    "src/services/ServerAccessService.js",
    "src/db/models/Account.js",
    "src/db/models/GameServer.js",
]


def run(ssh: paramiko.SSHClient, command: str, timeout: int = 180) -> tuple[int, str, str]:
    _, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    output = stdout.read().decode("utf-8", "replace")
    error = stderr.read().decode("utf-8", "replace")
    return stdout.channel.recv_exit_status(), output, error


def require_ok(ssh: paramiko.SSHClient, command: str, timeout: int = 180) -> str:
    code, output, error = run(ssh, command, timeout)
    if code:
        raise RuntimeError((error + "\n" + output)[-12000:])
    return output


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def pm2_snapshot(ssh: paramiko.SSHClient) -> list[dict]:
    raw = require_ok(
        ssh,
        "pm2 jlist | node -e " + shlex.quote(
            'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const p of JSON.parse(s))'
            '{if(["lhs-s1001","lhs-s1002","lhs-real-bots","lhs-dist","lhs-admin"].includes(p.name))'
            '{const e=p.pm2_env||{};console.log(JSON.stringify({name:p.name,pid:p.pid,status:e.status,restarts:e.restart_time}))}}})'
        ),
    )
    return [json.loads(line) for line in raw.splitlines() if line.strip()]


def mongo_json(ssh: paramiko.SSHClient, db_name: str, expression: str):
    raw = require_ok(
        ssh,
        f"mongosh --quiet mongodb://127.0.0.1:27017/{shlex.quote(db_name)} --eval {shlex.quote('JSON.stringify(' + expression + ')')}",
    ).strip()
    return json.loads(raw)


def main() -> None:
    credential_file = Path(os.environ["LHS_PROD_CREDENTIAL_FILE"])
    credential_lines = [line.strip() for line in credential_file.read_text(encoding="utf-8-sig").splitlines() if line.strip()]
    if len(credential_lines) != 3 or credential_lines[0] != HOST or credential_lines[1] != "root":
        raise RuntimeError("CREDENTIAL_FILE_TARGET_MISMATCH")
    for path in [CANDIDATE, SNAPSHOT / "manifest.json", QA, PUBLISH]:
        if not path.exists():
            raise FileNotFoundError(path)
    for rel in FILES:
        if not (CANDIDATE / rel).is_file():
            raise FileNotFoundError(CANDIDATE / rel)
    if not (CANDIDATE / "nginx" / "game.lhs.conf").is_file():
        raise FileNotFoundError(CANDIDATE / "nginx" / "game.lhs.conf")

    manifest = json.loads((SNAPSHOT / "manifest.json").read_text(encoding="utf-8"))
    expected = {row["remote"]: row["sha256"] for row in manifest["files"]}
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    remote_backup = f"/linhhoasu/_ai_workbench/backups/server2_public_gate_pre_{stamp}"
    remote_stage = f"/linhhoasu/_ai_workbench/temp/server2_public_gate_{stamp}"
    evidence_path = ROOT / "temp" / f"server2_public_gate_deploy_{stamp}.json"

    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
    ssh.connect(HOST, username="root", password=credential_lines[2], look_for_keys=False, allow_agent=False, timeout=20)

    backup_ready = False
    source_installed = False
    nginx_installed = False
    published = False
    before_server = None
    try:
        before_pm2 = pm2_snapshot(ssh)
        before_server = mongo_json(
            ssh,
            "lhs_s1001",
            "db.gameservers.findOne({serverId:1002},{_id:0,serverId:1,pageId:1,pageName:1,serverName:1,running:1,status:1,isNew:1,isRecommend:1,openTime:1,rechargeArea:1})",
        )
        before_counts = {
            "s1": mongo_json(ssh, "lhs_s1001", "({accounts:db.accounts.countDocuments({}),players:db.players.countDocuments({})})"),
            "s2": mongo_json(ssh, "lhs_s1002", "({accounts:db.accounts.countDocuments({}),players:db.players.countDocuments({})})"),
        }
        if not before_server or before_server.get("running") is not False or int(before_server.get("status") or 0) != 0:
            raise RuntimeError("SERVER2_IDENTITY_NOT_PRIVATE")

        # Abort on production drift rather than overwriting a newer change.
        for rel in FILES:
            remote = f"{REMOTE_ROOT}/{rel}"
            if rel == "src/services/ServerAccessService.js":
                code, _, _ = run(ssh, f"test -e {shlex.quote(remote)}")
                if code == 0:
                    raise RuntimeError("SERVER_ACCESS_SERVICE_ALREADY_EXISTS")
                continue
            actual = require_ok(ssh, f"sha256sum {shlex.quote(remote)}").split()[0]
            if actual.lower() != expected[remote].lower():
                raise RuntimeError(f"REMOTE_DRIFT:{rel}")
        nginx_actual = require_ok(ssh, f"sha256sum {shlex.quote(NGINX_PATH)}").split()[0]
        if nginx_actual.lower() != expected[NGINX_PATH].lower():
            raise RuntimeError("REMOTE_DRIFT:nginx")

        require_ok(ssh, f"install -d -m 700 {shlex.quote(remote_backup)} {shlex.quote(remote_stage)}")
        for rel in FILES:
            remote = f"{REMOTE_ROOT}/{rel}"
            backup = f"{remote_backup}/{rel}"
            require_ok(ssh, f"install -d -m 700 {shlex.quote(str(Path(backup).parent).replace(os.sep, '/'))}")
            if rel != "src/services/ServerAccessService.js":
                require_ok(ssh, f"cp -a {shlex.quote(remote)} {shlex.quote(backup)}")
        require_ok(ssh, f"install -d -m 700 {shlex.quote(remote_backup + '/nginx')}")
        require_ok(ssh, f"cp -a {shlex.quote(NGINX_PATH)} {shlex.quote(remote_backup + '/nginx/game.lhs.conf')}")
        (ROOT / "temp" / f"server2_identity_before_{stamp}.json").write_text(
            json.dumps(before_server, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        backup_ready = True

        sftp = ssh.open_sftp()
        try:
            for rel in FILES:
                remote = f"{remote_stage}/{rel}"
                require_ok(ssh, f"install -d -m 700 {shlex.quote(str(Path(remote).parent).replace(os.sep, '/'))}")
                sftp.put(str(CANDIDATE / rel), remote)
            sftp.put(str(CANDIDATE / "nginx" / "game.lhs.conf"), f"{remote_stage}/game.lhs.conf")
            sftp.put(str(QA), f"{remote_stage}/qa_server2_public_gate.js")
            sftp.put(str(PUBLISH), f"{remote_stage}/publish_server2_schedule.js")
        finally:
            sftp.close()

        js_files = " ".join(shlex.quote(f"{remote_stage}/{rel}") for rel in FILES if rel.endswith(".js"))
        require_ok(ssh, f"for f in {js_files}; do node --check \"$f\" || exit $?; done")
        require_ok(ssh, f"node --check {shlex.quote(remote_stage + '/qa_server2_public_gate.js')}")
        require_ok(ssh, f"node --check {shlex.quote(remote_stage + '/publish_server2_schedule.js')}")

        for rel in FILES:
            require_ok(
                ssh,
                f"install -m 644 {shlex.quote(remote_stage + '/' + rel)} {shlex.quote(REMOTE_ROOT + '/' + rel)}",
            )
        source_installed = True

        require_ok(ssh, f"install -m 644 {shlex.quote(remote_stage + '/game.lhs.conf')} {shlex.quote(NGINX_PATH)}")
        nginx_installed = True
        require_ok(ssh, "nginx -t")

        require_ok(ssh, f"cd {REMOTE_ROOT} && pm2 restart ecosystem.config.js --only lhs-s1002 --update-env", timeout=180)
        require_ok(ssh, "for i in $(seq 1 30); do code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8083/ready || true); [ \"$code\" = 200 ] && exit 0; sleep 1; done; exit 1", timeout=60)
        private_qa = require_ok(ssh, f"cd {REMOTE_ROOT} && QA_MODE=private node {shlex.quote(remote_stage + '/qa_server2_public_gate.js')}")
        if "SERVER2_PRIVATE_GATE_QA=" not in private_qa:
            raise RuntimeError("PRIVATE_GATE_QA_FAILED")

        require_ok(ssh, f"cd {REMOTE_ROOT} && pm2 restart ecosystem.config.js --only lhs-s1001 --update-env", timeout=180)
        require_ok(ssh, "for i in $(seq 1 30); do code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/ready || true); [ \"$code\" = 200 ] && exit 0; sleep 1; done; exit 1", timeout=60)
        require_ok(ssh, "nginx -s reload")

        publish_output = require_ok(ssh, f"cd {REMOTE_ROOT} && node {shlex.quote(remote_stage + '/publish_server2_schedule.js')}")
        marker = "SERVER2_PUBLISH_JSON="
        if marker not in publish_output:
            raise RuntimeError("PUBLISH_MARKER_MISSING")
        publish_result = json.loads(publish_output.split(marker, 1)[1].splitlines()[0])
        published = True

        public_qa_output = require_ok(
            ssh,
            f"cd {REMOTE_ROOT} && WS_URL=ws://127.0.0.1:81/ws-s2 node {shlex.quote(remote_stage + '/qa_server2_public_gate.js')}",
        )
        qa_marker = "SERVER2_PUBLIC_GATE_QA="
        if qa_marker not in public_qa_output:
            raise RuntimeError("PUBLIC_GATE_QA_FAILED")
        public_qa = json.loads(public_qa_output.split(qa_marker, 1)[1].splitlines()[0])

        health = require_ok(
            ssh,
            "curl -sS --max-time 10 -w '\nS1_HTTP=%{http_code}\n' http://127.0.0.1:8080/ready; "
            "curl -sS --max-time 10 -w '\nS2_HTTP=%{http_code}\n' http://127.0.0.1:8083/ready",
        )
        if "S1_HTTP=200" not in health or "S2_HTTP=200" not in health:
            raise RuntimeError("POST_HEALTH_FAILED")
        after_pm2 = pm2_snapshot(ssh)
        after_server = mongo_json(
            ssh,
            "lhs_s1001",
            "db.gameservers.findOne({serverId:1002},{_id:0,serverId:1,pageId:1,pageName:1,serverName:1,running:1,status:1,isNew:1,isRecommend:1,openTime:1,rechargeArea:1})",
        )
        after_counts = {
            "s1": mongo_json(ssh, "lhs_s1001", "({accounts:db.accounts.countDocuments({}),players:db.players.countDocuments({})})"),
            "s2": mongo_json(ssh, "lhs_s1002", "({accounts:db.accounts.countDocuments({}),players:db.players.countDocuments({})})"),
        }
        require_ok(ssh, "pm2 save")
        error_tail = require_ok(
            ssh,
            "tail -n 120 /root/.pm2/logs/lhs-s1001-error.log 2>/dev/null || true; "
            "tail -n 120 /root/.pm2/logs/lhs-s1002-error.log 2>/dev/null || true",
        )

        payload = {
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "host": HOST,
            "openTime": 1788516000000,
            "localOpenTime": "2026-09-04T17:00:00+07:00",
            "backup": remote_backup,
            "beforePm2": before_pm2,
            "afterPm2": after_pm2,
            "beforeServer": before_server,
            "afterServer": after_server,
            "beforeCounts": before_counts,
            "afterCounts": after_counts,
            "publish": publish_result,
            "qa": public_qa,
            "health": health,
            "errorTailBytes": len(error_tail.encode("utf-8")),
            "candidateHashes": {rel: sha256_file(CANDIDATE / rel) for rel in FILES},
            "nginxHash": sha256_file(CANDIDATE / "nginx" / "game.lhs.conf"),
        }
        evidence_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps({
            "result": "PASS",
            "openTime": payload["localOpenTime"],
            "backup": remote_backup,
            "evidence": str(evidence_path),
            "sha256": sha256_file(evidence_path),
            "qaChecks": public_qa.get("checks"),
        }, ensure_ascii=False, indent=2))
    except Exception:
        if backup_ready:
            if published and before_server:
                restore_fields = {
                    key: before_server.get(key)
                    for key in ["pageId", "pageName", "serverName", "running", "status", "isNew", "isRecommend", "openTime", "rechargeArea"]
                }
                encoded = base64.b64encode(json.dumps(restore_fields).encode("utf-8")).decode("ascii")
                run(
                    ssh,
                    "mongosh --quiet mongodb://127.0.0.1:27017/lhs_s1001 --eval "
                    + shlex.quote(
                        f"const x=JSON.parse(Buffer.from('{encoded}','base64').toString());"
                        "db.gameservers.updateOne({serverId:1002},{$set:x})"
                    ),
                )
            if source_installed:
                for rel in FILES:
                    remote = f"{REMOTE_ROOT}/{rel}"
                    if rel == "src/services/ServerAccessService.js":
                        run(ssh, f"rm -f -- {shlex.quote(remote)}")
                    else:
                        run(ssh, f"cp -a {shlex.quote(remote_backup + '/' + rel)} {shlex.quote(remote)}")
                run(ssh, f"cd {REMOTE_ROOT} && pm2 restart ecosystem.config.js --only lhs-s1002,lhs-s1001 --update-env", timeout=180)
            if nginx_installed:
                run(ssh, f"cp -a {shlex.quote(remote_backup + '/nginx/game.lhs.conf')} {shlex.quote(NGINX_PATH)}")
                run(ssh, "nginx -t && nginx -s reload")
        raise
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
