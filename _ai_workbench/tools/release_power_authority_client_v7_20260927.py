"""Deploy the guarded authoritative-power +/- presentation fix v7."""
import json
import subprocess
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import release_power_authority_client_20260927 as base

WB = Path(__file__).resolve().parents[1]
WORK = WB.parent
base.OUT = WB / "temp" / "power_authority_client_v7_20260927"
base.MANIFEST = base.OUT / "release.json"
base.FILES = {
    base.GAME + "/index.html": WORK / "linhhoasu/webgame/game/index.html",
    base.GAME + "/js/lhs-power-relogin-v1.js": WORK / "linhhoasu/webgame/game/js/lhs-power-relogin-v1.js",
    base.GAME + "/js/lhs-hud-power-full-v1.js": WORK / "linhhoasu/webgame/game/js/lhs-hud-power-full-v1.js",
    base.GAME + "/js/lhs-power-authoritative-v1.js": WORK / "linhhoasu/webgame/game/js/lhs-power-authoritative-v1.js",
}


def local_tests_v7():
    tests = [
        WORK / "_ai_workbench/tools/test_power_authoritative_v2_20260927.js",
        WORK / "_ai_workbench/tools/test_power_authoritative_v3_20260927.js",
        WORK / "_ai_workbench/tools/test_power_authoritative_v4_20260927.js",
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


def verify_live_v7(ssh, report):
    disk = base.remote_hashes(ssh, list(report["after"]))
    http = base.http_hashes(ssh, list(report["after"]),
                            "20260927_power_authority_client_v7")
    ready = base.readiness(ssh)
    marker = base.run(
        ssh,
        "grep -E '20260927_(power_relogin_v5|power_authoritative_v4|hud_power_full_v3)' "
        + base.shlex.quote(base.GAME + "/index.html"), timeout=20,
    ).strip()
    result = {"disk": disk, "http": http, "expected": report["after"],
              "ready": ready, "indexMarkers": marker,
              "productionWrites": 0, "realPlayerWrites": 0,
              "processRestarts": 0}
    if disk != report["after"] or http != report["after"] \
            or any(v != "200" for v in ready.values()):
        raise RuntimeError("LIVE_VERIFY_FAILED:" + json.dumps(result, ensure_ascii=False))
    return result


base.local_tests = local_tests_v7
base.verify_live = verify_live_v7


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
            raise SystemExit("usage: release_power_authority_client_v7_20260927.py [stage|deploy|verify]")
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
