"""Read-only snapshot of core client/server artifacts from the test VPS."""
from __future__ import annotations

import getpass
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import paramiko


HOST = "192.168.200.151"
WORKSPACE = Path(__file__).resolve().parents[2]
REMOTE_FILES = [
    "/linhhoasu/webgame/game/index.html",
    "/linhhoasu/webgame/game/js/egret.min_7d668222.js",
    "/linhhoasu/webgame/game/js/egret.web.min_587897e9.js",
    "/linhhoasu/webgame/game/js/egretex.min_37b3ee13.js",
    "/linhhoasu/webgame/game/js/thirds.min_b052d442.js",
    "/linhhoasu/webgame/game/js/start.min_52ac8d58.js",
    "/linhhoasu/webgame/game/js/main.min_a6195824.js",
    "/linhhoasu/webgame/game/update/resource/default.res_326514c1.bin",
    "/linhhoasu/webgame/game/update/resource/default.res_main_c669f2c0.bin",
    "/linhhoasu/webgame/game/update/resource/default.res_cn_main_f70d4753.bin",
    "/linhhoasu/webgame/game/update/resource/assets/cfg/gameEui_18e11b8e.bin",
    "/linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin",
    "/linhhoasu/lhs/newServer/src/app.js",
    "/linhhoasu/lhs/newServer/src/net/WSServer.js",
    "/linhhoasu/lhs/newServer/src/handlers/activity.js",
    "/linhhoasu/lhs/newServer/ecosystem.config.js",
]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    output = WORKSPACE / "_ai_workbench/temp" / f"lhs_test_vps_192168200151_{stamp}"
    output.mkdir(parents=True, exist_ok=False)
    password = getpass.getpass("Test VPS password (not logged): ")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(
        HOST,
        username="root",
        password=password,
        look_for_keys=False,
        allow_agent=False,
        timeout=20,
        banner_timeout=20,
        auth_timeout=20,
    )
    rows = []
    try:
        sftp = ssh.open_sftp()
        try:
            for remote in REMOTE_FILES:
                local = output / "raw" / remote.lstrip("/")
                local.parent.mkdir(parents=True, exist_ok=True)
                try:
                    sftp.get(remote, str(local))
                    stat = sftp.stat(remote)
                    rows.append({
                        "remote": remote,
                        "path": str(local.relative_to(output)).replace("\\", "/"),
                        "bytes": stat.st_size,
                        "mtime": stat.st_mtime,
                        "sha256": sha256(local),
                    })
                except (IOError, OSError) as exc:
                    rows.append({"remote": remote, "missing": True, "error": f"{type(exc).__name__}: {exc}"})
        finally:
            sftp.close()

        command = r'''set +e
printf '%s\n' '===PM2==='; pm2 list 2>&1 | sed -n '1,80p'
printf '%s\n' '===LISTENERS==='; ss -lntp 2>/dev/null | grep -E ':(81|8080|9200|3001|9097|27017|6379)\\b' || true
printf '%s\n' '===HTTP==='; for u in http://127.0.0.1:81/ http://127.0.0.1:80/; do printf '%s|' "$u"; curl -sS -o /dev/null -w '%{http_code}|%{content_type}|%{size_download}\n' --max-time 10 "$u" 2>/dev/null || true; done
printf '%s\n' '===DIRS==='; for p in /linhhoasu/lhs/newServer /linhhoasu/webgame/game; do stat -c '%n|%F|%s|%a|%u:%g' "$p" 2>/dev/null || true; done
'''
        _stdin, stdout, stderr = ssh.exec_command(command, timeout=90)
        diagnostics = {
            "stdout": stdout.read().decode("utf-8", "replace"),
            "stderr": stderr.read().decode("utf-8", "replace"),
            "exit": stdout.channel.recv_exit_status(),
        }
    finally:
        ssh.close()

    payload = {
        "host": HOST,
        "capturedAt": datetime.now(timezone.utc).isoformat(),
        "files": rows,
        "diagnostics": diagnostics,
        "summary": {
            "requested": len(REMOTE_FILES),
            "downloaded": sum(1 for row in rows if row.get("sha256")),
            "missing": sum(1 for row in rows if row.get("missing")),
            "bytes": sum(int(row.get("bytes") or 0) for row in rows),
        },
    }
    (output / "manifest.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(output), **payload["summary"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
