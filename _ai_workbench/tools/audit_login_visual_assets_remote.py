"""Read-only compare of login assets and client entry files against local copy."""
from __future__ import annotations

import getpass
import hashlib
import json
from pathlib import Path, PurePosixPath

import paramiko

HOST = "103.116.105.154"
REMOTE_GAME = "/linhhoasu/webgame/game"
LOCAL_GAME = Path(__file__).resolve().parents[2] / "linhhoasu" / "webgame" / "game"
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "temp" / "login_visual_asset_audit_20260902.json"
ENTRY_FILES = (
    "index.html",
    "js/start.min_52ac8d58.js",
    "js/main.min_a6195824.js",
    "js/egret.min_7d668222.js",
)


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
    stamp = "login_visual_asset_audit_20260902"
    local_stage = ROOT / "temp" / stamp
    local_stage.mkdir(parents=True, exist_ok=True)
    try:
        sftp = ssh.open_sftp()
        try:
            remote_login = f"{REMOTE_GAME}/update/resource/assets/atlas_ui/9_login"
            entries = []
            stack = [remote_login]
            while stack:
                current = stack.pop()
                for item in sftp.listdir_attr(current):
                    remote_path = f"{current}/{item.filename}"
                    mode = item.st_mode
                    if mode & 0o170000 == 0o040000:
                        stack.append(remote_path)
                    elif mode & 0o170000 == 0o100000:
                        rel = remote_path[len(remote_login) + 1:]
                        local_path = local_stage / "9_login" / Path(*PurePosixPath(rel).parts)
                        local_path.parent.mkdir(parents=True, exist_ok=True)
                        sftp.get(remote_path, str(local_path))
                        entries.append({
                            "relative": rel,
                            "remoteSize": int(item.st_size),
                            "remoteMtime": int(item.st_mtime),
                            "remoteHash": sha(local_path),
                            "localExists": (LOCAL_GAME / "update/resource/assets/atlas_ui/9_login" / Path(*PurePosixPath(rel).parts)).exists(),
                            "localHash": sha(LOCAL_GAME / "update/resource/assets/atlas_ui/9_login" / Path(*PurePosixPath(rel).parts)) if (LOCAL_GAME / "update/resource/assets/atlas_ui/9_login" / Path(*PurePosixPath(rel).parts)).exists() else "",
                        })
            for relative in ENTRY_FILES:
                remote_path = f"{REMOTE_GAME}/{relative}"
                local_path = local_stage / "entry" / Path(*PurePosixPath(relative).parts)
                local_path.parent.mkdir(parents=True, exist_ok=True)
                sftp.get(remote_path, str(local_path))
        finally:
            sftp.close()
    finally:
        ssh.close()

    for row in entries:
        row["match"] = row["localExists"] and row["remoteHash"] == row["localHash"]
    entry_rows = []
    for relative in ENTRY_FILES:
        remote_path = local_stage / "entry" / Path(*PurePosixPath(relative).parts)
        local_path = LOCAL_GAME / relative.replace("/", "\\")
        entry_rows.append({
            "relative": relative,
            "remoteHash": sha(remote_path),
            "localExists": local_path.exists(),
            "localHash": sha(local_path) if local_path.exists() else "",
            "match": local_path.exists() and sha(remote_path) == sha(local_path),
        })
    index_text = (local_stage / "entry" / "index.html").read_text(encoding="utf-8", errors="replace")
    cache_lines = [line.strip() for line in index_text.splitlines() if "cache" in line.lower() or "main.min" in line or "start.min" in line]
    data = {
        "host": HOST,
        "readOnly": True,
        "loginAssetCount": len(entries),
        "loginAssetsMatch": sum(1 for row in entries if row["match"]),
        "loginAssetsMismatch": [row for row in entries if not row["match"]],
        "entryFiles": entry_rows,
        "indexRelevantLines": cache_lines[:80],
        "remoteDownloadRoot": str(local_stage),
    }
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({k: v for k, v in data.items() if k != "indexRelevantLines"}, ensure_ascii=False, indent=2))
    print(f"OUT={OUT}")


if __name__ == "__main__":
    main()
