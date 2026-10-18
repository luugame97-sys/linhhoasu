"""Deploy the bounded OldTrek mini-game timeout/error guard to shared static web assets."""
from __future__ import annotations

import hashlib
import json
import shlex
from datetime import datetime, timezone
from pathlib import Path

from skin_incident_remote import connect, run

ROOT = Path(__file__).resolve().parents[2]
CLIENT = "/linhhoasu/webgame/game"
INDEX = CLIENT + "/index.html"
ADDON = CLIENT + "/js/lhs-oldtrek-errors-v1.js"
EXPECTED_INDEX = "5e698e9520891716bf671554413e1388f1fa0841296054e145d56c6a529a2361"
EXPECTED_ADDON = "4f135c2b20c0ece5c2b9565ffe0936613f031b11a78d5c336bd6bf949e9f84ef"
LOCAL_ADDON = ROOT / "linhhoasu/webgame/game/js/lhs-oldtrek-errors-v1.js"
OUT = ROOT / "_ai_workbench/temp/oldtrek_minigame_guard_20261016/deployment.json"


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> None:
    addon = LOCAL_ADDON.read_bytes()
    if sha(addon) != "f6905cecd0aa9da4ce7fd33851de428496bd63721386ec77c1f869304a51ec25":
        raise RuntimeError("LOCAL_ADDON_HASH_UNEXPECTED")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup = f"/linhhoasu/_ai_workbench/backups/oldtrek_minigame_guard_{stamp}"
    report = {"at": datetime.now(timezone.utc).isoformat(), "directPlayerWrites": 0, "restarts": 0,
              "expectedBefore": {"index": EXPECTED_INDEX, "addon": EXPECTED_ADDON},
              "candidate": {"addon": sha(addon)}}
    with connect() as client:
        sftp = client.open_sftp()
        try:
            before_index = sftp.open(INDEX, "rb").read()
            before_addon = sftp.open(ADDON, "rb").read()
            if sha(before_index) != EXPECTED_INDEX or sha(before_addon) != EXPECTED_ADDON:
                raise RuntimeError("STATIC_CAS_DRIFT")
            text = before_index.decode("utf-8")
            old_marker = '"js/lhs-oldtrek-errors-v1.js?v=20261002_oldtrek_guard_v5",'
            new_marker = '"js/lhs-oldtrek-errors-v1.js?v=20261016_minigame_guard_v6",'
            if text.count(old_marker) != 1:
                raise RuntimeError("INDEX_OLD_MARKER_NOT_UNIQUE")
            candidate_index = text.replace(old_marker, new_marker).encode("utf-8")
            report["candidate"]["index"] = sha(candidate_index)
            run(client, "set -eu; mkdir -p " + shlex.quote(backup))
            for path, data, name in ((INDEX, before_index, "index.html"), (ADDON, before_addon, "lhs-oldtrek-errors-v1.js")):
                remote_backup = backup + "/" + name
                with sftp.open(remote_backup, "wb") as f:
                    f.write(data)
                run(client, "chmod 640 " + shlex.quote(remote_backup))
                if sha(sftp.open(remote_backup, "rb").read()) != sha(data):
                    raise RuntimeError("BACKUP_HASH_MISMATCH:" + name)
            for path, data, suffix in ((ADDON, addon, "addon"), (INDEX, candidate_index, "index")):
                current = sftp.open(path, "rb").read()
                expected = before_addon if path == ADDON else before_index
                if sha(current) != sha(expected):
                    raise RuntimeError("TARGET_CAS_DRIFT:" + suffix)
                tmp = path + ".codex-minigame-" + stamp + (".js" if suffix == "addon" else ".tmp")
                with sftp.open(tmp, "wb") as f:
                    f.write(data)
                run(client, "chown --reference=" + shlex.quote(path) + " " + shlex.quote(tmp) + "; chmod 644 " + shlex.quote(tmp))
                if suffix == "addon":
                    run(client, "node --check " + shlex.quote(tmp))
                sftp.posix_rename(tmp, path)
                if sha(sftp.open(path, "rb").read()) != sha(data):
                    raise RuntimeError("LIVE_HASH_MISMATCH:" + suffix)
            served_addon = run(client, "curl -fsS --max-time 10 http://127.0.0.1:81/js/lhs-oldtrek-errors-v1.js").encode()
            served_index = run(client, "curl -fsS --max-time 10 http://127.0.0.1:81/").encode()
            if sha(served_addon) != sha(addon) or sha(served_index) != sha(candidate_index):
                raise RuntimeError("HTTP_HASH_MISMATCH")
            report.update(status="DEPLOYED", backup=backup, live={"index": sha(candidate_index), "addon": sha(addon)},
                          http={"index": sha(served_index), "addon": sha(served_addon)})
        finally:
            sftp.close()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
