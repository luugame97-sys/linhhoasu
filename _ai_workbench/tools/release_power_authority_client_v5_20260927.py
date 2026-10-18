"""Roll out the post-equipment authoritative-power presentation guard.

Reuses the already reviewed CAS/backup/HTTP verification runner, but uses a
new evidence directory and current v5 tests so the previous v2 release remains
an immutable audit record.
"""
import json
import subprocess
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import release_power_authority_client_20260927 as base


WB = Path(__file__).resolve().parents[1]
WORK = WB.parent
base.OUT = WB / "temp" / "power_authority_client_v5_20260927"
base.MANIFEST = base.OUT / "release.json"


def local_tests_v5():
    tests = [
        WORK / "_ai_workbench/tools/test_power_authoritative_v2_20260927.js",
        WORK / "_ai_workbench/tools/test_power_relogin_v5_20260927.js",
    ]
    outputs = {}
    for path in tests:
        proc = subprocess.run(["node", str(path)], cwd=str(WORK), text=True,
                              capture_output=True, check=True)
        lines = [line for line in proc.stdout.splitlines() if line.strip()]
        outputs[path.name] = json.loads(lines[-1])
        if outputs[path.name].get("result") != "PASS":
            raise RuntimeError("LOCAL_TEST_FAILED:" + path.name)
    for path in base.FILES.values():
        if path.suffix == ".js":
            subprocess.run(["node", "--check", str(path)], cwd=str(WORK), check=True,
                           capture_output=True, text=True)
    return outputs


def verify_live_v5(ssh, report):
    disk = base.remote_hashes(ssh, list(report["after"]))
    http = base.http_hashes(ssh, list(report["after"]),
                            "20260927_power_authority_client_v5")
    ready = base.readiness(ssh)
    marker = base.run(
        ssh,
        "grep -E '20260927_power_(relogin_v5|authoritative_v2)' "
        + base.shlex.quote(base.GAME + "/index.html"),
        timeout=20,
    ).strip()
    result = {"disk": disk, "http": http, "expected": report["after"],
              "ready": ready, "indexMarkers": marker,
              "productionWrites": 0, "processRestarts": 0}
    if disk != report["after"] or http != report["after"] \
            or any(v != "200" for v in ready.values()):
        raise RuntimeError("LIVE_VERIFY_FAILED:" + json.dumps(result, ensure_ascii=False))
    return result


base.local_tests = local_tests_v5
base.verify_live = verify_live_v5


def main():
    action = sys.argv[1] if len(sys.argv) > 1 else "stage"
    ssh = base.connect()
    try:
        if action == "stage":
            base.stage(ssh)
        elif action == "deploy":
            base.deploy(ssh)
        elif action == "verify":
            base.verify(ssh)
        else:
            raise SystemExit("usage: release_power_authority_client_v5_20260927.py [stage|deploy|verify]")
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
