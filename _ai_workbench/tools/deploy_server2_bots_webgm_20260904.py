"""Deploy S2 bots and multi-server WebGM routing with rollback checkpoints."""
from __future__ import annotations

import hashlib
import json
import os
import posixpath
import shlex
import time
from datetime import datetime, timezone
from pathlib import Path

import paramiko


HOST = "103.116.105.154"
ROOT = Path(__file__).resolve().parents[1]
CANDIDATE = ROOT / "temp" / "server2_bots_webgm_candidate_20260904"
WEBGM_SNAPSHOT = ROOT / "temp" / "server2_bots_webgm_snapshot_20260903_220109"
GAME_SNAPSHOT = ROOT / "temp" / "server2_public_gate_snapshot_20260903_214725"
WEBGM_ROOT = "/linhhoasu/webgame/gm"
GAME_ROOT = "/linhhoasu/lhs/newServer"
TARGET_BOTS = 580


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


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def remote_hash(ssh: paramiko.SSHClient, path: str) -> str:
    return require_ok(ssh, f"sha256sum {shlex.quote(path)}").split()[0].lower()


def marker_json(output: str, marker: str):
    if marker not in output:
        raise RuntimeError(f"MARKER_MISSING:{marker}")
    return json.loads(output.split(marker, 1)[1].splitlines()[0])


def s2_health(ssh: paramiko.SSHClient) -> dict:
    raw = require_ok(
        ssh,
        "curl -sS --max-time 15 http://127.0.0.1:9201/health | node -e "
        + shlex.quote(
            'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const x=JSON.parse(s),r=x.runtime||{},b=r.bots||{},real=b.real||{},m=r.mapMonsters||{};console.log(JSON.stringify({status:x.status,pid:r.pid,clients:Number(r.clients)||0,botsEnabled:b.enabled===true,virtualBots:Number(b.botCount)||0,realBots:Number(real.count)||0,invalid:Number(m.invalid)||0,claims:Number(m.claims)||0,completed:Number(m.completed)||0}))})'
        ),
    ).strip()
    return json.loads(raw)


def bot_process(ssh: paramiko.SSHClient) -> dict:
    raw = require_ok(
        ssh,
        "pm2 jlist | node -e " + shlex.quote(
            'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const p=JSON.parse(s).find(x=>x.name==="lhs-real-bots-s2");if(!p)return console.log(JSON.stringify({status:"missing"}));const e=p.pm2_env||{},m=p.monit||{};console.log(JSON.stringify({status:e.status,pid:p.pid,restarts:e.restart_time,cpu:m.cpu,memory:m.memory}))})'
        ),
    ).strip()
    return json.loads(raw)


def server_capacity(ssh: paramiko.SSHClient) -> dict:
    raw = require_ok(
        ssh,
        "node -e " + shlex.quote(
            'const fs=require("fs");const l=fs.readFileSync("/proc/loadavg","utf8").trim().split(/\\s+/);const m={};for(const x of fs.readFileSync("/proc/meminfo","utf8").trim().split("\\n")){const p=x.split(/:\\s+/);m[p[0]]=Number((p[1]||"").split(/\\s+/)[0])||0}console.log(JSON.stringify({load1:Number(l[0]),load5:Number(l[1]),memAvailableMb:Math.round((m.MemAvailable||0)/1024),swapFreeMb:Math.round((m.SwapFree||0)/1024)}))'
        ),
    ).strip()
    return json.loads(raw)


def mongo_eval(ssh: paramiko.SSHClient, db_name: str, expression: str):
    output = require_ok(
        ssh,
        f"mongosh --quiet mongodb://127.0.0.1:27017/{db_name} --eval {shlex.quote('JSON.stringify(' + expression + ')')}",
    ).strip()
    return json.loads(output)


