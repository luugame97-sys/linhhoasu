"""Deploy the scoped Formation fix with remote CAS, backup, and post-checks."""
import hashlib
import json
import shlex
from datetime import datetime, timezone
from pathlib import Path

from snapshot_web_multiserver_20260906 import connect, run

ROOT = Path(__file__).resolve().parents[2]
STAGE = ROOT / "_ai_workbench" / "temp" / "formation_fix_deploy_20260913"
OUT = ROOT / "_ai_workbench" / "temp" / "formation_fix_deploy_20260913"
REMOTE_ROOT = "/linhhoasu"
REMOTE_BACKUP = REMOTE_ROOT + "/_ai_workbench/backups/formation_fix_20260913_pre"
FILES = {
    "lhs/newServer/src/handlers/upgrade.js": STAGE / "upgrade.js",
    "webgame/game/index.html": STAGE / "index.html",
    "webgame/game/js/lhs-formation-fix-v1.js": STAGE / "lhs-formation-fix-v1.js",
}
EXPECTED_REMOTE = {
    "lhs/newServer/src/handlers/upgrade.js": "86870003215eb769a6942882c7e0f6e242832b80d0a4815eb987d4f93386bb6b",
    "webgame/game/index.html": "6920040a73976b75ddc3948e209110e497e40cbd1eb0de8a1b4d086d88c3890e",
    "webgame/game/js/lhs-formation-fix-v1.js": None,
}
PROCESSES = ["lhs-s1001", "lhs-s1002", "lhs-s1003"]
PORTS = {"1001": 8080, "1002": 8083, "1003": 8084}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def rpath(rel):
    return REMOTE_ROOT + "/" + rel


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    candidates = {}
    for rel, path in FILES.items():
        if not path.exists():
            raise RuntimeError("STAGE_MISSING:" + str(path))
        candidates[rel] = {"sha256": sha(path.read_bytes()), "bytes": path.stat().st_size}

    ssh = connect()
    evidence = {"startedAt": datetime.now(timezone.utc).isoformat(), "files": [], "restarted": [], "scope": "Formation fix only"}
    try:
        if run(ssh, "test -e " + shlex.quote(REMOTE_BACKUP) + " && echo yes || echo no").strip() != "no":
            raise RuntimeError("REMOTE_BACKUP_ALREADY_EXISTS")
        with ssh.open_sftp() as sftp:
            for rel in FILES:
                path = rpath(rel)
                try:
                    data = sftp.open(path, "rb").read()
                    actual = sha(data)
                    exists = True
                except FileNotFoundError:
                    data = b""
                    actual = None
                    exists = False
                expected = EXPECTED_REMOTE[rel]
                if expected is None and exists:
                    raise RuntimeError("REMOTE_EXPECTED_ABSENT_BUT_EXISTS:" + rel)
                if expected is not None and actual != expected:
                    raise RuntimeError(f"CAS_MISMATCH:{rel}:{actual}:{expected}")
                if exists:
                    before = OUT / "remote_before" / rel
                    before.parent.mkdir(parents=True, exist_ok=True)
                    before.write_bytes(data)
                evidence["files"].append({"file": rel, "remoteBefore": actual, "existsBefore": exists, "localCandidate": candidates[rel]["sha256"]})

        run(ssh, "mkdir -p " + shlex.quote(REMOTE_BACKUP))
        for rel in FILES:
            src = rpath(rel)
            dst = REMOTE_BACKUP + "/" + rel
            if EXPECTED_REMOTE[rel] is not None:
                run(ssh, "mkdir -p " + shlex.quote(dst.rsplit("/", 1)[0]) + " && cp -p " + shlex.quote(src) + " " + shlex.quote(dst))

        with ssh.open_sftp() as sftp:
            for rel, path in FILES.items():
                target = rpath(rel)
                run(ssh, "mkdir -p " + shlex.quote(str(Path(target).parent).replace("\\", "/")))
                temp = target + ".formation_fix_tmp_20260913"
                sftp.put(str(path), temp)
                if hasattr(sftp, "posix_rename"):
                    sftp.posix_rename(temp, target)
                else:
                    sftp.rename(temp, target)

        run(ssh, "node --check " + shlex.quote(rpath("lhs/newServer/src/handlers/upgrade.js")))
        marker = run(ssh, "grep -n 'formation_system_locked' " + shlex.quote(rpath("lhs/newServer/src/handlers/upgrade.js"))).strip()
        evidence["marker"] = bool(marker)
        for name in PROCESSES:
            run(ssh, "pm2 restart " + shlex.quote(name) + " --update-env")
            evidence["restarted"].append(name)

        evidence["ready"] = {}
        for server_id, port in PORTS.items():
            cmd = f"for i in $(seq 1 12); do c=$(curl -sS --max-time 10 -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{port}/ready || true); [ \"$c\" = 200 ] && echo $c && break; sleep 2; done"
            evidence["ready"][server_id] = int(run(ssh, cmd).strip())
        evidence["processesAfter"] = [
            {"name": p.get("name"), "pid": p.get("pid"), "status": (p.get("pm2_env") or {}).get("status"), "restarts": (p.get("pm2_env") or {}).get("restart_time")}
            for p in json.loads(run(ssh, "pm2 jlist")) if p.get("name") in PROCESSES
        ]
        index = run(ssh, "curl -sS --max-time 20 http://127.0.0.1:81/index.html")
        served_sha = run(ssh, "curl -sS --max-time 20 http://127.0.0.1:81/js/lhs-formation-fix-v1.js | sha256sum | awk '{print $1}'").strip()
        served_http = int(run(ssh, "curl -sS --max-time 20 -o /dev/null -w '%{http_code}' http://127.0.0.1:81/js/lhs-formation-fix-v1.js").strip())
        evidence["served"] = {"indexMarker": "lhs-formation-fix-v1.js?v=20260913_formation_fix_v1" in index, "servedSha256": served_sha, "servedHttp": served_http, "candidateSha256": candidates["webgame/game/js/lhs-formation-fix-v1.js"]["sha256"]}
        evidence["recentErrors"] = run(ssh, "for f in /root/.pm2/logs/lhs-s1001-error.log /root/.pm2/logs/lhs-s1002-error.log /root/.pm2/logs/lhs-s1003-error.log; do tail -120 \"$f\" 2>/dev/null | grep -Ei 'Cannot find module|SyntaxError|ReferenceError|uncaughtException|unhandledRejection' || true; done")
        with ssh.open_sftp() as sftp:
            for row in evidence["files"]:
                rel = row["file"]
                try:
                    row["remoteAfter"] = sha(sftp.open(rpath(rel), "rb").read())
                except FileNotFoundError:
                    row["remoteAfter"] = None
    finally:
        ssh.close()

    evidence["finishedAt"] = datetime.now(timezone.utc).isoformat()
    evidence["result"] = "PASS" if (
        evidence.get("marker")
        and evidence.get("ready") == {"1001": 200, "1002": 200, "1003": 200}
        and all(p["status"] == "online" for p in evidence.get("processesAfter", []))
        and evidence.get("served", {}).get("indexMarker")
        and evidence.get("served", {}).get("servedHttp") == 200
        and evidence.get("served", {}).get("servedSha256") == evidence.get("served", {}).get("candidateSha256")
        and not evidence.get("recentErrors")
        and all(row.get("remoteAfter") == row.get("localCandidate") for row in evidence.get("files", []))
    ) else "HOLD"
    (OUT / "deploy.json").write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"result": evidence["result"], "evidence": str(OUT / "deploy.json"), "ready": evidence.get("ready"), "restarted": evidence.get("restarted")}, ensure_ascii=False))


if __name__ == "__main__":
    main()
