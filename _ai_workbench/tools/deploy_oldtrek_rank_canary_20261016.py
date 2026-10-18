"""Deploy deterministic OldTrek rank tie-break to S1 with backup/CAS/readiness gates."""
from __future__ import annotations

import hashlib
import json
import shlex
import time
from datetime import datetime, timezone
from pathlib import Path

from skin_incident_remote import connect, run

ROOT = Path(__file__).resolve().parents[2]
CANDIDATE = ROOT / "_ai_workbench" / "temp" / "oldtrek_fix_20261016" / "remote" / "OldTrekArenaService.js"
OUT = ROOT / "_ai_workbench" / "temp" / "oldtrek_fix_20261016" / "rank_canary_deployment.json"
REMOTE_APP = "/linhhoasu/lhs/newServer"
REMOTE = f"{REMOTE_APP}/src/services/OldTrekArenaService.js"
EXPECTED = "f5700217"  # prefix only; full hash is checked from the live file below.


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    if not CANDIDATE.exists():
        raise SystemExit(f"missing candidate: {CANDIDATE}")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup = f"/linhhoasu/_ai_workbench/backups/oldtrek_rank_20261016_{stamp}"
    receipt = {
        "at": datetime.now(timezone.utc).isoformat(),
        "readOnlyBeforeMutation": True,
        "productionWrites": 0,
        "stage": "S1_rank_canary",
        "candidateHash": sha(CANDIDATE),
        "backup": backup,
    }
    with connect() as client:
        run(client, "set -eu; " + " && ".join([
            f"mkdir -p {shlex.quote(backup)}",
            f"cp -p {shlex.quote(REMOTE)} {shlex.quote(backup + '/OldTrekArenaService.js')}",
            f"pm2 jlist > {shlex.quote(backup + '/pm2_before.json')}",
            f"sha256sum {shlex.quote(REMOTE)} > {shlex.quote(backup + '/hash_before.txt')}",
        ]))
        live = run(client, f"sha256sum {shlex.quote(REMOTE)}").strip()
        receipt["liveHashBefore"] = live
        if not live.startswith(EXPECTED):
            raise RuntimeError(f"CAS mismatch for {REMOTE}: {live}")
        sftp = client.open_sftp()
        temp = f"{REMOTE}.codex-rank-{stamp}.js"
        try:
            sftp.put(str(CANDIDATE), temp)
            run(client, f"set -eu; node --check {shlex.quote(temp)}; mv {shlex.quote(temp)} {shlex.quote(REMOTE)}; chmod 644 {shlex.quote(REMOTE)}")
        finally:
            sftp.close()
        try:
            run(client, f"node --check {shlex.quote(REMOTE)}")
            run(client, f"cd {REMOTE_APP} && pm2 restart ecosystem.config.js --only lhs-s1001 --update-env")
            ready = None
            for _ in range(60):
                ready = run(client, "curl -sS -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:8080/ready || true").strip()
                if ready == "200":
                    break
                time.sleep(1)
            receipt["s1Ready"] = ready
            state = json.loads(run(client, "pm2 jlist"))
            receipt["s1Process"] = next((row for row in state if row.get("name") == "lhs-s1001"), None)
            if ready != "200":
                raise RuntimeError(f"S1 readiness failed: {ready}")
        except Exception:
            run(client, f"set -eu; cp -p {shlex.quote(backup + '/OldTrekArenaService.js')} {shlex.quote(REMOTE)}; cd {REMOTE_APP} && pm2 restart ecosystem.config.js --only lhs-s1001 --update-env")
            receipt["rolledBack"] = True
            OUT.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            raise
        receipt["rolledBack"] = False
        receipt["liveHashAfter"] = run(client, f"sha256sum {shlex.quote(REMOTE)}").strip()
    OUT.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(receipt, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
