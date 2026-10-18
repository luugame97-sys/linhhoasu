"""Scoped type49 module0 rollout: accumulate item212 chances only."""
import base64
import hashlib
import json
import shlex
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from release_petsoul_day1_20261007 import connect, run

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "_ai_workbench" / "temp" / "type49_module0_20261012"
MANIFEST = OUT / "release.json"
CANDIDATE = OUT / "Activity49Service.js"
REMOTE_ROOT = "/linhhoasu"
TARGET = REMOTE_ROOT + "/lhs/newServer/src/services/Activity49Service.js"
STAGE = REMOTE_ROOT + "/_ai_workbench/temp/type49_module0_20261012/candidate/Activity49Service.js"
EXPECTED = "ca9863c200cd3f98795b7cf0fb64a427aba18730905c4422a0221366018a9d94"
NODES = {f"lhs-s100{i}": 8080 if i == 1 else 8081 + i for i in range(1, 9)}
STAMP = "type49_module0_20261012"


def sha(data):
    return hashlib.sha256(data).hexdigest()


def now():
    return datetime.now(timezone.utc).isoformat()


def remote_hash(session, path):
    return run(session, "sha256sum " + shlex.quote(path)).split()[0]


def remote_exists(session, path):
    return run(session, "test -e " + shlex.quote(path) + " && echo yes || echo no").strip() == "yes"


def upload(session, path, data):
    run(session, "mkdir -p " + shlex.quote(path.rsplit("/", 1)[0]))
    stdin, stdout, stderr = session.exec_command("base64 -d > " + shlex.quote(path), timeout=120)
    stdin.write(base64.b64encode(data))
    stdin.channel.shutdown_write()
    error = stderr.read().decode("utf-8", errors="replace")
    if stdout.channel.recv_exit_status():
        raise RuntimeError("UPLOAD_FAILED:" + error[-500:])
    if remote_hash(session, path) != sha(data):
        raise RuntimeError("UPLOAD_HASH_MISMATCH:" + path)


def processes(session):
    js = (
        "const a=JSON.parse(require('fs').readFileSync(0,'utf8'));"
        "console.log(JSON.stringify(a.filter(p=>/^lhs-s100[1-8]$/.test(p.name))"
        ".map(p=>({name:p.name,pid:p.pid,status:p.pm2_env.status,restarts:p.pm2_env.restart_time}))));"
    )
    return json.loads(run(session, "pm2 jlist | node -e " + shlex.quote(js)))


def ready(session, name, attempts=1):
    for attempt in range(attempts):
        try:
            body = json.loads(run(session, f"curl -fsS --max-time 5 http://127.0.0.1:{NODES[name]}/ready", 10))
            if body.get("status") == "ok" and body.get("checks", {}).get("mongo") is True and body.get("checks", {}).get("redis") is True:
                return body
        except Exception:
            if attempt == attempts - 1:
                raise
        if attempt < attempts - 1:
            time.sleep(2)
    raise RuntimeError("NOT_READY:" + name)


def save(manifest):
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def load():
    return json.loads(MANIFEST.read_text(encoding="utf-8-sig"))


def prepare(session, manifest):
    for name in ["test-result.json", "integration-result.json", "client-test-result.json"]:
        result = json.loads((ROOT / "_ai_workbench" / "temp" / "event_goal_20261007" / "draws" / name).read_text(encoding="utf-8-sig"))
        if not result.get("pass") or result.get("productionWrites", 0) or result.get("networkCalls", result.get("networkAttempts", 0)):
            raise RuntimeError("TEST_GATE:" + name)
    actual = remote_hash(session, TARGET)
    if actual != EXPECTED:
        raise RuntimeError(f"CAS_BASELINE:{actual}")
    manifest["preProcesses"] = processes(session)
    manifest["preReady"] = {name: ready(session, name, 3) for name in NODES}
    data = CANDIDATE.read_bytes()
    upload(session, STAGE, data)
    run(session, "node --check " + shlex.quote(STAGE), 30)
    manifest["candidateHash"] = sha(data)
    manifest["remoteStageHash"] = remote_hash(session, STAGE)
    manifest["phase"] = "prepared"
    manifest["preparedAt"] = now()
    save(manifest)


