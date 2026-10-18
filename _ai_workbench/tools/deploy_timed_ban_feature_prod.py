"""Deploy timed-ban infrastructure + WebGM controls without banning users.

This checkpoint only installs code/UI. It does not call the commit-ban endpoint
and does not mutate Account documents. Every source replacement has an exact
live SHA precondition and a remote backup/rollback path.
"""

from __future__ import annotations

import base64
import getpass
import hashlib
import json
import os
import shlex
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

import paramiko


HOST = "103.116.105.154"
ROOT = Path(__file__).resolve().parents[1]
CANDIDATE = ROOT / "temp" / "account_management_redesign_candidate_20260901"
GAME = CANDIDATE / "game" / "src"
WEBGM = CANDIDATE / "webgm"
TEST_SERVICE = ROOT / "tools" / "test_timed_ban_contract.js"
TEST_HTTP = ROOT / "tools" / "test_timed_ban_http_contract.js"

FILES = {
    "game/src/services/AccountBanService.js": {
        "remote": "/linhhoasu/lhs/newServer/src/services/AccountBanService.js",
        "candidate": GAME / "services" / "AccountBanService.js",
        "expected": "3ef053cbfc95f6bed147205cb2ef8897e5ec7d3f0c710a164ddbc7d71f9397c9",
    },
    "game/src/db/models/Account.js": {
        "remote": "/linhhoasu/lhs/newServer/src/db/models/Account.js",
        "candidate": GAME / "db" / "models" / "Account.js",
        "expected": "77315dc8b89e15deb3a979586d9ffdec60ce41ccc66ace781a1335fbaf237616",
    },
    "game/src/services/AccountService.js": {
        "remote": "/linhhoasu/lhs/newServer/src/services/AccountService.js",
        "candidate": GAME / "services" / "AccountService.js",
        "expected": "f1e6f565c0dfde13c21f256387a42a2cd978cc72eb857e671ae5f35dc096a0b9",
    },
    "game/src/handlers/account.js": {
        "remote": "/linhhoasu/lhs/newServer/src/handlers/account.js",
        "candidate": GAME / "handlers" / "account.js",
        "expected": "326c1773c09318dfdbfa3de9b5a54719d770f71d98c54f511cb5a52106a61910",
    },
    "game/src/handlers/serverList.js": {
        "remote": "/linhhoasu/lhs/newServer/src/handlers/serverList.js",
        "candidate": GAME / "handlers" / "serverList.js",
        "expected": "714750d206e204599602c8c843eda6ff5aec6cf7a41ec4c660b23b9a66c134ec",
    },
    "game/src/net/HTTPServer.js": {
        "remote": "/linhhoasu/lhs/newServer/src/net/HTTPServer.js",
        "candidate": GAME / "net" / "HTTPServer.js",
        "expected": "cbefaa1dbdba23f80b63d8e1ae7ffc46b5056359c1a9cce306de909f1929d6ae",
    },
    "game/src/net/WSServer.js": {
        "remote": "/linhhoasu/lhs/newServer/src/net/WSServer.js",
        "candidate": GAME / "net" / "WSServer.js",
        "expected": "9c7e82f49fdbc13934b4262da00823bf7b9f91a5b64a7b70fd910c535269cc8f",
    },
    "game/src/handlers/activity.js": {
        "remote": "/linhhoasu/lhs/newServer/src/handlers/activity.js",
        "candidate": GAME / "handlers" / "activity.js",
        # Current production includes the previously deployed Fortune daily
        # ledger hotfix; this is its exact post-hotfix hash.
        "expected": "d4d01c76bad282f7baa0cf98f207c3fcf1e42aa80c5de01762c64e9a30a859f6",
    },
    "webgm/config.php": {
        "remote": "/linhhoasu/webgame/gm/config.php",
        "candidate": WEBGM / "config.php",
        "expected": "14fd6fc65762065f3059833d9713b310011475e3125484e8536ff2b824614d22",
    },
    "webgm/admin/admin_api.php": {
        "remote": "/linhhoasu/webgame/gm/admin/admin_api.php",
        "candidate": WEBGM / "admin" / "admin_api.php",
        "expected": "99596f9a1898f788423d484a2d888066b00070c3ae2b65622f6fe3229f1295c5",
    },
    "webgm/admin/index.php": {
        "remote": "/linhhoasu/webgame/gm/admin/index.php",
        "candidate": WEBGM / "admin" / "index.php",
        "expected": "4d2d25332a67f57eec8a7bf29f12ca45015eb5e74c71322f48ce7b07e96a115b",
    },
    "webgm/assets/js/admin.js": {
        "remote": "/linhhoasu/webgame/gm/assets/js/admin.js",
        "candidate": WEBGM / "assets" / "js" / "admin.js",
        "expected": "99c527a446cbb30ebd0acf970218717b5b27ddc8543d9205b88d88092a0deb05",
    },
}

# Preconditions above are pinned to the last verified live deployment. Do not
# derive them from an older snapshot: this repository intentionally keeps many
# historical candidates and a stale snapshot could silently weaken the guard.


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def encode(source: str) -> str:
    return base64.b64encode(source.encode()).decode()


