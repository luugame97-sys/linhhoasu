"""Stage and QA timed-ban candidate on VPS without changing source or DB."""

from __future__ import annotations

import base64
import getpass
import json
import os
import shlex
from datetime import datetime, timezone
from pathlib import Path

import paramiko


HOST = "103.116.105.154"
ROOT = Path(__file__).resolve().parents[1]
CANDIDATE = ROOT / "temp" / "timed_ban_candidate_20260901"
OUT = ROOT / "temp" / "timed_ban_qa"
FILES = (
    "game/src/services/AccountBanService.js",
    "game/src/services/AccountService.js",
    "game/src/db/models/Account.js",
    "game/src/handlers/account.js",
    "game/src/handlers/serverList.js",
    "game/src/net/HTTPServer.js",
    "game/src/net/WSServer.js",
)
REMOTE_ROOT = "/linhhoasu/_ai_workbench/temp/timed_ban_candidate_qa"


def encode(value: str) -> str:
    return base64.b64encode(value.encode()).decode()


def run(ssh: paramiko.SSHClient, command: str, timeout: int = 120) -> str:
    _, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    output = stdout.read().decode("utf-8", "replace")
    error = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError(error[-8000:] or output[-8000:] or f"remote exit={code}")
    return output


DIRECT_QA = r'''
const HTTPServer = require(process.argv[1]);
const h = new HTTPServer({ port: 0, apiKey: 'qa-only' });
function response(label) { return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { console.log(label + '=' + JSON.stringify({statusCode:this.statusCode, value})); } }; }
(async()=>{
  await h._internalAccountBanStatus({body:{accountId:'testweb01'}}, response('STATUS'));
  await h._internalAccountBan({body:{accountId:'testweb01',durationDays:100,reason:'QA preview only',code:'QA_TIMED_BAN',dryRun:true}}, response('PREVIEW'));
})().catch(e=>{console.error(e.stack||String(e));process.exit(1)});
'''


def main() -> None:
    for relative in FILES:
        local = CANDIDATE / relative
        if not local.is_file():
            raise FileNotFoundError(local)
    password = os.environ.get("LHS_PROD_PASSWORD") or getpass.getpass("Production password (not logged): ")
    ssh = paramiko.SSHClient(); ssh.load_system_host_keys(); ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False, allow_agent=False, timeout=20, banner_timeout=20, auth_timeout=20)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    remote_dir = REMOTE_ROOT + "_" + stamp
    try:
        run(ssh, f"mkdir -p -- {shlex.quote(remote_dir)}")
        sftp = ssh.open_sftp()
        try:
            for relative in FILES:
                local = CANDIDATE / relative
                remote = remote_dir + "/" + relative
                parent = "/".join(remote.split("/")[:-1])
                run(ssh, f"mkdir -p -- {shlex.quote(parent)}")
                sftp.put(str(local), remote)
        finally:
            sftp.close()
        node_files = " ".join(shlex.quote(remote_dir + "/" + rel) for rel in FILES if rel.endswith((".js",)))
        syntax = run(ssh, f"for f in {node_files}; do node --check \"$f\" || exit 1; done")
        service_test = run(ssh, f"node {shlex.quote(remote_dir + '/game/src/services/AccountBanService.js')} >/dev/null 2>&1 || true")
        qa_source = encode(DIRECT_QA)
        direct = run(ssh, f"cd /linhhoasu/lhs/newServer && node -e \"eval(Buffer.from('{qa_source}','base64').toString('utf8'))\" {shlex.quote(remote_dir + '/game/src/net/HTTPServer.js')}")
        webgm_php = run(ssh, "php -l /linhhoasu/_ai_workbench/temp/timed_ban_candidate_qa_webgm/admin/admin_api.php 2>&1 || true")
    finally:
        ssh.close()
    OUT.mkdir(parents=True, exist_ok=True)
    result = {"generatedAt": datetime.now(timezone.utc).isoformat(), "host": HOST, "readOnly": True, "remoteStage": remote_dir, "syntax": syntax, "directQa": direct, "webgmPhp": webgm_php, "serviceTest": service_test}
    target = OUT / f"timed_ban_candidate_qa_{stamp}.json"
    target.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(target), **result}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
