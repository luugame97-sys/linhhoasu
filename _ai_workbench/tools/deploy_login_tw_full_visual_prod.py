"""Deploy TW login visual branch without changing region or gameplay flags."""
from __future__ import annotations

import getpass
import hashlib
import json
import shlex
from datetime import datetime, timezone
from pathlib import Path

import paramiko

HOST = "103.116.105.154"
ROOT = Path(__file__).resolve().parents[1]
CANDIDATE = ROOT / "temp/login_tw_full_visual_candidate_20260902"
FILES = {
    "start.min_52ac8d58.js": {
        "local": CANDIDATE / "start.min_52ac8d58.js",
        "remote": "/linhhoasu/webgame/game/js/start.min_52ac8d58.js",
        "expected": "12b520432a03487f3231325fe92ffa09e81cc9479543e3ab29a2e2702c77f4e5",
    },
    "main.min_a6195824.js": {
        "local": CANDIDATE / "main.min_a6195824.js",
        "remote": "/linhhoasu/webgame/game/js/main.min_a6195824.js",
        "expected": "0a83139204f9635db61b166907355e0ecff971569693d0e1a7fe438591b0dfe1",
    },
    "index.html": {
        "local": CANDIDATE / "index.html",
        "remote": "/linhhoasu/webgame/game/index.html",
        "expected": "34576da2c5229bafc6516358b712fbfc4938d155261d3adeb5ed1540f676b3f1",
    },
}


def sha(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def run(ssh: paramiko.SSHClient, command: str, timeout: int = 180) -> str:
    _, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError(err[-6000:] or out[-6000:] or f"remote exit={code}")
    return out


def main() -> None:
    target_hashes = {name: sha(spec["local"]) for name, spec in FILES.items()}
    password = getpass.getpass("Production password (not logged): ")
    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False,
                allow_agent=False, timeout=20, banner_timeout=20, auth_timeout=20)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup = f"/linhhoasu/_ai_workbench/backups/login_tw_full_visual_pre_{stamp}"
    stage = f"/linhhoasu/_ai_workbench/temp/login_tw_full_visual_{stamp}"
    swapped = []
    try:
        for name, spec in FILES.items():
            live_hash = run(ssh, f"sha256sum -- {shlex.quote(spec['remote'])}").split()[0]
            if live_hash != spec["expected"]:
                raise RuntimeError(f"hash precondition failed {name}: {live_hash}")
        run(ssh, f"mkdir -p -- {shlex.quote(backup)} {shlex.quote(stage)}")
        for name, spec in FILES.items():
            run(ssh, f"cp -a -- {shlex.quote(spec['remote'])} {shlex.quote(backup + '/' + name)}")
        sftp = ssh.open_sftp()
        try:
            for name, spec in FILES.items():
                sftp.put(str(spec["local"]), f"{stage}/{name}")
        finally:
            sftp.close()
        run(ssh, f"node --check {shlex.quote(stage + '/start.min_52ac8d58.js')} && node --check {shlex.quote(stage + '/main.min_a6195824.js')} && test -s {shlex.quote(stage + '/index.html')}")
        for name, spec in FILES.items():
            staged_hash = run(ssh, f"sha256sum -- {shlex.quote(stage + '/' + name)}").split()[0]
            if staged_hash != target_hashes[name]:
                raise RuntimeError(f"stage hash mismatch {name}: {staged_hash}")
            run(ssh, f"install -o root -g root -m 0644 -- {shlex.quote(stage + '/' + name)} {shlex.quote(spec['remote'])}")
            swapped.append(name)
        for name, spec in FILES.items():
            final_hash = run(ssh, f"sha256sum -- {shlex.quote(spec['remote'])}").split()[0]
            if final_hash != target_hashes[name]:
                raise RuntimeError(f"deploy hash mismatch {name}: {final_hash}")
        contract = run(ssh, "node - <<'NODE'\nconst fs=require('fs');const start=fs.readFileSync('/linhhoasu/webgame/game/js/start.min_52ac8d58.js','utf8');const main=fs.readFileSync('/linhhoasu/webgame/game/js/main.min_a6195824.js','utf8');const index=fs.readFileSync('/linhhoasu/webgame/game/index.html','utf8');const out={forceTw:(start.match(/r=\"login_bg_tw\"/g)||[]).length,oldRegionMap:(start.match(/d\.inChina\?\"login_bg/g)||[]).length,visualTw:(main.match(/loadingBGImg\.visible=!0/g)||[]).length,visualChinaConditional:(main.match(/AppInfo\.inChina\?\(this\.loadingBGImg/g)||[]).length,token:(index.match(/20260902_login_tw_full_visual_v2/g)||[]).length};console.log(JSON.stringify(out));if(out.forceTw!==1||out.oldRegionMap!==0||out.visualChinaConditional!==0||out.token!==2)process.exit(2);\nNODE").strip()
        http = run(ssh, "printf 'index='; curl -sS -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:81/; printf ' start='; curl -sS -o /dev/null -w '%{http_code}' --max-time 10 'http://127.0.0.1:81/js/start.min_52ac8d58.js?v=20260902_login_tw_full_visual_v2'; printf ' main='; curl -sS -o /dev/null -w '%{http_code}' --max-time 10 'http://127.0.0.1:81/js/main.min_a6195824.js?v=20260902_login_tw_full_visual_v2'; printf ' tw='; curl -sS -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:81/update/resource/assets/game_start/login_bg_tw_8d2e3139.jpg; printf ' ready='; curl -sS -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:8080/ready; echo").strip()
    except Exception:
        for name in reversed(swapped):
            try:
                run(ssh, f"cp -a -- {shlex.quote(backup + '/' + name)} {shlex.quote(FILES[name]['remote'])}")
            except Exception:
                pass
        raise
    finally:
        ssh.close()
    print(json.dumps({"result": "PASS", "backup": backup, "hashes": target_hashes,
                      "contract": json.loads(contract), "http": http, "restart": []}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
