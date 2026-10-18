"""Read-only live/source comparison for Kim Tôn Hạ Tuế task UI fix."""
from __future__ import annotations

import hashlib
import json
import shlex
import sys
from pathlib import Path

import paramiko

TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))
from rollback_role_lian_manifest_20260930 import ssh_config  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
REMOTE = {
    "playerPayload": "/linhhoasu/lhs/newServer/src/handlers/playerPayload.js",
    "activity": "/linhhoasu/lhs/newServer/src/handlers/activity.js",
    "client": "/linhhoasu/webgame/game/js/main.min_drop200.js",
    "index": "/linhhoasu/webgame/game/index.html",
}
LOCAL = {
    "playerPayload": ROOT / "linhhoasu/lhs/newServer/src/handlers/playerPayload.js",
    "activity": ROOT / "linhhoasu/lhs/newServer/src/handlers/activity.js",
    "client": ROOT / "linhhoasu/webgame/game/js/main.min_drop200.js",
    "index": ROOT / "linhhoasu/webgame/game/index.html",
}


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> None:
    args, kwargs = ssh_config()
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(*args, **kwargs)

    def run_remote(command: str) -> str:
        _, stdout, stderr = ssh.exec_command(command, timeout=60)
        out = stdout.read().decode("utf-8", "replace")
        if stdout.channel.recv_exit_status() != 0:
            raise RuntimeError("REMOTE_READ_FAILED: " + stderr.read().decode("utf-8", "replace")[-1000:])
        return out
    try:
        out = {"readOnly": True, "remote": {}, "local": {}, "markers": {}, "pm2": None, "ready": {}}
        with ssh.open_sftp() as sftp:
            for key, path in REMOTE.items():
                with sftp.open(path, "rb") as handle:
                    data = handle.read()
                out["remote"][key] = {"path": path, "bytes": len(data), "sha256": sha(data)}
                text = data.decode("utf-8", errors="replace")
                out["markers"][key] = {
                    "activityTaskMaps": "activityTaskConfigMaps" in text,
                    "safeActivityTask": "getActivityTaskDataById(t.id,i.taskId)||{}" in text,
                    "unsafeActivityTask": "getActivityTaskDataById(t.id,i.taskId).status" in text,
                    "dailyTaskRebuild": "The current H5 reads all daily tasks" in text,
                    "activityTaskLoop": "activityTaskConfigMaps.forEach" in text,
                    "activityTaskRequiresCfgId": "if (taskId <= 0 || !cfg.id) return;" in text,
                    "activityTaskTypeMark": "ACTIVITY_TASK_MARK" in text,
                    "activeActivityIds": "activeActivityIds" in text,
                    "clientVersion": next((line.strip() for line in text.splitlines() if "main.min_drop200.js" in line), None),
                }
                if key == "playerPayload":
                    marker = "const activityTaskConfigMaps"
                    pos = text.find(marker)
                    out["markers"][key]["activityTaskSnippet"] = text[pos:pos + 1800] if pos >= 0 else ""
        for key, path in LOCAL.items():
            data = path.read_bytes()
            out["local"][key] = {"path": str(path), "bytes": len(data), "sha256": sha(data)}
        pm2 = run_remote("pm2 jlist | node -e " + shlex.quote(
            "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.stringify(JSON.parse(s).filter(p=>/^lhs-s\\d+/.test(p.name)).map(p=>({name:p.name,pid:p.pid,status:p.pm2_env.status,restarts:p.pm2_env.restart_time})))));"
        )).strip()
        out["pm2"] = json.loads(pm2)
        for port in (8080, 8083, 8084, 8085, 8086, 8087, 8088, 8089):
            out["ready"][str(port)] = run_remote(f"curl -sS -o /dev/null -w '%{{http_code}}' --max-time 3 http://127.0.0.1:{port}/ready").strip()
        print(json.dumps(out, ensure_ascii=False, indent=2))
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
