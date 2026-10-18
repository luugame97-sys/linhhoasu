"""Stage OldTrek maintenance/rank parity fix on S1 with backup/CAS/readiness gates."""
from __future__ import annotations

import hashlib
import json
import shlex
import time
from datetime import datetime, timezone
from pathlib import Path

from skin_incident_remote import connect, run

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / "_ai_workbench" / "temp" / "oldtrek_fix_20261016"
CANDIDATE = BASE / "candidate"
REMOTE_CANDIDATE = BASE / "remote"
OUT = BASE / "canary_deployment.json"
APP = "/linhhoasu/lhs/newServer"
REMOTE = {
    "app.js": f"{APP}/src/app.js",
    "ecosystem.config.js": f"{APP}/ecosystem.config.js",
    "OldTrekMaintenanceService.js": f"{APP}/src/services/OldTrekMaintenanceService.js",
}
EXPECTED = {
    f"{APP}/src/app.js": "5bf25f13aef14a33dfec102e77fb155cfce4864a156ef3a3d84d735c65b827fa",
    f"{APP}/ecosystem.config.js": "543ffb47ba41e987f698a5789c44dfc47ec07af85dc24d5af2300d7e77a012c8",
}


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    BASE.mkdir(parents=True, exist_ok=True)
    candidate_paths = {
        "app.js": REMOTE_CANDIDATE / "app.js",
        "ecosystem.config.js": REMOTE_CANDIDATE / "ecosystem.config.js",
        "OldTrekMaintenanceService.js": CANDIDATE / "OldTrekMaintenanceService.js",
    }
    for name, path in candidate_paths.items():
        if not path.exists():
            raise SystemExit(f"missing candidate: {path}")
    if not candidate_paths["OldTrekMaintenanceService.js"].exists():
        raise SystemExit("missing candidate service")

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    receipt = {
        "at": datetime.now(timezone.utc).isoformat(),
        "readOnlyBeforeMutation": True,
        "productionWrites": 0,
        "stage": "S1_canary",
        "candidateHashes": {name: sha(path) for name, path in candidate_paths.items()},
    }
    with connect() as client:
        backup = f"/linhhoasu/_ai_workbench/backups/oldtrek_fix_20261016_{stamp}"
        receipt["backup"] = backup
        run(client, "set -eu; " + " && ".join([
            f"mkdir -p {shlex.quote(backup)}",
            f"cp -p {shlex.quote(REMOTE['app.js'])} {shlex.quote(backup + '/app.js')}",
            f"cp -p {shlex.quote(REMOTE['ecosystem.config.js'])} {shlex.quote(backup + '/ecosystem.config.js')}",
            f"pm2 jlist > {shlex.quote(backup + '/pm2_before.json')}",
            f"sha256sum {shlex.quote(REMOTE['app.js'])} {shlex.quote(REMOTE['ecosystem.config.js'])} > {shlex.quote(backup + '/hashes_before.txt')}",
        ]))
        live_hashes = run(client, f"sha256sum {shlex.quote(REMOTE['app.js'])} {shlex.quote(REMOTE['ecosystem.config.js'])}")
        receipt["liveHashesBefore"] = live_hashes.strip().splitlines()
        for line in live_hashes.splitlines():
            digest, path = line.split(None, 1)
            if EXPECTED.get(path.strip()) != digest.lower():
                raise RuntimeError(f"CAS mismatch for {path}: {digest}")

        sftp = client.open_sftp()
        try:
            for name, remote_path in REMOTE.items():
                local_path = candidate_paths[name]
                temp_path = f"{remote_path}.codex-oldtrek-{stamp}.js"
                sftp.put(str(local_path), temp_path)
                run(client, f"set -eu; node --check {shlex.quote(temp_path)}; mv {shlex.quote(temp_path)} {shlex.quote(remote_path)}; chmod 644 {shlex.quote(remote_path)}")
        finally:
            sftp.close()

        try:
            run(client, f"set -eu; node --check {shlex.quote(REMOTE['app.js'])}; node --check {shlex.quote(REMOTE['ecosystem.config.js'])}; node --check {shlex.quote(REMOTE['OldTrekMaintenanceService.js'])}")
            run(client, f"cd {APP} && pm2 restart ecosystem.config.js --only lhs-s1001 --update-env",)
            ready = None
            for _ in range(60):
                ready = run(client, "curl -sS -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:8080/ready || true").strip()
                if ready == "200":
                    break
                time.sleep(1)
            receipt["s1Ready"] = ready
            receipt["s1Process"] = json.loads(run(client, "pm2 jlist"))
            receipt["s1Process"] = next((row for row in receipt["s1Process"] if row.get("name") == "lhs-s1001"), None)
            receipt["s1LogTail"] = run(client, "tail -n 80 /root/.pm2/logs/lhs-s1001-out.log | grep -E 'OldTrekReconcile|startup failed|started:' | tail -n 20 || true")
            if ready != "200":
                raise RuntimeError(f"S1 readiness failed: {ready}")
        except Exception:
            run(client, f"set -eu; cp -p {shlex.quote(backup + '/app.js')} {shlex.quote(REMOTE['app.js'])}; cp -p {shlex.quote(backup + '/ecosystem.config.js')} {shlex.quote(REMOTE['ecosystem.config.js'])}; rm -f {shlex.quote(REMOTE['OldTrekMaintenanceService.js'])}; cd {APP} && pm2 restart ecosystem.config.js --only lhs-s1001 --update-env",)
            receipt["rolledBack"] = True
            OUT.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            raise

        receipt["rolledBack"] = False
        receipt["liveHashesAfter"] = run(client, f"sha256sum {shlex.quote(REMOTE['app.js'])} {shlex.quote(REMOTE['ecosystem.config.js'])} {shlex.quote(REMOTE['OldTrekMaintenanceService.js'])}").strip().splitlines()
    OUT.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(receipt, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
