"""Rollback the 13/09 canonical power-display release to its verified baseline.

The rollback is deliberately allowlisted. It preserves the 07/09 relogin patch,
player data, and unrelated server/client changes. Remote files are checked with
an exact SHA-256 CAS before any write; the current remote state is copied to a
new recovery backup first.
"""
import hashlib
import json
import shlex
from datetime import datetime, timezone
from pathlib import Path

from snapshot_web_multiserver_20260906 import connect, run


ROOT = Path(__file__).resolve().parents[2]
BASELINE = ROOT / "_ai_workbench" / "temp" / "power_display_20260913" / "baseline"
G2G6_PRE = ROOT / "_ai_workbench" / "backups" / "power_fix_g2g6_20260913_pre" / "remote"
LOCAL_BACKUP = ROOT / "_ai_workbench" / "backups" / "power_rollback_20260913_pre"
OUT = ROOT / "_ai_workbench" / "temp" / "power_rollback_20260913"
REMOTE_ROOT = "/linhhoasu"
REMOTE_BACKUP = REMOTE_ROOT + "/_ai_workbench/backups/power_rollback_20260913_pre"

# These are the files captured by the 13/09 power-display release(s). The
# baseline snapshot contains the first group; the G2-G6 pre-deploy snapshot
# contains the handlers added after the baseline snapshot was taken.
BASELINE_FILES = [
    "lhs/newServer/src/handlers/arena.js",
    "lhs/newServer/src/handlers/basic.js",
    "lhs/newServer/src/handlers/chat.js",
    "lhs/newServer/src/handlers/guild.js",
    "lhs/newServer/src/handlers/playerPayload.js",
    "lhs/newServer/src/net/WSServer.js",
    "lhs/newServer/src/services/ArenaReadModelService.js",
    "lhs/newServer/src/services/BattleService.js",
    "lhs/newServer/src/services/BotPopulationService.js",
    "webgame/game/index.html",
]
G2G6_FILES = [
    "lhs/newServer/src/handlers/activity.js",
    "lhs/newServer/src/handlers/cross-rival.js",
    "lhs/newServer/src/handlers/dungeon.js",
    "lhs/newServer/src/handlers/farm.js",
    "lhs/newServer/src/handlers/island.js",
    "lhs/newServer/src/handlers/temple.js",
    "lhs/newServer/src/handlers/tower.js",
]
REMOVE_FILES = [
    "lhs/newServer/src/services/NativeBonusService.js",
    "lhs/newServer/src/services/PowerDisplayService.js",
    "webgame/game/js/lhs-power-display-v1.js",
]
FILES = BASELINE_FILES + G2G6_FILES + REMOVE_FILES

# Read-only inventory immediately before this rollback. Any drift aborts before
# the first remote mutation.
EXPECTED_REMOTE = {
    "lhs/newServer/src/handlers/arena.js": "2cdbfc3ca21d07c923f4f0134c95e056e22ea922b7472afdf675818d765a1220",
    "lhs/newServer/src/handlers/basic.js": "61e7bf087977389f798a6560a79a9cdbaee2ec479819121d5df6d17070b21ae9",
    "lhs/newServer/src/handlers/chat.js": "a2b0a1082ac362a6a22233447fa528d62d6e32f0b9f2aa0a4082f0b76164e51c",
    "lhs/newServer/src/handlers/guild.js": "608da6305f7f2da5459bf0a462f34e29545c971bb8208ccc7137608a44016d3e",
    "lhs/newServer/src/handlers/playerPayload.js": "53af30e7db26eafe15899c7007c7535947618278f35e37a94afa9d8e96c8dbb8",
    "lhs/newServer/src/net/WSServer.js": "284eb55d359d62bbf0e6816a7f1e7a2da36d32e01c8a5ad11f0f51bb6dd1467c",
    "lhs/newServer/src/services/ArenaReadModelService.js": "c8cfba49b3820da6cca3b3742b5172d0f2174c36fcb73518a52a63c31f38d290",
    "lhs/newServer/src/services/BattleService.js": "c9d5c04d4c8feb18b43d708162c33ae195ffbb7b92fae363e546072f9a7bb5dd",
    "lhs/newServer/src/services/BotPopulationService.js": "38f6f5078e10457fd4b3123aba634f1e7bf68dbabf03164e4f74096b710022ce",
    "lhs/newServer/src/handlers/activity.js": "584218628e991c3775bf5d31708e51a22cf92739e05d4d4896a60334faa2dda1",
    "lhs/newServer/src/handlers/cross-rival.js": "21d8981256ba60dc1df7a16de0e8a191a0ba738980208c4c43137748ee739633",
    "lhs/newServer/src/handlers/dungeon.js": "9e2e259f67157997e337a0aab2116a26c221491e5ae55133e9622310f4f3f11e",
    "lhs/newServer/src/handlers/farm.js": "ec4c8d345e809a8cdbe08db2d44351b084ad03355865ac12fb6f292a6357bd60",
    "lhs/newServer/src/handlers/island.js": "00bed19135778209c9307317e76c7d803c7171ac8bfc61d67ca86167312f580c",
    "lhs/newServer/src/handlers/temple.js": "c5c75d68b820c0a951006c2f18817b1f98e989f969e7cd4ca9a1aec497d15db7",
    "lhs/newServer/src/handlers/tower.js": "520dd081d2b17e5fa0784929facbe8fe2799c589a77cc539a6f37a331627f7b2",
    "webgame/game/index.html": "ba8ca6aa593a70f9929413468c58a6a4359132ce2493954a608af8bc5993009b",
    "lhs/newServer/src/services/NativeBonusService.js": "bcae52f54c3ab583c2c5dd0bfe14efddbdcb427c99ce9d68b2160951fef18f5c",
    "lhs/newServer/src/services/PowerDisplayService.js": "cf25a99d0d30bae840af4b847b1869df84cdd7a06e118a62331b28b00b4b4c06",
    "webgame/game/js/lhs-power-display-v1.js": "22d758b43c8c1c4b7ea40bc1ba6b68449344ab7cdb7b90d8b69ddcb4225472bd",
}
GAME_PROCESSES = ["lhs-s1001", "lhs-s1002", "lhs-s1003"]
READY_PORTS = {"1001": 8080, "1002": 8083, "1003": 8084}


