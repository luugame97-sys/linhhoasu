import getpass
import json
from datetime import datetime, timezone
from pathlib import Path

import paramiko


HOST = "103.116.105.154"
APP_ROOT = "/linhhoasu/lhs/newServer"
REMOTE_ARTIFACT = f"{APP_ROOT}/src/handlers/artifact.js"
WORKSPACE = Path(r"I:\Linhhoasu\server\server")
LOCAL_ARTIFACT = WORKSPACE / "linhhoasu/lhs/newServer/src/handlers/artifact.js"
LOCAL_CONTRACT = WORKSPACE / "_ai_workbench/tools/test_artifact_feature_contract.js"


def run(ssh, command, timeout=120, check=True):
    _stdin, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    output = stdout.read().decode("utf-8", "replace")
    error = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if check and code:
        raise RuntimeError(error[-4000:] or output[-4000:] or f"remote command failed: {code}")
    return output


def wait_ready(ssh):
    return run(
        ssh,
        "for i in $(seq 1 45); do "
        "code=$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/ready || true); "
        "if [ \"$code\" = 200 ] && ss -lnt | grep -q ':9200 '; then echo READY; exit 0; fi; "
        "sleep 1; done; exit 1",
        timeout=60,
    ).strip()


def main():
    if not LOCAL_ARTIFACT.is_file() or not LOCAL_CONTRACT.is_file():
        raise FileNotFoundError("artifact source/contract missing")
    password = getpass.getpass("VPS password (not logged): ")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup = f"/linhhoasu/_ai_workbench/backups/artifact_fix_pre_{stamp}"
    stage = f"{REMOTE_ARTIFACT[:-3]}.artifact-fix-{stamp}.js"
    contract_remote = f"/linhhoasu/_ai_workbench/temp/test_artifact_feature_contract_{stamp}.js"
    installed = False
    worker_present = False

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False, allow_agent=False, timeout=15)
    try:
        run(ssh, f"set -eu; mkdir -p {backup}; cp -p {REMOTE_ARTIFACT} {backup}/artifact.js")
        worker_present = run(ssh, "pm2 describe lhs-real-bots >/dev/null 2>&1 && echo yes || echo no").strip() == "yes"

        sftp = ssh.open_sftp()
        try:
            sftp.put(str(LOCAL_ARTIFACT), stage)
            sftp.put(str(LOCAL_CONTRACT), contract_remote)
        finally:
            sftp.close()

        run(ssh, f"node --check {stage}")
        run(ssh, f"cd {APP_ROOT} && APP_ROOT={APP_ROOT} ARTIFACT_HANDLER_PATH={stage} node {contract_remote}", timeout=120)
        run(ssh, f"cd {APP_ROOT} && npm run test:core-contract", timeout=120)
        run(ssh, f"mv {stage} {REMOTE_ARTIFACT}; chmod 644 {REMOTE_ARTIFACT}")
        installed = True

        if worker_present:
            run(ssh, "pm2 stop lhs-real-bots")
        run(ssh, "pm2 restart lhs-s1001 --update-env")
        print("GAME_READY=" + wait_ready(ssh))
        if worker_present:
            run(ssh, "pm2 restart lhs-real-bots --update-env")
        run(ssh, "pm2 save")

        print("BACKUP=" + backup)
        print(run(ssh, f"sha256sum {REMOTE_ARTIFACT}").strip())
        print("READY_HTTP=" + run(ssh, "curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/ready").strip())
        print("WS_9200=" + run(ssh, "ss -lnt | grep -q ':9200 ' && echo listening").strip())
        print(run(ssh, "pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{for(const p of JSON.parse(s)){if([\"lhs-s1001\",\"lhs-real-bots\",\"lhs-dist\",\"lhs-admin\"].includes(p.name))console.log(p.name+\"=\"+p.pm2_env.status+\",pid=\"+p.pid+\",restarts=\"+p.pm2_env.restart_time)}})' ").strip())
        print("ARTIFACT_RUNTIME_ERRORS=" + run(ssh, "tail -n 120 /root/.pm2/logs/lhs-s1001-error.log 2>/dev/null | grep -E 'artifact|Artifact|SyntaxError|ReferenceError|TypeError' | tail -n 20 || true").strip())
    except Exception:
        if installed:
            try:
                run(ssh, f"cp -p {backup}/artifact.js {REMOTE_ARTIFACT}; pm2 restart lhs-s1001 --update-env")
                wait_ready(ssh)
            except Exception as rollback_error:
                print(f"ROLLBACK_ERROR={rollback_error}")
        if worker_present:
            try:
                run(ssh, "pm2 restart lhs-real-bots --update-env; pm2 save")
            except Exception as worker_error:
                print(f"WORKER_RECOVERY_ERROR={worker_error}")
        raise
    finally:
        for path in (stage, contract_remote):
            try:
                run(ssh, f"rm -f -- {path}")
            except Exception:
                pass
        ssh.close()


if __name__ == "__main__":
    main()
