"""Read-only preflight for the appearance preview release."""
import hashlib
import json
import shlex
from pathlib import Path

from snapshot_web_multiserver_20260906 import connect, run

ROOT = Path(__file__).resolve().parents[2]
FILES = {
    "/linhhoasu/webgame/game/js/lhs-appearance-preview-v1.js": ROOT / "linhhoasu/webgame/game/js/lhs-appearance-preview-v1.js",
    "/linhhoasu/webgame/game/index.html": ROOT / "linhhoasu/webgame/game/index.html",
    "/linhhoasu/lhs/newServer/src/handlers/mount.js": ROOT / "linhhoasu/lhs/newServer/src/handlers/mount.js",
}


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> None:
    local = {}
    for remote, path in FILES.items():
        data = path.read_bytes()
        text = data.decode("utf-8", "ignore")
        local[remote] = {
            "sha256": sha(data),
            "bytes": len(data),
            "previewMarker": "20260926_appearance_preview_v1" in text,
            "mountOwnershipMarker": "MOUNT_SKIN_NOT_OWNED" in text,
        }

    ssh = connect()
    try:
        remote = {}
        evidence = ROOT / "_ai_workbench" / "temp" / "appearance_preview_20260926"
        evidence.mkdir(parents=True, exist_ok=True)
        with ssh.open_sftp() as sftp:
            for path in FILES:
                try:
                    with sftp.open(path, "rb") as handle:
                        data = handle.read()
                except FileNotFoundError:
                    remote[path] = {"missing": True}
                    continue
                safe_name = path.strip("/").replace("/", "__")
                (evidence / ("remote_" + safe_name)).write_bytes(data)
                text = data.decode("utf-8", "ignore")
                remote[path] = {
                    "sha256": sha(data),
                    "bytes": len(data),
                    "previewMarker": "20260926_appearance_preview_v1" in text,
                    "mountOwnershipMarker": "MOUNT_SKIN_NOT_OWNED" in text,
                    "indexAddonCount": text.count("lhs-appearance-preview-v1.js"),
                }
        process_js = "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.stringify(JSON.parse(s).filter(p=>/^lhs-/.test(p.name)).map(p=>({name:p.name,pid:p.pid,status:p.pm2_env.status,restarts:p.pm2_env.restart_time})))));"
        processes = json.loads(run(ssh, "pm2 jlist | node -e " + shlex.quote(process_js)))
        out = {
            "result": "READ_ONLY_PREFLIGHT",
            "local": local,
            "remote": remote,
            "processes": processes,
            "productionWrites": 0,
        }
        (evidence / "preflight.json").write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(out, ensure_ascii=False, indent=2))
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
