import getpass
import hashlib
from datetime import datetime, timezone
from pathlib import Path

import paramiko


HOST = "103.116.105.154"
REMOTE_ROOT = "/linhhoasu/webgame/game"
LOCAL_ROOT = Path(r"I:\Linhhoasu\server\server\linhhoasu\webgame\game")
FILES = {
    f"{REMOTE_ROOT}/js/main.min_a6195824.js": LOCAL_ROOT / "js/main.min_a6195824.js",
    f"{REMOTE_ROOT}/index.html": LOCAL_ROOT / "index.html",
}


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def run(ssh, command, timeout=120, check=True):
    _stdin, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    output = stdout.read().decode("utf-8", "replace")
    error = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if check and code:
        raise RuntimeError(error[-4000:] or output[-4000:] or f"remote command failed: {code}")
    return output


def main():
    password = getpass.getpass("VPS password (not logged): ")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup = f"/linhhoasu/_ai_workbench/backups/auto_delegate_ui2_pre_{stamp}"
    staged = {}
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False, allow_agent=False, timeout=15)
    try:
        run(ssh, f"set -eu; mkdir -p {backup}/js; cp -p {REMOTE_ROOT}/js/main.min_a6195824.js {backup}/js/main.min_a6195824.js; cp -p {REMOTE_ROOT}/index.html {backup}/index.html")
        sftp = ssh.open_sftp()
        try:
            for remote_path, local_path in FILES.items():
                if not local_path.is_file():
                    raise FileNotFoundError(local_path)
                base, ext = remote_path.rsplit('.', 1)
                stage_path = f"{base}.deploy-{stamp}.{ext}"
                sftp.put(str(local_path), stage_path)
                staged[remote_path] = stage_path
        finally:
            sftp.close()
        run(ssh, f"node --check {staged[f'{REMOTE_ROOT}/js/main.min_a6195824.js']}")
        run(ssh, "set -eu; " + "; ".join(f"mv {stage} {remote}; chmod 644 {remote}" for remote, stage in staged.items()))
        run(ssh, "nginx -t && systemctl reload nginx", timeout=30)
        served_index = run(ssh, "curl -sS http://127.0.0.1:81/index.html")
        served_main_hash = run(ssh, "curl -sS http://127.0.0.1:81/js/main.min_a6195824.js | sha256sum | cut -d' ' -f1").strip()
        expected_hash = sha256(FILES[f"{REMOTE_ROOT}/js/main.min_a6195824.js"])
        if "20260831_auto_delegate_ui2" not in served_index:
            raise RuntimeError("served cache marker missing")
        if served_main_hash != expected_hash:
            raise RuntimeError(f"served main hash mismatch {served_main_hash} != {expected_hash}")
        print("BACKUP=" + backup)
        print("CACHE_MARKER=20260831_auto_delegate_ui2")
        print("SERVED_MAIN_HASH=" + served_main_hash)
        print("RELOAD_NGINX=PASS")
        print("READY_HTTP=" + run(ssh, "curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/ready").strip())
        print(run(ssh, "pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{for(const p of JSON.parse(s)){if([\"lhs-s1001\",\"lhs-real-bots\",\"lhs-dist\",\"lhs-admin\"].includes(p.name))console.log(p.name+\"=\"+p.pm2_env.status+\",pid=\"+p.pid+\",restarts=\"+p.pm2_env.restart_time)}})' ").strip())
    except Exception:
        try:
            run(ssh, f"cp -p {backup}/js/main.min_a6195824.js {REMOTE_ROOT}/js/main.min_a6195824.js; cp -p {backup}/index.html {REMOTE_ROOT}/index.html; nginx -t && systemctl reload nginx")
        except Exception as rollback_error:
            print(f"ROLLBACK_ERROR={rollback_error}")
        raise
    finally:
        for stage_path in staged.values():
            try:
                run(ssh, f"rm -f -- {stage_path}")
            except Exception:
                pass
        ssh.close()


if __name__ == "__main__":
    main()
