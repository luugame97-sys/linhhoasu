import getpass
import hashlib
import os
from datetime import datetime, timezone
from pathlib import Path

import paramiko


HOST = "103.116.105.154"
APP_ROOT = "/linhhoasu/lhs/newServer"
CLIENT_ROOT = "/linhhoasu/webgame/game"
WORKSPACE = Path(r"I:\Linhhoasu\server\server")
SERVER_LOCAL = WORKSPACE / "_ai_workbench/temp/rename_hotfix/current_remote/src"
CLIENT_LOCAL = WORKSPACE / "_ai_workbench/temp/auto_delegate/current_remote_client"
CONTRACT_LOCAL = WORKSPACE / "_ai_workbench/tools/test_auto_delegate_contract.js"
CLIENT_CONTRACT_LOCAL = WORKSPACE / "_ai_workbench/tools/test_client_auto_delegate_bundle.js"
FILES = {
    f"{APP_ROOT}/src/services/EquipService.js": SERVER_LOCAL / "services/EquipService.js",
    f"{APP_ROOT}/src/handlers/item.js": SERVER_LOCAL / "handlers/item.js",
    f"{CLIENT_ROOT}/js/main.min_a6195824.js": CLIENT_LOCAL / "js/main.min_a6195824.js",
    f"{CLIENT_ROOT}/index.html": CLIENT_LOCAL / "index.html",
}


def sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


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
    for remote_path, local_path in FILES.items():
        if not local_path.is_file():
            raise FileNotFoundError(f"{remote_path}: {local_path}")
    if not CONTRACT_LOCAL.is_file() or not CLIENT_CONTRACT_LOCAL.is_file():
        raise FileNotFoundError("contract tools missing")

    password = getpass.getpass("VPS password (not logged): ")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup = f"/linhhoasu/_ai_workbench/backups/auto_delegate_pre_{stamp}"
    contract_remote = f"/linhhoasu/_ai_workbench/temp/test_auto_delegate_contract_{stamp}.js"
    client_contract_remote = f"/linhhoasu/_ai_workbench/temp/test_client_auto_delegate_bundle_{stamp}.js"
    staged = {}
    installed = False
    worker_present = False

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False, allow_agent=False, timeout=15)
    try:
        run(
            ssh,
            f"set -eu; mkdir -p {backup}/server/services {backup}/server/handlers {backup}/client/js; "
            f"cp -p {APP_ROOT}/src/services/EquipService.js {backup}/server/services/EquipService.js; "
            f"cp -p {APP_ROOT}/src/handlers/item.js {backup}/server/handlers/item.js; "
            f"cp -p {CLIENT_ROOT}/js/main.min_a6195824.js {backup}/client/js/main.min_a6195824.js; "
            f"cp -p {CLIENT_ROOT}/index.html {backup}/client/index.html",
        )
        worker_present = run(ssh, "pm2 describe lhs-real-bots >/dev/null 2>&1 && echo yes || echo no").strip() == "yes"

        sftp = ssh.open_sftp()
        try:
            for remote_path, local_path in FILES.items():
                base, ext = os.path.splitext(remote_path)
                stage_path = f"{base}.auto-delegate-{stamp}{ext}"
                sftp.put(str(local_path), stage_path)
                staged[remote_path] = stage_path
            sftp.put(str(CONTRACT_LOCAL), contract_remote)
            sftp.put(str(CLIENT_CONTRACT_LOCAL), client_contract_remote)
        finally:
            sftp.close()

        run(ssh, f"node --check {staged[f'{APP_ROOT}/src/services/EquipService.js']}")
        run(ssh, f"node --check {staged[f'{APP_ROOT}/src/handlers/item.js']}")
        run(ssh, f"node --check {staged[f'{CLIENT_ROOT}/js/main.min_a6195824.js']}")
        run(
            ssh,
            f"APP_ROOT={APP_ROOT} EQUIP_SERVICE_PATH={staged[f'{APP_ROOT}/src/services/EquipService.js']} "
            f"node {contract_remote}",
        )
        run(ssh, f"node {client_contract_remote} {staged[f'{CLIENT_ROOT}/js/main.min_a6195824.js']}")
        run(ssh, f"cd {APP_ROOT} && npm run test:core-contract", timeout=120)

        install_commands = []
        for remote_path, stage_path in staged.items():
            install_commands.append(f"mv {stage_path} {remote_path}")
            install_commands.append(f"chmod 644 {remote_path}")
        run(ssh, "set -eu; " + "; ".join(install_commands))
        installed = True

        if worker_present:
            run(ssh, "pm2 stop lhs-real-bots")
        run(ssh, "pm2 restart lhs-s1001 --update-env")
        print("GAME_READY=" + wait_ready(ssh))
        if worker_present:
            run(ssh, "pm2 restart lhs-real-bots --update-env")
        run(ssh, "pm2 save")

        served_index = run(ssh, "curl -sS http://127.0.0.1:81/index.html")
        if "20260831_auto_delegate1" not in served_index:
            raise RuntimeError("served index cache marker missing")
        served_main_hash = run(
            ssh,
            "curl -sS http://127.0.0.1:81/js/main.min_a6195824.js | sha256sum | cut -d' ' -f1",
        ).strip()
        expected_main_hash = sha256(CLIENT_LOCAL / "js/main.min_a6195824.js")
        if served_main_hash != expected_main_hash:
            raise RuntimeError(f"served main hash mismatch {served_main_hash} != {expected_main_hash}")

        print("BACKUP=" + backup)
        print("SERVED_MAIN_HASH=" + served_main_hash)
        print("CACHE_MARKER=20260831_auto_delegate1")
        print(run(ssh, "pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{for(const p of JSON.parse(s)){if([\"lhs-s1001\",\"lhs-real-bots\",\"lhs-dist\",\"lhs-admin\"].includes(p.name))console.log(p.name+\"=\"+p.pm2_env.status+\",pid=\"+p.pid+\",restarts=\"+p.pm2_env.restart_time)}})' ").strip())
        print("READY_HTTP=" + run(ssh, "curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/ready").strip())
        print("WS_9200=" + run(ssh, "ss -lnt | grep -q ':9200 ' && echo listening").strip())
    except Exception:
        if installed:
            try:
                run(
                    ssh,
                    f"cp -p {backup}/server/services/EquipService.js {APP_ROOT}/src/services/EquipService.js; "
                    f"cp -p {backup}/server/handlers/item.js {APP_ROOT}/src/handlers/item.js; "
                    f"cp -p {backup}/client/js/main.min_a6195824.js {CLIENT_ROOT}/js/main.min_a6195824.js; "
                    f"cp -p {backup}/client/index.html {CLIENT_ROOT}/index.html; "
                    "pm2 restart lhs-s1001 --update-env",
                )
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
        for stage_path in list(staged.values()) + [contract_remote, client_contract_remote]:
            try:
                run(ssh, f"rm -f -- {stage_path}")
            except Exception:
                pass
        ssh.close()


if __name__ == "__main__":
    main()
