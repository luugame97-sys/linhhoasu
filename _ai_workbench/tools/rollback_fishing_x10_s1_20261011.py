from __future__ import annotations

import hashlib
import importlib.util
import json
import shlex
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("h", ROOT / "_ai_workbench/tools/release_artifact_quench_fix_20261009.py")
h = importlib.util.module_from_spec(spec)
spec.loader.exec_module(h)

REMOTE = "/linhhoasu/lhs/newServer"
WEB = "/linhhoasu/webgame/game"
FILES = {
    "src/handlers/compat.js": "/linhhoasu/_ai_workbench/backups/fishing_x10_s1_20261010_235457/src/handlers/compat.js",
    "src/handlers/fish.js": "/linhhoasu/_ai_workbench/backups/fishing_x10_server_v2_s1_20261011_011907/src/handlers/fish.js",
    "src/services/PlayerService.js": "/linhhoasu/_ai_workbench/backups/fishing_x10_server_v2_s1_20261011_011907/src/services/PlayerService.js",
}
INDEX_BACKUP = "/linhhoasu/_ai_workbench/backups/fishing_x10_s1_20261010_235457/webgame/game/index.html"


def q(value: str) -> str:
    return shlex.quote(value)


def main() -> None:
    s = h.connect()
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup = f"/linhhoasu/_ai_workbench/backups/fishing_x10_rollback_{stamp}"
    stage = f"/linhhoasu/_ai_workbench/temp/fishing_x10_rollback_{stamp}"
    ev = {"at": datetime.now(timezone.utc).isoformat(), "result": "FAILED", "productionWrites": 0, "playerWrites": 0}
    try:
        pre = next(x for x in h.procs(s) if x["name"] == "lhs-s1001")
        if pre["status"] != "online" or h.ready(s, 8080) != "200": raise RuntimeError("S1_BASELINE")
        current = {rel: h.rh(s, REMOTE + "/" + rel) for rel in FILES}
        current["webgame/game/index.html"] = h.rh(s, WEB + "/index.html")
        ev["preHashes"] = current
        h.run(s, "install -d -m 700 " + q(backup) + " " + q(stage))
        h.run(s, "install -d -m 700 " + q(backup + "/src/handlers") + " " + q(backup + "/src/services") + " " + q(backup + "/webgame/game"))
        for rel in FILES:
            h.run(s, "cp -p -- " + q(REMOTE + "/" + rel) + " " + q(backup + "/" + rel))
        h.run(s, "cp -p -- " + q(WEB + "/index.html") + " " + q(backup + "/webgame/game/index.html"))
        # Restore the known pre-feature snapshots with atomic replacement.
        for rel, source in FILES.items():
            target = REMOTE + "/" + rel
            staged = stage + "/" + rel
            h.run(s, "install -d -m 700 " + q(staged.rsplit("/", 1)[0]))
            h.run(s, "cp -- " + q(source) + " " + q(staged))
            tmp = target + ".x10rollback.tmp"
            h.run(s, "cp -- " + q(staged) + " " + q(tmp) + " && chmod --reference=" + q(target) + " " + q(tmp) + " && chown --reference=" + q(target) + " " + q(tmp) + " && mv -f -- " + q(tmp) + " " + q(target))
        target = WEB + "/index.html"
        staged = stage + "/webgame/game/index.html"
        h.run(s, "install -d -m 700 " + q(staged.rsplit("/", 1)[0]) + " && cp -- " + q(INDEX_BACKUP) + " " + q(staged))
        tmp = target + ".x10rollback.tmp"
        h.run(s, "cp -- " + q(staged) + " " + q(tmp) + " && chmod --reference=" + q(target) + " " + q(tmp) + " && chown --reference=" + q(target) + " " + q(tmp) + " && mv -f -- " + q(tmp) + " " + q(target))
        # The feature service and both client addons were introduced by this rollout.
        h.run(s, "rm -f -- " + q(REMOTE + "/src/services/FishingX10Service.js") + " " + q(WEB + "/js/lhs-fishing-x10-v1.js") + " " + q(WEB + "/js/lhs-fishing-x10-v2.js"))
        syntax = h.run(s, "node --check " + q(REMOTE + "/src/handlers/compat.js") + " && node --check " + q(REMOTE + "/src/handlers/fish.js") + " && node --check " + q(REMOTE + "/src/services/PlayerService.js") + " && echo PASS").strip()
        if syntax != "PASS": raise RuntimeError("SYNTAX")
        for rel in FILES:
            if "FishingX10" in h.run(s, "grep -n 'FishingX10\|11000022\|fishingX10CAS' " + q(REMOTE + "/" + rel) + " || true"): raise RuntimeError("MARKER:" + rel)
        if "lhs-fishing-x10" in h.run(s, "grep -n 'lhs-fishing-x10' " + q(WEB + "/index.html") + " || true"): raise RuntimeError("INDEX_MARKER")
        h.run(s, "pm2 restart lhs-s1001", 120)
        deadline = time.time() + 90; ready = "000"
        while time.time() < deadline:
            ready = h.ready(s, 8080)
            if ready == "200": break
            time.sleep(1)
        if ready != "200": raise RuntimeError("POST_READY:" + ready)
        ev.update({"result": "PASS", "postReady": ready, "postProcess": next(x for x in h.procs(s) if x["name"] == "lhs-s1001"), "installedHashes": {rel: h.rh(s, REMOTE + "/" + rel) for rel in FILES}, "indexHash": h.rh(s, WEB + "/index.html"), "addons": h.run(s, "for f in lhs-fishing-x10-v1.js lhs-fishing-x10-v2.js; do test -e " + q(WEB + "/js/$f") + " && echo $f:EXISTS || echo $f:MISSING; done").strip(), "backup": backup, "verifiedAt": datetime.now(timezone.utc).isoformat()})
    except Exception as exc:
        ev["error"] = str(exc)
        raise
    finally:
        (ROOT / "_ai_workbench/temp/fishing_x10_v2_20261011/rollback_release.json").write_text(json.dumps(ev, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        try: h.run(s, "rm -rf -- " + q(stage), 30)
        except Exception: pass
        s.close()
    print(json.dumps(ev, ensure_ascii=False))


if __name__ == "__main__": main()