def local(args: list[str], env: dict[str, str] | None = None) -> str:
    result = subprocess.run(args, cwd=ROOT, env=env, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=180)
    if result.returncode:
        raise RuntimeError((result.stdout + "\n" + result.stderr)[-8000:])
    return result.stdout


def remote(ssh: paramiko.SSHClient, command: str, timeout: int = 180) -> str:
    _, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    output = stdout.read().decode("utf-8", "replace")
    error = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError(error[-8000:] or output[-8000:] or f"remote exit={code}")
    return output


def main() -> None:
    for relative, item in FILES.items():
        if not item["candidate"].is_file():
            raise FileNotFoundError(item["candidate"])
    env = os.environ.copy()
    env["NODE_PATH"] = str((ROOT / ".." / "linhhoasu" / "lhs" / "newServer" / "node_modules").resolve())
    env["TIMED_BAN_APP_ROOT"] = str(CANDIDATE / "game")
    local(["node", "--check", str(GAME / "services" / "AccountBanService.js")])
    local(["node", "--check", str(GAME / "services" / "AccountService.js")])
    local(["node", str(TEST_SERVICE)], env=env)
    local(["node", str(TEST_HTTP)], env=env)

    password = os.environ.get("LHS_PROD_PASSWORD") or getpass.getpass("Production password (not logged): ")
    ssh = paramiko.SSHClient(); ssh.load_system_host_keys(); ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False, allow_agent=False, timeout=20, banner_timeout=20, auth_timeout=20)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup_dir = f"/linhhoasu/_ai_workbench/backups/timed_ban_feature_pre_{stamp}"
    stage_dir = f"/linhhoasu/_ai_workbench/temp/timed_ban_feature_{stamp}"
    stopped = False
    swapped = False
    result = {}
    try:
        live_hash_output = remote(ssh, "sha256sum -- " + " ".join(shlex.quote(item["remote"]) for item in FILES.values() if not item.get("new")))
        for relative, item in FILES.items():
            if item.get("new"):
                continue
            expected = item["expected"]
            if expected not in live_hash_output:
                raise RuntimeError(f"hash precondition failed for {relative}; expected {expected}")
        pm2_before = remote(ssh, "pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{for(const p of JSON.parse(s)){if([\"lhs-s1001\",\"lhs-dist\",\"lhs-admin\",\"lhs-real-bots\"].includes(p.name)){const e=p.pm2_env||{};console.log(JSON.stringify({name:p.name,status:e.status,pid:p.pid,restarts:e.restart_time,uptime:e.pm_uptime}))}}})'")
        remote(ssh, f"mkdir -p -- {shlex.quote(backup_dir)} {shlex.quote(stage_dir)}")
        # Keep only a redacted process checkpoint; pm2 jlist contains the
        # complete environment and must never be copied into a backup.
        backup_commands = [
            "pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{for(const p of JSON.parse(s)){if([\"lhs-s1001\",\"lhs-dist\",\"lhs-admin\",\"lhs-real-bots\"].includes(p.name)){const e=p.pm2_env||{};console.log(JSON.stringify({name:p.name,status:e.status,pid:p.pid,restarts:e.restart_time,uptime:e.pm_uptime,cwd:e.pm_cwd,script:e.pm_exec_path}))}}})'"
            + f" > {shlex.quote(backup_dir + '/pm2-before-redacted.json')}"
        ]
        for relative, item in FILES.items():
            if item.get("new"):
                backup_commands.append(f"test ! -e {shlex.quote(item['remote'])} || cp -a -- {shlex.quote(item['remote'])} {shlex.quote(backup_dir + '/' + Path(item['remote']).name)}")
            else:
                backup_commands.append(f"cp -a -- {shlex.quote(item['remote'])} {shlex.quote(backup_dir + '/' + Path(item['remote']).name)}")
        remote(ssh, " && ".join(backup_commands))
        sftp = ssh.open_sftp()
        try:
            for relative, item in FILES.items():
                stage = stage_dir + "/" + relative
                parent = "/".join(stage.split("/")[:-1])
                remote(ssh, f"mkdir -p -- {shlex.quote(parent)}")
                sftp.put(str(item["candidate"]), stage)
        finally:
            sftp.close()
        staged_js = " ".join(shlex.quote(stage_dir + "/" + relative) for relative, item in FILES.items() if relative.endswith(".js"))
        remote(ssh, f"for f in {staged_js}; do node --check \"$f\" || exit 1; done")
        remote(ssh, "php -l " + shlex.quote(stage_dir + "/webgm/config.php") + " >/dev/null")
        remote(ssh, "php -l " + shlex.quote(stage_dir + "/webgm/admin/admin_api.php") + " >/dev/null")

        # Stop only the game process during atomic source replacement. WebGM is
        # PHP-FPM/static and is live immediately after its files are installed.
        remote(ssh, "pm2 stop lhs-s1001")
        stopped = True
        install_commands = []
        for relative, item in FILES.items():
            stage = stage_dir + "/" + relative
            mode = "0644"
            install_commands.append(f"install -o root -g root -m {mode} -- {shlex.quote(stage)} {shlex.quote(item['remote'])}")
        remote(ssh, " && ".join(install_commands))
        swapped = True
        deployed_hashes = remote(ssh, "sha256sum -- " + " ".join(shlex.quote(item["remote"]) for item in FILES.values()))
        for relative, item in FILES.items():
            expected = sha(item["candidate"])
            if expected not in deployed_hashes:
                raise RuntimeError(f"deployed hash mismatch for {relative}; expected {expected}")
        remote(ssh, "pm2 restart lhs-s1001 --update-env && pm2 save")
        stopped = False
        time.sleep(5)
        health = remote(ssh, "curl -sS --max-time 15 http://127.0.0.1:8080/ready; printf '\n'; curl -sS --max-time 15 http://127.0.0.1:9200/health | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{const x=JSON.parse(s);console.log(JSON.stringify({status:x.status,pid:x.runtime&&x.runtime.pid,revision:x.runtime&&x.runtime.revision,clients:x.runtime&&x.runtime.clients}))})'")
        if '"status":"ok"' not in health or '"mongo":true' not in health or '"redis":true' not in health:
            raise RuntimeError("health gate failed: " + health)
        # Signed internal preview/status smoke. It reads the QA account and
        # must never set confirm/dryRun=false.
        preview_js = r'''
const crypto=require('crypto'),http=require('http');
const key=process.env.API_KEY||'';const path='/api/internal/account/ban';const body=JSON.stringify({accountId:'testweb01',durationDays:100,durationMinutes:0,reason:'QA preview only',code:'QA_TIMED_BAN',dryRun:true,confirm:false});const ts=String(Date.now()),nonce=crypto.randomBytes(12).toString('hex');const sig=crypto.createHmac('sha256',key).update('POST\n'+path+'\n'+ts+'\n'+nonce+'\n'+body).digest('hex');const req=http.request({host:'127.0.0.1',port:8080,path,method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body),'X-API-Key':key,'X-Timestamp':ts,'X-Nonce':nonce,'X-Signature':sig}},res=>{let s='';res.on('data',d=>s+=d);res.on('end',()=>{console.log('PREVIEW_HTTP='+res.statusCode+' '+s);if(res.statusCode!==200)process.exit(1)})});req.on('error',e=>{console.error(e);process.exit(1)});req.end(body);
'''
        encoded_preview = encode(preview_js)
        preview = remote(ssh, f"API_KEY=\"$(pm2 env 0 | awk -F': ' '/^API_KEY:/{{print $2; exit}}')\" node -e \"eval(Buffer.from('{encoded_preview}','base64').toString('utf8'))\"", timeout=60)
        if "PREVIEW_HTTP=200" not in preview or '"dryRun":true' not in preview or '"preview":true' not in preview:
            raise RuntimeError("internal preview smoke failed: " + preview[-4000:])
        php_bridge = remote(ssh, "php -l " + shlex.quote(stage_dir + "/webgm/config.php") + " >/dev/null; echo PHP_LINT_OK")
        if "PHP_LINT_OK" not in php_bridge:
            raise RuntimeError("WebGM PHP lint marker missing")
        pm2_after = remote(ssh, "pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{for(const p of JSON.parse(s)){if([\"lhs-s1001\",\"lhs-dist\",\"lhs-admin\",\"lhs-real-bots\"].includes(p.name)){const e=p.pm2_env||{};console.log(JSON.stringify({name:p.name,status:e.status,pid:p.pid,restarts:e.restart_time,uptime:e.pm_uptime}))}}})'")
        result = {
            "result": "PASS",
            "host": HOST,
            "backupDir": backup_dir,
            "stageDir": stage_dir,
            "files": {relative: sha(item["candidate"]) for relative, item in FILES.items()},
            "health": health,
            "preview": preview[-3000:],
            "pm2Before": pm2_before,
            "pm2After": pm2_after,
            "accountMutation": False,
            "banCommitCalled": False,
        }
    except Exception:
        if stopped or swapped:
            try:
                if not stopped:
                    remote(ssh, "pm2 stop lhs-s1001")
                    stopped = True
                restore = []
                for relative, item in FILES.items():
                    backup = backup_dir + "/" + Path(item["remote"]).name
                    if item.get("new"):
                        restore.append(f"if test -e {shlex.quote(backup)}; then cp -a -- {shlex.quote(backup)} {shlex.quote(item['remote'])}; else rm -f -- {shlex.quote(item['remote'])}; fi")
                    else:
                        restore.append(f"cp -a -- {shlex.quote(backup)} {shlex.quote(item['remote'])}")
                remote(ssh, " && ".join(restore))
                remote(ssh, "pm2 restart lhs-s1001 --update-env")
            except Exception:
                pass
        raise
    finally:
        ssh.close()
    OUT_DIR = ROOT / "temp" / "timed_ban_qa"
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    evidence = OUT_DIR / f"timed_ban_feature_deploy_{stamp}.json"
    evidence.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"evidence": str(evidence), **result}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
