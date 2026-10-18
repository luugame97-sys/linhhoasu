"""Read-only compare of client core artifacts that influence login rendering."""
from __future__ import annotations

import getpass
import hashlib
import json
from pathlib import Path

import paramiko

HOST = "103.116.105.154"
REMOTE_ROOT = "/linhhoasu/webgame/game"
LOCAL_ROOT = Path(__file__).resolve().parents[2] / "linhhoasu/webgame/game"
ROOT = Path(__file__).resolve().parents[1]
FILES = [
    "index.html",
    "js/start.min_52ac8d58.js",
    "js/main.min_a6195824.js",
    "js/egret.min_7d668222.js",
    "js/egret.web.min_587897e9.js",
    "js/egretex.min_37b3ee13.js",
    "js/thirds.min_b052d442.js",
    "update/resource/default.res_326514c1.bin",
    "update/resource/assets/excel/config_e5ac72c2.bin",
    "update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin",
    "update/resource/assets/code/code_bdbbacd8.bin",
    "update/resource/assets/cfg/gameEui_18e11b8e.bin",
    "update/resource/assets/game_start/login_bg_4f696aaa.jpg",
    "update/resource/assets/game_start/login_bg_tw_8d2e3139.jpg",
    "update/resource/assets/game_start/login_ld_bg_fa5c6746.jpg",
]


def sha(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> None:
    password = getpass.getpass("Production password (not logged): ")
    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False,
                allow_agent=False, timeout=20, banner_timeout=20, auth_timeout=20)
    try:
        sftp = ssh.open_sftp()
        rows = []
        stage = ROOT / "temp/client_core_audit_20260902"
        stage.mkdir(parents=True, exist_ok=True)
        try:
            for relative in FILES:
                remote = f"{REMOTE_ROOT}/{relative}"
                local = LOCAL_ROOT / Path(*relative.split("/"))
                downloaded = stage / Path(*relative.split("/"))
                try:
                    stat = sftp.stat(remote)
                    downloaded.parent.mkdir(parents=True, exist_ok=True)
                    sftp.get(remote, str(downloaded))
                    remote_hash = sha(downloaded)
                    remote_size = int(stat.st_size)
                    remote_mtime = int(stat.st_mtime)
                except Exception as exc:
                    rows.append({"relative": relative, "remoteExists": False, "error": str(exc)})
                    continue
                local_exists = local.exists()
                local_hash = sha(local) if local_exists else ""
                rows.append({"relative": relative, "remoteExists": True, "remoteSize": remote_size,
                             "remoteMtime": remote_mtime, "remoteHash": remote_hash,
                             "localExists": local_exists, "localSize": local.stat().st_size if local_exists else 0,
                             "localHash": local_hash, "match": local_exists and remote_hash == local_hash})
        finally:
            sftp.close()
    finally:
        ssh.close()

    remote_index = stage / "index.html"
    index_text = remote_index.read_text(encoding="utf-8", errors="replace") if remote_index.exists() else ""
    relevant = [line.strip() for line in index_text.splitlines() if any(k in line for k in (
        "translationVersion", "gothich.ttf", "utm.ttf", "LHS_MAIN_HIT_ROUTE", "main.min", "start.min", "backendHost"))]
    data = {
        "host": HOST,
        "readOnly": True,
        "files": rows,
        "mismatches": [row for row in rows if not row.get("match", False)],
        "indexRelevantLines": relevant[:120],
        "stage": str(stage),
    }
    out = ROOT / "temp/client_core_remote_audit_20260902.json"
    out.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(data, ensure_ascii=False, indent=2))
    print(f"OUT={out}")


if __name__ == "__main__":
    main()
