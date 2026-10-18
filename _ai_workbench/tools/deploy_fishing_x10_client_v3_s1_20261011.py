from __future__ import annotations

import hashlib
import importlib.util
import json
import shlex
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location(
    "h", ROOT / "_ai_workbench/tools/release_artifact_quench_fix_20261009.py"
)
h = importlib.util.module_from_spec(spec)
spec.loader.exec_module(h)

REMOTE = "/linhhoasu/webgame/game/js/lhs-fishing-x10-v2.js"
ADDON = ROOT / "linhhoasu/webgame/game/js/lhs-fishing-x10-v2.js"
EXPECTED_OLD = "b8295a47924a0f53134e5fce2eafe4e133d2ec5de0a82cb2c39be770526067b2"


def q(value: str) -> str:
    return shlex.quote(value)


def main() -> None:
    session = h.connect()
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup = f"/linhoasu/_ai_workbench/backups/fishing_x10_client_v3_s1_{stamp}"
    stage = f"/linhoasu/_ai_workbench/temp/fishing_x10_client_v3_s1_{stamp}"
    ev = {
        "at": datetime.now(timezone.utc).isoformat(),
        "result": "FAILED",
        "productionWrites": 0,
        "playerWrites": 0,
    }
    try:
        candidate = ADDON.read_bytes()
        new_hash = hashlib.sha256(candidate).hexdigest()
        old_hash = h.rh(session, REMOTE)
        if old_hash != EXPECTED_OLD:
            raise RuntimeError(f"CLIENT_CAS:{old_hash}")
        h.run(session, "install -d -m 700 " + q(backup) + " " + q(stage))
        h.run(session, "cp -p -- " + q(REMOTE) + " " + q(backup + "/lhs-fishing-x10-v2.js"))
        with session.open_sftp() as sftp:
            with sftp.open(stage + "/lhs-fishing-x10-v2.js", "wb") as fh:
                fh.write(candidate)
        if h.rh(session, stage + "/lhs-fishing-x10-v2.js") != new_hash:
            raise RuntimeError("STAGE_HASH")
        tmp = REMOTE + ".v3.tmp"
        h.run(
            session,
            "cp -- " + q(stage + "/lhs-fishing-x10-v2.js")
            + " " + q(tmp)
            + " && chmod --reference=" + q(REMOTE) + " " + q(tmp)
            + " && chown --reference=" + q(REMOTE) + " " + q(tmp)
            + " && mv -f -- " + q(tmp) + " " + q(REMOTE),
        )
        if h.rh(session, REMOTE) != new_hash:
            raise RuntimeError("READBACK")
        syntax = h.run(session, "node --check " + q(REMOTE) + " >/dev/null && echo PASS").strip()
        if syntax != "PASS":
            raise RuntimeError("SYNTAX")
        ev.update(
            {
                "result": "PASS",
                "backup": backup,
                "beforeHash": old_hash,
                "afterHash": new_hash,
                "syntax": syntax,
                "verifiedAt": datetime.now(timezone.utc).isoformat(),
            }
        )
    except Exception as exc:
        ev["error"] = str(exc)
        raise
    finally:
        (ROOT / "_ai_workbench/temp/fishing_x10_v2_20261011/client_v3_release.json").write_text(
            json.dumps(ev, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        try:
            h.run(session, "rm -rf -- " + q(stage), 30)
        except Exception:
            pass
        session.close()
    print(json.dumps(ev, ensure_ascii=False))


if __name__ == "__main__":
    main()
