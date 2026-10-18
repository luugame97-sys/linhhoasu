"""Read-only exact-live snapshot for the selective OldTrek recovery."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from rollback_role_lian_manifest_20260930 import ssh_config
import paramiko

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "_ai_workbench/temp/oldtrek_selective_20261012/baseline"
FILES = {
    "src/handlers/old-trek.js": "/linhhoasu/lhs/newServer/src/handlers/old-trek.js",
    "src/services/OldTrekEventService.js": "/linhhoasu/lhs/newServer/src/services/OldTrekEventService.js",
    "src/services/OldTrekProgressService.js": "/linhhoasu/lhs/newServer/src/services/OldTrekProgressService.js",
    "src/services/OldTrekLedgerService.js": "/linhhoasu/lhs/newServer/src/services/OldTrekLedgerService.js",
    "src/services/OldTrekSettlementService.js": "/linhhoasu/lhs/newServer/src/services/OldTrekSettlementService.js",
    "src/services/PlayerService.js": "/linhhoasu/lhs/newServer/src/services/PlayerService.js",
    "src/config/oldTrekGameplayPolicy.json": "/linhhoasu/lhs/newServer/src/config/oldTrekGameplayPolicy.json",
}


def main() -> None:
    args, kwargs = ssh_config()
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(*args, **kwargs)
    manifest = {}
    try:
        OUT.mkdir(parents=True, exist_ok=True)
        with client.open_sftp() as sftp:
            for rel, remote in FILES.items():
                with sftp.open(remote, "rb") as handle:
                    data = handle.read()
                target = OUT / rel
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(data)
                manifest[rel] = {
                    "remote": remote,
                    "bytes": len(data),
                    "sha256": hashlib.sha256(data).hexdigest(),
                }
        (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(manifest, indent=2))
    finally:
        client.close()


if __name__ == "__main__":
    main()
