"""Prepare a one-variable A/B index containing VUSA's exact hit-route guard."""
from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
REFERENCE_RUNTIME = ROOT / "_ai_workbench/temp/tutien_vusa_reference_20260831_214348/raw/index.runtime.html"
BASE_INDEX = ROOT / "_ai_workbench/temp/vusa_hybrid_test_candidate_20260831_164048/linhhoasu/webgame/game/index.html"
OUT = ROOT / "_ai_workbench/temp/vusa_hit_route_v6_candidate_20260901"
EXPECTED_BASE = "857bd18ef39b924b5c0d7a958a32ca21ca79b9c179576c97fc61a4ea50007260"
EXPECTED_SCRIPT = "1e171081a591069243f9260440b7e8163d2bf56a8c82ac169d77ac1645c87678"
START = "<!-- LHS_MAIN_HIT_ROUTE_V6_START -->"
END = "<!-- LHS_MAIN_HIT_ROUTE_V6_END -->"


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> None:
    if OUT.exists() and any(OUT.iterdir()):
        raise FileExistsError(OUT)
    base = BASE_INDEX.read_bytes()
    if sha256(base) != EXPECTED_BASE:
        raise RuntimeError(f"base index hash changed: {sha256(base)}")
    reference = REFERENCE_RUNTIME.read_text(encoding="utf-8")
    start = reference.index(START)
    end = reference.index(END, start) + len(END)
    block = reference[start:end]
    script_match = re.search(r"<script>(.*?)</script>", block, re.S)
    if not script_match:
        raise RuntimeError("reference guard script not found")
    script = script_match.group(1)
    if sha256(script.encode("utf-8")) != EXPECTED_SCRIPT:
        raise RuntimeError(
            f"reference script hash changed: {sha256(script.encode('utf-8'))}"
        )
    if base.count(b"</body>") != 1:
        raise RuntimeError("base index closing body precondition mismatch")
    if START.encode() in base or b"__lhsMainHitRouteV6Bootstrap" in base:
        raise RuntimeError("base index already has hit-route guard")
    candidate = base.replace(b"</body>", ("\n" + block + "\n</body>").encode("utf-8"), 1)
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "index.html").write_bytes(candidate)
    (OUT / "guard.js").write_text(script, encoding="utf-8")
    manifest = {
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "scope": "test-vps-only",
        "base": {"path": str(BASE_INDEX), "sha256": sha256(base), "bytes": len(base)},
        "reference": {
            "path": str(REFERENCE_RUNTIME),
            "guardScriptSha256": sha256(script.encode("utf-8")),
            "guardScriptBytes": len(script.encode("utf-8")),
        },
        "candidate": {
            "path": str(OUT / "index.html"),
            "sha256": sha256(candidate),
            "bytes": len(candidate),
        },
        "contract": {
            "onlyChange": "insert exact VUSA LHS_MAIN_HIT_ROUTE_V6 block before closing body",
            "mainBundleChanged": False,
            "serverChanged": False,
            "markers": ["__lhsMainHitRouteV6Bootstrap", "__lhsMainLayerPriorityV8"],
        },
    }
    (OUT / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
