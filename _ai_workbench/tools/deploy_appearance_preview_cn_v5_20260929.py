"""Deploy the CN-semantics appearance preview addon (static, CAS protected)."""
from __future__ import annotations
import hashlib, json, shlex, sys
from datetime import datetime, timezone
from pathlib import Path
sys.dont_write_bytecode = True
WB = Path(__file__).resolve().parents[1]
ROOT = WB.parent
sys.path.insert(0, str(WB / "tools"))
from snapshot_web_multiserver_20260906 import connect, run  # noqa: E402

ADDON = "/linhhoasu/webgame/game/js/lhs-appearance-preview-v1.js"
INDEX = "/linhhoasu/webgame/game/index.html"
LOCAL = ROOT / "linhhoasu" / "webgame" / "game" / "js" / "lhs-appearance-preview-v1.js"
CURRENT_ADDON = "982bf258e833f274b15ddcbf9821871eca744ac74b5e34a251c15feb21a94b4e"
OLD = b"js/lhs-appearance-preview-v1.js?v=20260927_appearance_preview_v4"
NEW = b"js/lhs-appearance-preview-v1.js?v=20260929_appearance_preview_cn_v5"
NODES = [("lhs-s1001", 8080), ("lhs-s1002", 8083), ("lhs-s1003", 8084), ("lhs-s1004", 8085), ("lhs-s1005", 8086), ("lhs-s1006", 8087)]

def sha(data: bytes) -> str: return hashlib.sha256(data).hexdigest()
def rb(sftp, path: str):
    try:
        with sftp.open(path, "rb") as h: return h.read()
    except FileNotFoundError: return None
def rsha(sftp, path: str):
    data = rb(sftp, path); return sha(data) if data is not None else None
def wr(sftp, path: str, data: bytes):
    with sftp.open(path, "wb") as h: h.write(data)
    sftp.chmod(path, 0o644)
def ready(ssh, port: int) -> str:
    return run(ssh, "curl -sS --connect-timeout 3 --max-time 10 -o /dev/null -w '%{http_code}' " + shlex.quote(f"http://127.0.0.1:{port}/ready") + " || true").strip()

def main():
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup = f"/linhhoasu/_ai_workbench/backups/appearance_preview_cn_v5_20260929_{stamp}"
    stage = f"/linhhoasu/_ai_workbench/temp/appearance_preview_cn_v5_20260929_{stamp}"
    evidence_path = WB / "temp" / "appearance_preview_cn_v5_20260929" / f"deploy_{stamp}.json"
    evidence_path.parent.mkdir(parents=True, exist_ok=True)
    addon = LOCAL.read_bytes()
    if b"20260929_appearance_preview_cn_v5" not in addon: raise RuntimeError("LOCAL_V5_MARKER_MISSING")
    ssh = connect(); evidence = {"generatedAt": datetime.now(timezone.utc).isoformat(), "status": "PREPARING", "scope": [ADDON, INDEX], "productionWrites": 0, "playerWrites": 0, "dbWrites": 0, "processRestarts": 0, "backup": backup, "stage": stage}
    stages = []
    try:
        before_ready = {str(p): ready(ssh, p) for _n, p in NODES}
        if any(v != "200" for v in before_ready.values()): raise RuntimeError("READY_NOT_200_BEFORE_DEPLOY")
        evidence["beforeReady"] = before_ready
        with ssh.open_sftp() as sftp:
            a0, i0 = rb(sftp, ADDON), rb(sftp, INDEX)
            if a0 is None or i0 is None: raise RuntimeError("REMOTE_REQUIRED_FILE_MISSING")
            before = {ADDON: sha(a0), INDEX: sha(i0)}
            if before[ADDON] != CURRENT_ADDON: raise RuntimeError("LIVE_ADDON_BASELINE_DRIFT:" + json.dumps(before, sort_keys=True))
            if i0.count(OLD) != 1 or i0.count(NEW) != 0: raise RuntimeError("INDEX_V4_MARKER_ANCHOR_MISMATCH")
            candidate = {ADDON: addon, INDEX: i0.replace(OLD, NEW, 1)}
            ch = {p: sha(d) for p, d in candidate.items()}
            evidence["files"] = {p: {"before": before[p], "candidate": ch[p], "bytes": len(candidate[p])} for p in candidate}
            run(ssh, "install -d -m 700 " + shlex.quote(backup) + " " + shlex.quote(stage))
            backups = {}
            for n, path in enumerate((ADDON, INDEX), 1):
                safe = f"{n:02d}_{path.strip('/').replace('/', '__')}"; bp = backup + "/" + safe + ".before"; sp = stage + "/" + safe + ".candidate"
                run(ssh, "cp -p -- " + shlex.quote(path) + " " + shlex.quote(bp));
                if rsha(sftp, bp) != before[path]: raise RuntimeError("BACKUP_HASH_MISMATCH:" + path)
                wr(sftp, sp, candidate[path]);
                if rsha(sftp, sp) != ch[path]: raise RuntimeError("STAGE_HASH_MISMATCH:" + path)
                backups[path] = bp; stages.append(sp)
            run(ssh, "node --check < " + shlex.quote(stages[0]))
            for path in (ADDON, INDEX):
                if rsha(sftp, path) != before[path]: raise RuntimeError("LIVE_CAS_DRIFT:" + path)
            for path, sp in zip((ADDON, INDEX), stages):
                tmp = path + ".appearance-preview-cn-v5-" + stamp + ".next"; run(ssh, "cp -p -- " + shlex.quote(sp) + " " + shlex.quote(tmp)); run(ssh, "mv -f -- " + shlex.quote(tmp) + " " + shlex.quote(path))
                if rsha(sftp, path) != ch[path]: raise RuntimeError("INSTALL_HASH_MISMATCH:" + path)
            evidence["afterHashes"] = {p: rsha(sftp, p) for p in (ADDON, INDEX)}; evidence["backupFiles"] = backups
        served = {}
        for path in (ADDON, INDEX):
            up = path.removeprefix("/linhhoasu/webgame/game"); url = "http://127.0.0.1:81" + up + "?verify=appearance_preview_cn_v5_" + stamp; got = run(ssh, "curl -fsS --max-time 15 " + shlex.quote(url) + " | sha256sum | cut -d' ' -f1").strip(); served[path] = {"url": url, "sha256": got, "matches": got == evidence["afterHashes"][path]};
            if got != evidence["afterHashes"][path]: raise RuntimeError("HTTP_READBACK_HASH_MISMATCH:" + path)
        evidence["served"] = served; evidence["status"] = "DEPLOYED"; run(ssh, "rm -f -- " + " ".join(shlex.quote(x) for x in stages)); run(ssh, "rmdir -- " + shlex.quote(stage))
    except Exception: evidence["status"] = "FAILED"; raise
    finally: evidence_path.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"); ssh.close()
    print(json.dumps(evidence, ensure_ascii=False, indent=2))
if __name__ == "__main__": main()