def main() -> None:
    credentials = [line.strip() for line in Path(os.environ["LHS_PROD_CREDENTIAL_FILE"]).read_text(encoding="utf-8-sig").splitlines() if line.strip()]
    if len(credentials) != 3 or credentials[0] != HOST or credentials[1] != "root":
        raise RuntimeError("CREDENTIAL_FILE_TARGET_MISMATCH")

    required = [
        CANDIDATE / "ecosystem.config.js",
        CANDIDATE / "webgm" / "config.php",
        ROOT / "tools" / "update_webgm_s2_env.py",
        ROOT / "tools" / "audit_webgm_server2_contract.php",
        ROOT / "tools" / "qa_webgm_s2_mail.php",
    ]
    for path in required:
        if not path.is_file():
            raise FileNotFoundError(path)

    web_manifest = json.loads((WEBGM_SNAPSHOT / "manifest.json").read_text(encoding="utf-8"))
    web_expected = {row["remote"]: row["sha256"].lower() for row in web_manifest["files"] if not row.get("missing")}
    game_manifest = json.loads((GAME_SNAPSHOT / "manifest.json").read_text(encoding="utf-8"))
    game_expected = {row["remote"]: row["sha256"].lower() for row in game_manifest["files"] if not row.get("missing")}

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup = f"/linhhoasu/_ai_workbench/backups/server2_bots_webgm_pre_{stamp}"
    stage = f"/linhhoasu/_ai_workbench/temp/server2_bots_webgm_{stamp}"
    evidence = ROOT / "temp" / f"server2_bots_webgm_deploy_{stamp}.json"
    event_key = f"qa_webgm_s2_{stamp}"

    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
    ssh.connect(HOST, username="root", password=credentials[2], look_for_keys=False, allow_agent=False, timeout=20)

    backed_up = False
    web_installed = False
    ecosystem_installed = False
    worker_started = False
    qa_mail_user = ""
    try:
        before_capacity = server_capacity(ssh)
        before_health = s2_health(ssh)
        before_counts = mongo_eval(ssh, "lhs_s1002", "({players:db.players.countDocuments({}),bots:db.players.countDocuments({isBot:true}),humans:db.players.countDocuments({isBot:{$ne:true}}),mails:db.mails.countDocuments({})})")
        if before_capacity["memAvailableMb"] < 8000 or before_capacity["load1"] > 4:
            raise RuntimeError("S2_BOT_CAPACITY_GATE_FAILED")
        if before_health["realBots"] != 0 or before_health["botsEnabled"]:
            raise RuntimeError("S2_BOTS_ALREADY_ENABLED")
        if bot_process(ssh).get("status") != "missing":
            raise RuntimeError("S2_BOT_PROCESS_ALREADY_EXISTS")

        current_webgm = f"{WEBGM_ROOT}/config.php"
        current_ecosystem = f"{GAME_ROOT}/ecosystem.config.js"
        if remote_hash(ssh, current_webgm) != web_expected[current_webgm]:
            raise RuntimeError("REMOTE_DRIFT:webgm/config.php")
        if remote_hash(ssh, current_ecosystem) != game_expected[current_ecosystem]:
            raise RuntimeError("REMOTE_DRIFT:ecosystem.config.js")

        require_ok(ssh, f"install -d -m 700 {shlex.quote(backup)} {shlex.quote(stage)}")
        require_ok(ssh, f"cp -a {shlex.quote(current_ecosystem)} {shlex.quote(backup + '/ecosystem.config.js')}")
        require_ok(ssh, f"cp -a {shlex.quote(current_webgm)} {shlex.quote(backup + '/config.php')}")
        require_ok(ssh, f"cp -a {shlex.quote(WEBGM_ROOT + '/.env')} {shlex.quote(backup + '/webgm.env')}")
        backed_up = True

        uploads = {
            CANDIDATE / "ecosystem.config.js": f"{stage}/ecosystem.config.js",
            CANDIDATE / "webgm" / "config.php": f"{stage}/config.php",
            ROOT / "tools" / "update_webgm_s2_env.py": f"{stage}/update_webgm_s2_env.py",
            ROOT / "tools" / "audit_webgm_server2_contract.php": f"{stage}/audit_webgm_server2_contract.php",
            ROOT / "tools" / "qa_webgm_s2_mail.php": f"{stage}/qa_webgm_s2_mail.php",
        }
        sftp = ssh.open_sftp()
        try:
            for local, remote in uploads.items():
                sftp.put(str(local), remote)
        finally:
            sftp.close()

        require_ok(ssh, f"node --check {shlex.quote(stage + '/ecosystem.config.js')}")
        require_ok(ssh, f"php -l {shlex.quote(stage + '/config.php')}")
        require_ok(ssh, f"php -l {shlex.quote(stage + '/audit_webgm_server2_contract.php')}")
        require_ok(ssh, f"php -l {shlex.quote(stage + '/qa_webgm_s2_mail.php')}")
        require_ok(ssh, f"python3 -m py_compile {shlex.quote(stage + '/update_webgm_s2_env.py')}")

        before_web_audit_output = require_ok(
            ssh,
            f"php {shlex.quote(stage + '/audit_webgm_server2_contract.php')} {shlex.quote(current_webgm)}",
        )
        before_web_audit = marker_json(before_web_audit_output, "WEBGM_S2_AUDIT=")

        require_ok(ssh, f"ln -s {shlex.quote(WEBGM_ROOT + '/.env')} {shlex.quote(stage + '/.env')}")
        staging_env = (
            "LHS_SERVER_COUNT=2 LHS_SERVER_1_API_BASE=http://127.0.0.1:8080 "
            "LHS_SERVER_2_ID=1002 LHS_SERVER_2_KEY=1002 "
            "LHS_SERVER_2_NAME='Linh Họa Sư - S2' LHS_SERVER_2_API_BASE=http://127.0.0.1:8083"
        )
        staging_web_output = require_ok(
            ssh,
            f"cd {shlex.quote(stage)} && {staging_env} php audit_webgm_server2_contract.php config.php",
        )
        staging_web_audit = marker_json(staging_web_output, "WEBGM_S2_AUDIT=")
        if sorted(staging_web_audit["servers"].keys()) != ["1001", "1002"]:
            raise RuntimeError("STAGING_WEBGM_SERVER_LIST_FAILED")
        if not str(staging_web_audit["servers"]["1002"]["api_base"]).endswith(":8083"):
            raise RuntimeError("STAGING_WEBGM_S2_ROUTE_FAILED")
        if not all(staging_web_audit["server_scoped"].values()):
            raise RuntimeError("WEBGM_LEDGER_NOT_SERVER_SCOPED")

        require_ok(ssh, f"install -m 644 {shlex.quote(stage + '/config.php')} {shlex.quote(current_webgm)}")
        require_ok(ssh, f"python3 {shlex.quote(stage + '/update_webgm_s2_env.py')} {shlex.quote(WEBGM_ROOT + '/.env')}")
        require_ok(ssh, f"chown root:www {shlex.quote(WEBGM_ROOT + '/.env')} && chmod 640 {shlex.quote(WEBGM_ROOT + '/.env')}")
        web_installed = True

        live_web_output = require_ok(
            ssh,
            f"php {shlex.quote(stage + '/audit_webgm_server2_contract.php')} {shlex.quote(current_webgm)}",
        )
        live_web_audit = marker_json(live_web_output, "WEBGM_S2_AUDIT=")
        if sorted(live_web_audit["servers"].keys()) != ["1001", "1002"]:
            raise RuntimeError("LIVE_WEBGM_SERVER_LIST_FAILED")
        if not str(live_web_audit["servers"]["1002"]["api_base"]).endswith(":8083"):
            raise RuntimeError("LIVE_WEBGM_S2_ROUTE_FAILED")
        login_html = require_ok(ssh, "curl -sS --max-time 10 http://127.0.0.1:88/login.php")
        if "1002" not in login_html or "Linh Họa Sư - S2" not in login_html:
            raise RuntimeError("WEBGM_LOGIN_S2_OPTION_MISSING")

        require_ok(ssh, f"install -m 644 {shlex.quote(stage + '/ecosystem.config.js')} {shlex.quote(current_ecosystem)}")
        ecosystem_installed = True
        require_ok(ssh, f"cd {GAME_ROOT} && pm2 restart ecosystem.config.js --only lhs-s1002 --update-env", timeout=180)
        require_ok(ssh, "for i in $(seq 1 45); do code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8083/ready || true); [ \"$code\" = 200 ] && exit 0; sleep 1; done; exit 1", timeout=60)
        virtual_health = s2_health(ssh)
        if not virtual_health["botsEnabled"] or virtual_health["virtualBots"] != TARGET_BOTS:
            raise RuntimeError("S2_VIRTUAL_BOT_GATE_FAILED")

        require_ok(ssh, f"cd {GAME_ROOT} && pm2 start ecosystem.config.js --only lhs-real-bots-s2 --update-env", timeout=180)
        worker_started = True
        print("S2 bot worker started; waiting for staggered 580-bot login", flush=True)

        progress = []
        deadline = time.time() + 720
        while time.time() < deadline:
            health = s2_health(ssh)
            process = bot_process(ssh)
            capacity = server_capacity(ssh)
            counts = mongo_eval(ssh, "lhs_s1002", "({players:db.players.countDocuments({}),bots:db.players.countDocuments({isBot:true}),humans:db.players.countDocuments({isBot:{$ne:true}})})")
            row = {
                "at": datetime.now(timezone.utc).isoformat(),
                "realBots": health["realBots"],
                "virtualBots": health["virtualBots"],
                "clients": health["clients"],
                "dbBots": counts["bots"],
                "invalid": health["invalid"],
                "workerStatus": process.get("status"),
                "load1": capacity["load1"],
                "memAvailableMb": capacity["memAvailableMb"],
            }
            progress.append(row)
            print("BOT_PROGRESS=" + json.dumps(row, ensure_ascii=False), flush=True)
            if process.get("status") != "online" or health["invalid"] != 0:
                raise RuntimeError("S2_BOT_RUNTIME_GATE_FAILED")
            if capacity["memAvailableMb"] < 5000 or capacity["load1"] > 5.5:
                raise RuntimeError("S2_BOT_RESOURCE_GATE_FAILED")
            if health["realBots"] == TARGET_BOTS and counts["bots"] == TARGET_BOTS:
                break
            time.sleep(30)
        else:
            raise RuntimeError("S2_BOT_READY_TIMEOUT")

        print("S2 bots reached 580/580; soaking 45 seconds", flush=True)
        time.sleep(45)
        final_health = s2_health(ssh)
        final_capacity = server_capacity(ssh)
        final_counts = mongo_eval(ssh, "lhs_s1002", "({players:db.players.countDocuments({}),bots:db.players.countDocuments({isBot:true}),humans:db.players.countDocuments({isBot:{$ne:true}}),mails:db.mails.countDocuments({})})")
        if final_health["realBots"] != TARGET_BOTS or final_health["virtualBots"] != TARGET_BOTS or final_health["invalid"] != 0:
            raise RuntimeError("S2_BOT_SOAK_FAILED")

        qa_mail_user = str(mongo_eval(ssh, "lhs_s1002", "db.players.findOne({isBot:true},{_id:0,userId:1}).userId"))
        qa_output = require_ok(
            ssh,
            f"php {shlex.quote(stage + '/qa_webgm_s2_mail.php')} {shlex.quote(current_webgm)} {shlex.quote(qa_mail_user)} {shlex.quote(event_key)}",
        )
        mail_qa = marker_json(qa_output, "WEBGM_S2_MAIL_QA=")
        persisted = mongo_eval(ssh, "lhs_s1002", f"db.mails.countDocuments({{userId:{json.dumps(qa_mail_user)},eventKey:{json.dumps(event_key)},targetServerId:1002}})")
        if int(persisted) != 1:
            raise RuntimeError("WEBGM_S2_MAIL_NOT_PERSISTED")
        deleted = mongo_eval(ssh, "lhs_s1002", f"db.mails.deleteOne({{userId:{json.dumps(qa_mail_user)},eventKey:{json.dumps(event_key)}}})")
        if int(deleted.get("deletedCount", 0)) != 1:
            raise RuntimeError("WEBGM_S2_MAIL_CLEANUP_FAILED")
        qa_mail_user = ""

        require_ok(ssh, "pm2 save")
        final_worker = bot_process(ssh)
        error_audit = require_ok(
            ssh,
            "for f in /root/.pm2/logs/lhs-s1002-error.log /root/.pm2/logs/lhs-real-bots-s2-error.log; do "
            "echo FILE=$f; tail -200 \"$f\" 2>/dev/null | grep -Ei 'uncaught|unhandled|EADDRINUSE|SyntaxError|TypeError|ReferenceError|BOT_WORKER_TOKEN_REQUIRED' | tail -20 || true; done",
        )

        payload = {
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "host": HOST,
            "backup": backup,
            "before": {"capacity": before_capacity, "health": before_health, "counts": before_counts, "webgm": before_web_audit},
            "stagingWebgm": staging_web_audit,
            "liveWebgm": live_web_audit,
            "botProgress": progress,
            "final": {"health": final_health, "capacity": final_capacity, "counts": final_counts, "worker": final_worker},
            "mailQa": mail_qa,
            "mailQaCleaned": True,
            "errorAudit": error_audit,
            "hashes": {
                "ecosystem": digest(CANDIDATE / "ecosystem.config.js"),
                "webgmConfig": digest(CANDIDATE / "webgm" / "config.php"),
            },
        }
        evidence.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps({
            "result": "PASS",
            "bots": final_health["realBots"],
            "virtualBots": final_health["virtualBots"],
            "webgmServers": sorted(live_web_audit["servers"].keys()),
            "mailQaCleaned": True,
            "backup": backup,
            "evidence": str(evidence),
            "sha256": digest(evidence),
        }, ensure_ascii=False, indent=2), flush=True)
    except Exception:
        if qa_mail_user:
            run(ssh, f"mongosh --quiet mongodb://127.0.0.1:27017/lhs_s1002 --eval {shlex.quote('db.mails.deleteOne({userId:' + json.dumps(qa_mail_user) + ',eventKey:' + json.dumps(event_key) + '})')}")
        if worker_started:
            run(ssh, "pm2 delete lhs-real-bots-s2", timeout=90)
        if ecosystem_installed and backed_up:
            run(ssh, f"cp -a {shlex.quote(backup + '/ecosystem.config.js')} {shlex.quote(GAME_ROOT + '/ecosystem.config.js')}")
            run(ssh, f"cd {GAME_ROOT} && pm2 restart ecosystem.config.js --only lhs-s1002 --update-env", timeout=180)
        if web_installed and backed_up:
            run(ssh, f"cp -a {shlex.quote(backup + '/config.php')} {shlex.quote(WEBGM_ROOT + '/config.php')}")
            run(ssh, f"cp -a {shlex.quote(backup + '/webgm.env')} {shlex.quote(WEBGM_ROOT + '/.env')}")
        run(ssh, "pm2 save")
        raise
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