def publish(session, manifest):
    if manifest.get("phase") != "prepared":
        raise RuntimeError("PREPARE_REQUIRED")
    if remote_hash(session, TARGET) != EXPECTED:
        raise RuntimeError("CAS_BEFORE_PUBLISH")
    backup = REMOTE_ROOT + "/_ai_workbench/backups/" + STAMP + "_" + datetime.now(timezone.utc).strftime("%H%M%S")
    if remote_exists(session, backup):
        raise RuntimeError("BACKUP_EXISTS")
    manifest["backup"] = backup
    backup_file = backup + "/Activity49Service.js"
    run(session, "mkdir -p " + shlex.quote(backup_file.rsplit("/", 1)[0]) + " && cp -p " + shlex.quote(TARGET) + " " + shlex.quote(backup_file))
    if remote_hash(session, backup_file) != EXPECTED:
        raise RuntimeError("BACKUP_HASH_MISMATCH")
    temp = TARGET + "." + STAMP + ".tmp"
    run(session, "cp " + shlex.quote(STAGE) + " " + shlex.quote(temp) + " && chmod --reference=" + shlex.quote(TARGET) + " " + shlex.quote(temp) + " && chown --reference=" + shlex.quote(TARGET) + " " + shlex.quote(temp))
    if remote_hash(session, temp) != manifest["candidateHash"] or remote_hash(session, TARGET) != EXPECTED:
        raise RuntimeError("PUBLISH_CAS")
    run(session, "mv -f " + shlex.quote(temp) + " " + shlex.quote(TARGET))
    if remote_hash(session, TARGET) != manifest["candidateHash"]:
        raise RuntimeError("PUBLISH_HASH_MISMATCH")
    manifest["published"] = True
    manifest["restarted"] = []
    save(manifest)
    for name in NODES:
        run(session, "pm2 restart " + shlex.quote(name), 60)
        ready(session, name, 30)
        manifest["restarted"].append(name)
        save(manifest)
    manifest["phase"] = "published"
    manifest["publishedAt"] = now()
    save(manifest)


def verify(session, manifest):
    if remote_hash(session, TARGET) != manifest["candidateHash"]:
        raise RuntimeError("VERIFY_HASH")
    manifest["finalReady"] = {name: ready(session, name, 3) for name in NODES}
    manifest["finalProcesses"] = processes(session)
    manifest["result"] = "PASS"
    manifest["phase"] = "verified"
    manifest["verifiedAt"] = now()
    manifest.pop("lastError", None)
    save(manifest)


def rollback(session, manifest):
    if not manifest.get("backup") or not manifest.get("published"):
        raise RuntimeError("ROLLBACK_NOT_AVAILABLE")
    actual = remote_hash(session, TARGET)
    if actual != manifest["candidateHash"]:
        raise RuntimeError("ROLLBACK_CAS:" + actual)
    source = manifest["backup"] + "/Activity49Service.js"
    if remote_hash(session, source) != EXPECTED:
        raise RuntimeError("ROLLBACK_BACKUP_HASH")
    temp = TARGET + "." + STAMP + ".restore"
    run(session, "cp -p " + shlex.quote(source) + " " + shlex.quote(temp) + " && mv -f " + shlex.quote(temp) + " " + shlex.quote(TARGET))
    if remote_hash(session, TARGET) != EXPECTED:
        raise RuntimeError("ROLLBACK_VERIFY")
    for name in manifest.get("restarted", []):
        run(session, "pm2 restart " + shlex.quote(name), 60)
        ready(session, name, 30)
    manifest["phase"] = "rolled_back"
    manifest["rolledBackAt"] = now()
    save(manifest)


def main():
    action = sys.argv[1] if len(sys.argv) > 1 else "prepare"
    if action == "init":
        data = CANDIDATE.read_bytes()
        save({"version": "type49_module0_accumulate_v1", "scope": "type49 module0 only; module1 remains fail-closed; module2 unchanged", "target": TARGET, "expectedHash": EXPECTED, "candidateHash": sha(data), "phase": "candidate", "productionWrites": 0})
        return
    manifest = load()
    session = connect()
    try:
        {"prepare": prepare, "publish": publish, "verify": verify, "rollback": rollback}[action](session, manifest)
    except Exception as error:
        manifest["lastError"] = str(error)
        manifest["errorAt"] = now()
        save(manifest)
        raise
    finally:
        session.close()


if __name__ == "__main__":
    main()
