import getpass
from datetime import datetime, timezone
from pathlib import Path

import paramiko


HOST = "103.116.105.154"
APP_ROOT = "/linhhoasu/lhs/newServer"
LOCAL_ROOT = Path(r"I:\Linhhoasu\server\server\_ai_workbench\temp\rename_hotfix\current_remote")
TARGETS = {
    "src/handlers/serverList.js": LOCAL_ROOT / "src/handlers/serverList.js",
    "src/handlers/task.js": LOCAL_ROOT / "src/handlers/task.js",
}


def run(ssh, command, timeout=120):
    _stdin, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    output = stdout.read().decode("utf-8", "replace")
    error = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError(error[-3000:] or output[-3000:] or f"remote command failed: {code}")
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
    backup = f"/linhhoasu/_ai_workbench/backups/rename_2837_pre_{stamp}"
    staged = {}

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(
        HOST,
        username="root",
        password=password,
        look_for_keys=False,
        allow_agent=False,
        timeout=15,
    )
    worker_was_present = False
    installed = False
    try:
        run(ssh, f"set -eu; mkdir -p {backup}; cp -p {APP_ROOT}/src/handlers/serverList.js {backup}/serverList.js; cp -p {APP_ROOT}/src/handlers/task.js {backup}/task.js")
        worker_was_present = run(ssh, "pm2 describe lhs-real-bots >/dev/null 2>&1 && echo yes || echo no").strip() == "yes"

        sftp = ssh.open_sftp()
        try:
            for relative, local_path in TARGETS.items():
                if not local_path.is_file():
                    raise FileNotFoundError(local_path)
                remote_dir, filename = relative.rsplit("/", 1)
                stage_name = filename[:-3] + f".rename-hotfix-{stamp}.js"
                remote_stage = f"{APP_ROOT}/{remote_dir}/{stage_name}"
                sftp.put(str(local_path), remote_stage)
                staged[relative] = remote_stage
        finally:
            sftp.close()

        for remote_stage in staged.values():
            run(ssh, f"node --check {remote_stage}")

        server_stage = staged["src/handlers/serverList.js"]
        task_stage = staged["src/handlers/task.js"]
        run(
            ssh,
            "cd /linhhoasu/lhs/newServer && node -e '"
            f"const s=require(\"{server_stage}\");let map={{}};"
            "s.register({registerHttpHandlers(v){map=v}});"
            "const r=map[2837]({word:\"duytuan12\"});"
            "if(!r||r.ret!==0||r.result!==0)throw new Error(\"2837 contract\");"
            "console.log(\"CMD_2837_MODULE=PASS\")'",
        )
        run(
            ssh,
            "cd /linhhoasu/lhs/newServer && node -e '"
            f"const t=require(\"{task_stage}\");"
            "Promise.resolve(t.handleRename({name:\"\"},{userId:\"rename-contract\",player:{name:\"old\",items:{22:1}}},7))"
            ".then(r=>{if(!r||r.tag!==21||r.data.result!==1||r.data.reason!==\"NAME_EMPTY\")throw new Error(\"rename failure contract\");console.log(\"RENAME_FAILURE_CONTRACT=PASS\")})'",
        )
        run(ssh, "cd /linhhoasu/lhs/newServer && npm run test:core-contract", timeout=120)

        run(
            ssh,
            f"set -eu; mv {server_stage} {APP_ROOT}/src/handlers/serverList.js; "
            f"mv {task_stage} {APP_ROOT}/src/handlers/task.js; "
            f"chmod 644 {APP_ROOT}/src/handlers/serverList.js {APP_ROOT}/src/handlers/task.js",
        )
        installed = True

        if worker_was_present:
            run(ssh, "pm2 stop lhs-real-bots")
        run(ssh, "pm2 restart lhs-s1001 --update-env")
        print("GAME_READY=" + wait_ready(ssh))
        if worker_was_present:
            run(ssh, "pm2 restart lhs-real-bots --update-env")
        run(ssh, "pm2 save")

        http_contract = run(
            ssh,
            "cd /linhhoasu/lhs/newServer && node -e '"
            "const http=require(\"http\");const {packRequest,unpackResponse}=require(\"./src/protocol/ReqCodec\");"
            "const body=packRequest(2837,{word:\"duytuan12\"});"
            "const q=http.request({host:\"127.0.0.1\",port:8080,path:\"/gameMsg.do\",method:\"POST\",headers:{\"Content-Type\":\"application/octet-stream\",\"Content-Length\":body.length}},r=>{let a=[];r.on(\"data\",d=>a.push(d));r.on(\"end\",()=>{const x=unpackResponse(Buffer.concat(a));if(r.statusCode!==200||!x||x.ret!==0)throw new Error(JSON.stringify({status:r.statusCode,response:x}));console.log(\"CMD_2837_HTTP=PASS\")})});q.on(\"error\",e=>{throw e});q.end(body)'",
        ).strip()
        print(http_contract)
        print("BACKUP=" + backup)
        print(run(ssh, f"sha256sum {APP_ROOT}/src/handlers/serverList.js {APP_ROOT}/src/handlers/task.js").strip())
        print(run(ssh, "pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{for(const p of JSON.parse(s)){if([\"lhs-s1001\",\"lhs-real-bots\",\"lhs-dist\",\"lhs-admin\"].includes(p.name))console.log(p.name+\"=\"+p.pm2_env.status+\",pid=\"+p.pid+\",restarts=\"+p.pm2_env.restart_time)}})' ").strip())
        print("READY_HTTP=" + run(ssh, "curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/ready").strip())
        print("WS_9200=" + run(ssh, "ss -lnt | grep -q ':9200 ' && echo listening").strip())
        print(run(ssh, "tail -n 120 /root/.pm2/logs/lhs-s1001-out.log | grep -E 'HTTP handlers registered|POST gameMsg.do cmd=2837|cmdId=2837' | tail -n 12 || true").strip())
    except Exception:
        if installed:
            try:
                run(ssh, f"cp -p {backup}/serverList.js {APP_ROOT}/src/handlers/serverList.js; cp -p {backup}/task.js {APP_ROOT}/src/handlers/task.js; pm2 restart lhs-s1001 --update-env")
                wait_ready(ssh)
            except Exception as rollback_error:
                print(f"ROLLBACK_ERROR={rollback_error}")
        if worker_was_present:
            try:
                run(ssh, "pm2 restart lhs-real-bots --update-env; pm2 save")
            except Exception as worker_error:
                print(f"WORKER_RECOVERY_ERROR={worker_error}")
        raise
    finally:
        for remote_stage in staged.values():
            try:
                run(ssh, f"rm -f -- {remote_stage}")
            except Exception:
                pass
        ssh.close()


if __name__ == "__main__":
    main()
