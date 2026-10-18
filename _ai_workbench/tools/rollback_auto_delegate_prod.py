import getpass
from datetime import datetime, timezone

import paramiko


HOST = "103.116.105.154"
SOURCE_BACKUP = "/linhhoasu/_ai_workbench/backups/auto_delegate_pre_20260830_164518"
APP_ROOT = "/linhhoasu/lhs/newServer"
CLIENT_ROOT = "/linhhoasu/webgame/game"


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
    password = getpass.getpass("VPS password (not logged): ")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    rollback_backup = f"/linhhoasu/_ai_workbench/backups/auto_delegate_rollback_current_{stamp}"
    files = {
        f"{APP_ROOT}/src/services/EquipService.js": f"{SOURCE_BACKUP}/server/services/EquipService.js",
        f"{APP_ROOT}/src/handlers/item.js": f"{SOURCE_BACKUP}/server/handlers/item.js",
        f"{CLIENT_ROOT}/js/main.min_a6195824.js": f"{SOURCE_BACKUP}/client/js/main.min_a6195824.js",
        f"{CLIENT_ROOT}/index.html": f"{SOURCE_BACKUP}/client/index.html",
    }
    worker_present = False
    installed = False
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False, allow_agent=False, timeout=15)
    try:
        run(ssh, f"set -eu; mkdir -p {rollback_backup}/server/services {rollback_backup}/server/handlers {rollback_backup}/client/js")
        run(ssh, f"cp -p {APP_ROOT}/src/services/EquipService.js {rollback_backup}/server/services/EquipService.js; cp -p {APP_ROOT}/src/handlers/item.js {rollback_backup}/server/handlers/item.js; cp -p {CLIENT_ROOT}/js/main.min_a6195824.js {rollback_backup}/client/js/main.min_a6195824.js; cp -p {CLIENT_ROOT}/index.html {rollback_backup}/client/index.html")
        for target, source in files.items():
            run(ssh, f"test -f {source}; test -f {target}")
        worker_present = run(ssh, "pm2 describe lhs-real-bots >/dev/null 2>&1 && echo yes || echo no").strip() == "yes"
        if worker_present:
            run(ssh, "pm2 stop lhs-real-bots")
        stage_commands = []
        for target, source in files.items():
            if target.endswith('.js'):
                stage = target[:-3] + f".rollback-{stamp}.js"
            elif target.endswith('.html'):
                stage = target[:-5] + f".rollback-{stamp}.html"
            else:
                stage = target + f".rollback-{stamp}"
            run(ssh, f"cp -p {source} {stage}; chmod 644 {stage}")
            stage_commands.append((target, stage))
        for target, stage in stage_commands:
            if target.endswith(".js"):
                run(ssh, f"node --check {stage}")
        run(ssh, "set -eu; " + "; ".join(f"mv {stage} {target}" for target, stage in stage_commands))
        installed = True
        run(ssh, "pm2 restart lhs-s1001 --update-env")
        print("GAME_READY=" + wait_ready(ssh))
        if worker_present:
            run(ssh, "pm2 restart lhs-real-bots --update-env")
        run(ssh, "pm2 save")
        served_index = run(ssh, "curl -sS http://127.0.0.1:81/index.html")
        served_main = run(ssh, "curl -sS http://127.0.0.1:81/js/main.min_a6195824.js")
        forbidden = ["autoDelegateEquip=function", "Tự mặc đồ mạnh, bán đồ yếu", "autoDelegate:!!"]
        hits = [marker for marker in forbidden if marker in served_main or marker in served_index]
        if hits:
            raise RuntimeError("rollback markers remain: " + ",".join(hits))
        print("AUTO_DELEGATE_MARKERS=0")
        print("CACHE_MARKER_RESTORED=" + ("yes" if "20260831_auto_delegate" not in served_index else "no"))
        print("ROLLBACK_BACKUP=" + rollback_backup)
        print("SOURCE_BACKUP=" + SOURCE_BACKUP)
        print(run(ssh, f"sha256sum {APP_ROOT}/src/services/EquipService.js {APP_ROOT}/src/handlers/item.js {CLIENT_ROOT}/js/main.min_a6195824.js {CLIENT_ROOT}/index.html").strip())
        print("READY_HTTP=" + run(ssh, "curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/ready").strip())
        print("WS_9200=" + run(ssh, "ss -lnt | grep -q ':9200 ' && echo listening").strip())
        print(run(ssh, "pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{for(const p of JSON.parse(s)){if([\"lhs-s1001\",\"lhs-real-bots\",\"lhs-dist\",\"lhs-admin\"].includes(p.name))console.log(p.name+\"=\"+p.pm2_env.status+\",pid=\"+p.pid+\",restarts=\"+p.pm2_env.restart_time)}})' ").strip())
    except Exception:
        if installed:
            try:
                run(ssh, f"cp -p {rollback_backup}/server/services/EquipService.js {APP_ROOT}/src/services/EquipService.js; cp -p {rollback_backup}/server/handlers/item.js {APP_ROOT}/src/handlers/item.js; cp -p {rollback_backup}/client/js/main.min_a6195824.js {CLIENT_ROOT}/js/main.min_a6195824.js; cp -p {rollback_backup}/client/index.html {CLIENT_ROOT}/index.html; pm2 restart lhs-s1001 --update-env")
                wait_ready(ssh)
            except Exception as rollback_error:
                print(f"RECOVERY_ERROR={rollback_error}")
        if worker_present:
            try:
                run(ssh, "pm2 restart lhs-real-bots --update-env; pm2 save")
            except Exception as worker_error:
                print(f"WORKER_RECOVERY_ERROR={worker_error}")
        raise
    finally:
        for _target, stage in locals().get("stage_commands", []):
            try:
                run(ssh, f"rm -f -- {stage}")
            except Exception:
                pass
        ssh.close()


if __name__ == "__main__":
    main()
