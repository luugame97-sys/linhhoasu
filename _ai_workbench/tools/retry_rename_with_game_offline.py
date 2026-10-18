import getpass
import json
from datetime import datetime, timezone

import paramiko

from deploy_unlock_rename_and_test_remote import (
    ACTION_SCRIPT,
    APP_ROOT,
    HOST,
    TARGET_NAME,
    TARGET_USER,
    WRAPPER_SCRIPT,
)


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
    backup = f"/linhhoasu/_ai_workbench/backups/rename_offline_retry_{stamp}"
    action_path = f"/linhhoasu/_ai_workbench/temp/rename_offline_action_{stamp}.js"
    wrapper_path = f"/linhhoasu/_ai_workbench/temp/rename_offline_wrapper_{stamp}.js"
    backup_doc = f"{backup}/target_before.json"
    worker_present = False
    game_stopped = False

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False, allow_agent=False, timeout=15)
    try:
        run(ssh, f"mkdir -p {backup}")
        worker_present = run(ssh, "pm2 describe lhs-real-bots >/dev/null 2>&1 && echo yes || echo no").strip() == "yes"
        sftp = ssh.open_sftp()
        try:
            with sftp.file(action_path, "w") as handle:
                handle.write(ACTION_SCRIPT)
            with sftp.file(wrapper_path, "w") as handle:
                handle.write(WRAPPER_SCRIPT)
        finally:
            sftp.close()
        run(ssh, f"node --check {action_path}; node --check {wrapper_path}")

        if worker_present:
            run(ssh, "pm2 stop lhs-real-bots")
        run(ssh, "pm2 stop lhs-s1001")
        game_stopped = True
        run(
            ssh,
            "for i in $(seq 1 20); do "
            "if ! ss -lnt | grep -Eq ':8080 |:9200 '; then echo STOPPED; exit 0; fi; "
            "sleep 1; done; exit 1",
            timeout=30,
        )

        action_output = run(
            ssh,
            f"node {wrapper_path} {action_path} {TARGET_USER} {TARGET_NAME} {backup_doc}",
            timeout=120,
        )
        result = None
        for line in action_output.splitlines():
            line = line.strip()
            if line.startswith("{") and line.endswith("}"):
                result = json.loads(line)
        if result is None or not result.get("ok"):
            raise RuntimeError("offline rename verification failed: " + action_output[-3000:])
        print(json.dumps(result, ensure_ascii=False))

        run(ssh, "pm2 restart lhs-s1001 --update-env")
        game_stopped = False
        print("GAME_READY=" + wait_ready(ssh))
        if worker_present:
            run(ssh, "pm2 restart lhs-real-bots --update-env")
        run(ssh, "pm2 save")

        # Allow reconnect/login writes, then verify the new state is stable.
        verification = run(
            ssh,
            f"sleep 5; node {wrapper_path} -e '"
            "const mongo=require(\"/linhhoasu/lhs/newServer/src/db/mongo\");"
            "const Player=require(\"/linhhoasu/lhs/newServer/src/db/models/Player\");"
            "const Account=require(\"/linhhoasu/lhs/newServer/src/db/models/Account\");"
            "(async()=>{await mongo.connect();"
            f"const u=\"{TARGET_USER}\",n=\"{TARGET_NAME}\";"
            "const p=await Player.findOne({userId:u},{userId:1,name:1,items:1,changeName:1,systemUnlockInfo:1,_id:0}).lean();"
            "const a=await Account.findOne({\"roles.userId\":u},{roles:1,_id:0}).lean();"
            "const r=a&&a.roles.find(x=>String(x.userId||\"\")===u);"
            "const x={ok:!!p&&p.name===n&&Number(p.items&&p.items[\"22\"]||0)===0&&Number(p.changeName||0)===1&&!!r&&r.name===n&&Array.isArray(p.systemUnlockInfo&&p.systemUnlockInfo.unlockedSystem)&&p.systemUnlockInfo.unlockedSystem.map(Number).includes(10010),name:p&&p.name,item22:p&&Number(p.items&&p.items[\"22\"]||0),changeName:p&&Number(p.changeName||0),accountRoleName:r&&r.name,has10010:!!p&&Array.isArray(p.systemUnlockInfo&&p.systemUnlockInfo.unlockedSystem)&&p.systemUnlockInfo.unlockedSystem.map(Number).includes(10010)};"
            "console.log(JSON.stringify(x));if(!x.ok)process.exitCode=2})().finally(()=>mongo.disconnect())'",
            timeout=30,
        ).strip()
        stable = None
        for line in verification.splitlines():
            line = line.strip()
            if line.startswith("{") and line.endswith("}"):
                stable = json.loads(line)
        if stable is None or not stable.get("ok"):
            raise RuntimeError("post-reconnect state is not stable: " + verification[-3000:])
        print("STABLE=" + json.dumps(stable, ensure_ascii=False))
        print("BACKUP=" + backup)
        print("TARGET_BACKUP=" + backup_doc)
        print(run(ssh, "pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{for(const p of JSON.parse(s)){if([\"lhs-s1001\",\"lhs-real-bots\",\"lhs-dist\",\"lhs-admin\"].includes(p.name))console.log(p.name+\"=\"+p.pm2_env.status+\",pid=\"+p.pid+\",restarts=\"+p.pm2_env.restart_time)}})' ").strip())
        print("READY_HTTP=" + run(ssh, "curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/ready").strip())
        print("WS_9200=" + run(ssh, "ss -lnt | grep -q ':9200 ' && echo listening").strip())
    except Exception:
        if game_stopped:
            try:
                run(ssh, "pm2 restart lhs-s1001 --update-env")
                wait_ready(ssh)
            except Exception as game_error:
                print(f"GAME_RECOVERY_ERROR={game_error}")
        if worker_present:
            try:
                run(ssh, "pm2 restart lhs-real-bots --update-env; pm2 save")
            except Exception as worker_error:
                print(f"WORKER_RECOVERY_ERROR={worker_error}")
        raise
    finally:
        for path in (action_path, wrapper_path):
            try:
                run(ssh, f"rm -f -- {path}")
            except Exception:
                pass
        ssh.close()


if __name__ == "__main__":
    main()