def sha_bytes(data):
    return hashlib.sha256(data).hexdigest()


def remote_path(rel):
    return REMOTE_ROOT + "/" + rel


def local_source(rel):
    if rel in BASELINE_FILES:
        return BASELINE / rel
    return G2G6_PRE / rel


def local_backup_file(rel):
    return LOCAL_BACKUP / rel


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    if LOCAL_BACKUP.exists():
        # A previous run may have stopped at the remote CAS gate. Reuse that
        # complete, immutable local snapshot rather than overwriting it.
        for rel in FILES:
            if not local_backup_file(rel).exists():
                raise RuntimeError("LOCAL_ROLLBACK_BACKUP_INCOMPLETE:" + rel)
    else:
        LOCAL_BACKUP.mkdir(parents=True)
        for rel in FILES:
            src = ROOT / "linhhoasu" / rel
            if not src.exists():
                raise RuntimeError("LOCAL_FILE_MISSING:" + rel)
            dst = local_backup_file(rel)
            dst.parent.mkdir(parents=True, exist_ok=True)
            dst.write_bytes(src.read_bytes())

    local_candidates = {}
    for rel in BASELINE_FILES + G2G6_FILES:
        src = local_source(rel)
        if not src.exists():
            raise RuntimeError("BASELINE_FILE_MISSING:" + str(src))
        local_candidates[rel] = {"sha256": sha_bytes(src.read_bytes()), "bytes": src.stat().st_size}

    ssh = connect()
    evidence = {
        "startedAt": datetime.now(timezone.utc).isoformat(),
        "scope": "13/09 power-display release only",
        "readOnlyData": True,
        "files": [],
        "restarted": [],
    }
    try:
        existing_backup = run(ssh, "test -e " + shlex.quote(REMOTE_BACKUP) + " && echo yes || echo no").strip()
        if existing_backup != "no":
            raise RuntimeError("REMOTE_ROLLBACK_BACKUP_ALREADY_EXISTS")

        with ssh.open_sftp() as sftp:
            for rel in FILES:
                path = remote_path(rel)
                try:
                    data = sftp.open(path, "rb").read()
                except FileNotFoundError:
                    raise RuntimeError("REMOTE_FILE_MISSING:" + rel)
                actual = sha_bytes(data)
                expected = EXPECTED_REMOTE[rel]
                if actual != expected:
                    raise RuntimeError(f"CAS_MISMATCH:{rel}:{actual}:{expected}")
                evidence["files"].append({"file": rel, "remoteBefore": actual, "existsBefore": True})

        run(ssh, "mkdir -p " + shlex.quote(REMOTE_BACKUP))
        for rel in FILES:
            src = remote_path(rel)
            dst = REMOTE_BACKUP + "/" + rel
            run(ssh, "mkdir -p " + shlex.quote(dst.rsplit("/", 1)[0]) + " && cp -p " + shlex.quote(src) + " " + shlex.quote(dst))

        with ssh.open_sftp() as sftp:
            for rel in BASELINE_FILES + G2G6_FILES:
                src = local_source(rel)
                target = remote_path(rel)
                parent = str(Path(target).parent).replace("\\", "/")
                run(ssh, "mkdir -p " + shlex.quote(parent))
                temp = target + ".power_rollback_tmp_20260913"
                sftp.put(str(src), temp)
                if hasattr(sftp, "posix_rename"):
                    sftp.posix_rename(temp, target)
                else:
                    sftp.rename(temp, target)

        for rel in REMOVE_FILES:
            run(ssh, "rm -f " + shlex.quote(remote_path(rel)))

        check_files = [remote_path(rel) for rel in BASELINE_FILES + G2G6_FILES if rel.endswith(".js")]
        check_cmd = "for f in " + " ".join(shlex.quote(p) for p in check_files) + "; do node --check \"$f\" || exit 1; done"
        run(ssh, check_cmd)
        marker_check = run(
            ssh,
            "if grep -R -n -E 'PowerDisplayService|NativeBonusService|lhs-power-display|combat-power-refresh-v1|POWER_REFRESH_TAGS|combatPowerValue' "
            "/linhhoasu/lhs/newServer/src /linhhoasu/webgame/game/index.html 2>/dev/null; then exit 1; else echo clean; fi",
        ).strip()
        evidence["sourceMarkers"] = marker_check

        for name in GAME_PROCESSES:
            run(ssh, "pm2 restart " + shlex.quote(name) + " --update-env")
            evidence["restarted"].append(name)

        evidence["ready"] = {}
        for server_id, port in READY_PORTS.items():
            cmd = (
                f"for i in $(seq 1 12); do c=$(curl -sS --max-time 10 -o /dev/null -w '%{{http_code}}' "
                f"http://127.0.0.1:{port}/ready || true); [ \"$c\" = 200 ] && echo $c && break; sleep 2; done"
            )
            evidence["ready"][server_id] = int(run(ssh, cmd).strip())
        evidence["processesAfter"] = [
            {
                "name": p.get("name"),
                "pid": p.get("pid"),
                "status": (p.get("pm2_env") or {}).get("status"),
                "restarts": (p.get("pm2_env") or {}).get("restart_time"),
            }
            for p in json.loads(run(ssh, "pm2 jlist"))
            if p.get("name") in GAME_PROCESSES
        ]
        index_body = run(ssh, "curl -sS --max-time 20 http://127.0.0.1:81/index.html")
        evidence["served"] = {
            "oldPowerMarkerAbsent": "20260913_power_display_v2" not in index_body,
            "hudHttp": int(
                run(
                    ssh,
                    "curl -sS --max-time 20 -o /dev/null -w '%{http_code}' "
                    "http://127.0.0.1:81/js/lhs-power-display-v1.js",
                ).strip()
            ),
        }
        evidence["recentErrors"] = run(
            ssh,
            "for f in /root/.pm2/logs/lhs-s1001-error.log /root/.pm2/logs/lhs-s1002-error.log /root/.pm2/logs/lhs-s1003-error.log; do "
            "tail -120 \"$f\" 2>/dev/null | grep -Ei 'Cannot find module|SyntaxError|ReferenceError|uncaughtException|unhandledRejection' || true; done",
        )
        with ssh.open_sftp() as sftp:
            for row in evidence["files"]:
                rel = row["file"]
                if rel in REMOVE_FILES:
                    row["remoteAfter"] = None
                    continue
                data = sftp.open(remote_path(rel), "rb").read()
                row["remoteAfter"] = sha_bytes(data)
                row["localCandidate"] = local_candidates[rel]["sha256"]
    finally:
        ssh.close()

    evidence["finishedAt"] = datetime.now(timezone.utc).isoformat()
    evidence["result"] = (
        "PASS"
        if evidence.get("ready") == {"1001": 200, "1002": 200, "1003": 200}
        and all(p["status"] == "online" for p in evidence.get("processesAfter", []))
        and evidence.get("sourceMarkers") == "clean"
        and evidence.get("served", {}).get("oldPowerMarkerAbsent")
        and evidence.get("served", {}).get("hudHttp") == 404
        and all(
            row.get("remoteAfter") == row.get("localCandidate")
            for row in evidence.get("files", [])
            if row["file"] not in REMOVE_FILES
        )
        else "HOLD"
    )
    (OUT / "rollback.json").write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"result": evidence["result"], "evidence": str(OUT / "rollback.json"), "ready": evidence.get("ready"), "restarted": evidence.get("restarted")}, ensure_ascii=False))


if __name__ == "__main__":
    main()
