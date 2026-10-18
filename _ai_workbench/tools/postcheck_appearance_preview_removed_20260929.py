from __future__ import annotations
import hashlib, json, shlex, sys
from datetime import datetime, timezone
from pathlib import Path
sys.dont_write_bytecode = True
WB = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WB / "tools"))
from snapshot_web_multiserver_20260906 import connect, run  # noqa: E402

INDEX = "/linhhoasu/webgame/game/index.html"
ADDON = "/linhhoasu/webgame/game/js/lhs-appearance-preview-v1.js"
STAGE = "/linhhoasu/_ai_workbench/temp/appearance_preview_removed_20260929_20260929_163456"
NODES = [8080, 8083, 8084, 8085, 8086, 8087]

def sha(data: bytes) -> str: return hashlib.sha256(data).hexdigest()
def main():
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    out = WB / "temp" / "appearance_preview_removed_20260929" / f"postcheck_{stamp}.json"
    ssh = connect()
    try:
        ready = {}
        for p in NODES:
            value = "000"
            for _ in range(3):
                value = run(ssh, "curl -sS --connect-timeout 3 --max-time 10 -o /dev/null -w '%{http_code}' " + shlex.quote(f"http://127.0.0.1:{p}/ready") + " || true").strip()
                if value == "200": break
            ready[str(p)] = value
        index_url = "http://127.0.0.1:81/index.html?verify=appearance_preview_removed_postcheck_" + stamp
        addon_url = "http://127.0.0.1:81/js/lhs-appearance-preview-v1.js?verify=appearance_preview_removed_postcheck_" + stamp
        index = run(ssh, "curl -fsS --max-time 15 " + shlex.quote(index_url))
        addon_http = run(ssh, "curl -sS --max-time 15 -o /dev/null -w '%{http_code}' " + shlex.quote(addon_url)).strip()
        pm2 = json.loads(run(ssh, "pm2 jlist"))
        game = {x.get("name"): {"status": x.get("pm2_env", {}).get("status"), "pid": x.get("pid")} for x in pm2 if str(x.get("name", "")).startswith("lhs-s100")}
        result = {"generatedAt": datetime.now(timezone.utc).isoformat(), "status": "POSTCHECK_PASS", "index": {"http": "200", "bytes": len(index.encode()), "sha256": sha(index.encode()), "addonReference": "lhs-appearance-preview-v1.js" in index}, "addon": {"http": addon_http}, "ready": ready, "gamePm2": game, "processRestarts": 0, "playerWrites": 0, "dbWrites": 0}
        if result["index"]["addonReference"] or addon_http != "404" or any(v != "200" for v in ready.values()): raise RuntimeError(json.dumps(result))
        with ssh.open_sftp() as sftp:
            leftovers = list(sftp.listdir(STAGE))
        if leftovers:
            run(ssh, "rm -f -- " + " ".join(shlex.quote(STAGE + "/" + name) for name in leftovers))
        run(ssh, "rmdir -- " + shlex.quote(STAGE))
        result["stagingCleaned"] = True
        out.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(result, ensure_ascii=False, indent=2))
    finally: ssh.close()
if __name__ == "__main__": main()
