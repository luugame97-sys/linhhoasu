"""Build a production hit-route candidate from the exact current live index.

This tool is local-only. It does not connect to, upload to, or restart production.
"""
from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SSH_INDEX = ROOT / "_ai_workbench/temp/remote_index_current.html"
SERVED_INDEX = ROOT / "_ai_workbench/temp/prod_hit_route_audit_20260901/served_index.html"
REFERENCE_INDEX = ROOT / "_ai_workbench/temp/vusa_hit_route_v6_candidate_20260901/index.html"
SERVED_MAIN = ROOT / "_ai_workbench/temp/prod_hit_route_audit_20260901/main.min_a6195824.js"
OUT = ROOT / "_ai_workbench/temp/prod_hit_route_v6_candidate_20260901"

EXPECTED_INDEX = "970667f4833a439a30d1d42fea61f65c15799ec03ce72d9bd3164b495fd82a18"
EXPECTED_MAIN = "0a83139204f9635db61b166907355e0ecff971569693d0e1a7fe438591b0dfe1"
EXPECTED_SCRIPT = "1e171081a591069243f9260440b7e8163d2bf56a8c82ac169d77ac1645c87678"
START = "<!-- LHS_MAIN_HIT_ROUTE_V6_START -->"
END = "<!-- LHS_MAIN_HIT_ROUTE_V6_END -->"


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> None:
    ssh_index = SSH_INDEX.read_bytes()
    served_index = SERVED_INDEX.read_bytes()
    served_main = SERVED_MAIN.read_bytes()

    if sha256(ssh_index) != EXPECTED_INDEX:
        raise RuntimeError(f"SSH index hash changed: {sha256(ssh_index)}")
    if sha256(served_index) != EXPECTED_INDEX:
        raise RuntimeError(f"served index hash changed: {sha256(served_index)}")
    if ssh_index != served_index:
        raise RuntimeError("SSH and served production indexes differ")
    if sha256(served_main) != EXPECTED_MAIN:
        raise RuntimeError(f"served main hash changed: {sha256(served_main)}")

    reference = REFERENCE_INDEX.read_text(encoding="utf-8")
    start = reference.index(START)
    end = reference.index(END, start) + len(END)
    block = reference[start:end]
    script_match = re.search(r"<script>(.*?)</script>", block, re.S)
    if not script_match:
        raise RuntimeError("canonical guard script not found")
    script_bytes = script_match.group(1).encode("utf-8")
    if sha256(script_bytes) != EXPECTED_SCRIPT:
        raise RuntimeError(f"canonical guard hash changed: {sha256(script_bytes)}")

    if ssh_index.count(b"</body>") != 1:
        raise RuntimeError("production closing-body precondition mismatch")
    if START.encode() in ssh_index or b"__lhsMainHitRouteV6Bootstrap" in ssh_index:
        raise RuntimeError("production already contains the hit-route guard")

    inserted = ("\n" + block + "\n</body>").encode("utf-8")
    candidate = ssh_index.replace(b"</body>", inserted, 1)
    restored = candidate.replace(("\n" + block + "\n").encode("utf-8"), b"", 1)
    if restored != ssh_index:
        raise RuntimeError("candidate has changes outside the exact inserted block")
    if candidate.count(START.encode()) != 1 or candidate.count(END.encode()) != 1:
        raise RuntimeError("candidate marker count mismatch")

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "index.html").write_bytes(candidate)
    manifest = {
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "scope": "production-candidate-local-only-not-deployed",
        "production": {
            "sshIndexSha256": sha256(ssh_index),
            "servedIndexSha256": sha256(served_index),
            "indexBytes": len(ssh_index),
            "servedMainSha256": sha256(served_main),
            "mainBytes": len(served_main),
        },
        "guard": {
            "scriptSha256": sha256(script_bytes),
            "scriptBytes": len(script_bytes),
            "markers": ["__lhsMainHitRouteV6Bootstrap", "__lhsMainLayerPriorityV8"],
        },
        "candidate": {
            "path": str(OUT / "index.html"),
            "sha256": sha256(candidate),
            "bytes": len(candidate),
        },
        "contract": {
            "onlyChange": "insert exact canonical LHS_MAIN_HIT_ROUTE_V6 block before closing body",
            "baseRestoredByteIdentical": restored == ssh_index,
            "mainBundleChanged": False,
            "serverChanged": False,
            "deployed": False,
            "backendRestartRequired": False,
        },
    }
    (OUT / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
