from __future__ import annotations

import hashlib
import importlib.util
import json
import shlex
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("h", ROOT / "_ai_workbench/tools/release_artifact_quench_fix_20261009.py")
h = importlib.util.module_from_spec(spec)
spec.loader.exec_module(h)

INDEX = "/linhhoasu/webgame/game/index.html"
OLD_INDEX = "6090afe655a8aec1067fad6828aead60df1d30053a71c50b2310aa9e83894f13"
OLD_MARKER = b"js/lhs-fishing-x10-v2.js?v=20261011_fishing_x10_v2"
NEW_MARKER = b"js/lhs-fishing-x10-v2.js?v=20261011_fishing_x10_v4"


def q(value: str) -> str:
    return shlex.quote(value)


def main() -> None:
    s = h.connect()
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup = f"/linhoasu/_ai_workbench/backups/fishing_x10_index_v4_s1_{stamp}"
    stage = f"/linhoasu/_ai_workbench/temp/fishing_x10_index_v4_s1_{stamp}"
    ev = {"at": datetime.now(timezone.utc).isoformat(), "result": "FAILED", "productionWrites": 0, "playerWrites": 0}
    try:
        old_hash = h.rh(s, INDEX)
        if old_hash != OLD_INDEX:
            raise RuntimeError(f"INDEX_CAS:{old_hash}")
        with s.open_sftp() as sf:
            with sf.open(INDEX, "rb") as f:
                data = f.read()
        if data.count(OLD_MARKER) != 1:
            raise RuntimeError("INDEX_MARKER")
        candidate = data.replace(OLD_MARKER, NEW_MARKER, 1)
        new_hash = hashlib.sha256(candidate).hexdigest()
        h.run(s, "install -d -m 700 " + q(backup) + " " + q(stage))
        h.run(s, "cp -p -- " + q(INDEX) + " " + q(backup + "/index.html"))
        with s.open_sftp() as sf:
            with sf.open(stage + "/index.html", "wb") as f:
                f.write(candidate)
        if h.rh(s, stage + "/index.html") != new_hash:
            raise RuntimeError("STAGE_HASH")
        tmp = INDEX + ".x10v4.tmp"
        h.run(s, "cp -- " + q(stage + "/index.html") + " " + q(tmp) + " && chmod --reference=" + q(INDEX) + " " + q(tmp) + " && chown --reference=" + q(INDEX) + " " + q(tmp) + " && mv -f -- " + q(tmp) + " " + q(INDEX))
        if h.rh(s, INDEX) != new_hash:
            raise RuntimeError("READBACK")
        ev.update({"result": "PASS", "backup": backup, "beforeHash": old_hash, "afterHash": new_hash, "marker": NEW_MARKER.decode(), "verifiedAt": datetime.now(timezone.utc).isoformat()})
    except Exception as e:
        ev["error"] = str(e)
        raise
    finally:
        (ROOT / "_ai_workbench/temp/fishing_x10_v2_20261011/index_v4_release.json").write_text(json.dumps(ev, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        try: h.run(s, "rm -rf -- " + q(stage), 30)
        except Exception: pass
        s.close()
    print(json.dumps(ev, ensure_ascii=False))


if __name__ == "__main__": main()
