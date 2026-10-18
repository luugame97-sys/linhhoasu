"""Rollback both TW login visual changes to the exact pre-swap baseline."""
from __future__ import annotations

import getpass
import json
import shlex
from datetime import datetime, timezone

import paramiko

HOST = "103.116.105.154"
BASE_BACKUP = "/linhhoasu/_ai_workbench/backups/login_tw_swap_pre_20260901_171314"
FILES = {
    "start.min_52ac8d58.js": {
        "remote": "/linhhoasu/webgame/game/js/start.min_52ac8d58.js",
        "backup": f"{BASE_BACKUP}/start.min_52ac8d58.js",
        "current": "0dbcad104e31373d6c8536c9a2bbfd0a196dce88824226fda22e58c0ec4aacb1",
        "baseline": "e822365fca7b7380e60c0c80025d8efaeb798b19543067a609d0117a25ec9e24",
    },
    "main.min_a6195824.js": {
        "remote": "/linhhoasu/webgame/game/js/main.min_a6195824.js",
        # First swap did not change main; its backup is available in the full-visual backup.
        "backup": "/linhhoasu/_ai_workbench/backups/login_tw_full_visual_pre_20260901_171906/main.min_a6195824.js",
        "current": "99b420c57a2271b2ebba7c05fe9c92e8963bfde4600b01acb9852c58dcc18c1e",
        "baseline": "0a83139204f9635db61b166907355e0ecff971569693d0e1a7fe438591b0dfe1",
    },
    "index.html": {
        "remote": "/linhhoasu/webgame/game/index.html",
        "backup": f"{BASE_BACKUP}/index.html",
        "current": "a972d8124c57f824812b10322adfa7e4fdbb133ca44987b7e54b22d5d0ddd7dc",
        "baseline": "f6e4751eb14385ccdc0d5f6e2e2b4a8b1fcd65b715a94b1ad751119c5ff7bc7b",
    },
}


def run(ssh: paramiko.SSHClient, command: str, timeout: int = 180) -> str:
    _, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError(err[-6000:] or out[-6000:] or f"remote exit={code}")
    return out


def main() -> None:
    password = getpass.getpass("Production password (not logged): ")
    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False,
                allow_agent=False, timeout=20, banner_timeout=20, auth_timeout=20)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    rollback_backup = f"/linhhoasu/_ai_workbench/backups/login_tw_rollback_before_{stamp}"
    stage = f"/linhhoasu/_ai_workbench/temp/login_tw_rollback_{stamp}"
    swapped = []
    try:
        run(ssh, f"mkdir -p -- {shlex.quote(rollback_backup)} {shlex.quote(stage)}")
        for name, spec in FILES.items():
            live = run(ssh, f"sha256sum -- {shlex.quote(spec['remote'])}").split()[0]
            source = run(ssh, f"sha256sum -- {shlex.quote(spec['backup'])}").split()[0]
            if live != spec["current"]:
                raise RuntimeError(f"live hash precondition failed {name}: {live}")
            if source != spec["baseline"]:
                raise RuntimeError(f"backup hash mismatch {name}: {source}")
            run(ssh, f"cp -a -- {shlex.quote(spec['remote'])} {shlex.quote(rollback_backup + '/' + name)}")
            run(ssh, f"cp -a -- {shlex.quote(spec['backup'])} {shlex.quote(stage + '/' + name)}")
        run(ssh, f"node --check {shlex.quote(stage + '/start.min_52ac8d58.js')} && node --check {shlex.quote(stage + '/main.min_a6195824.js')} && test -s {shlex.quote(stage + '/index.html')}")
        for name, spec in FILES.items():
            run(ssh, f"install -o root -g root -m 0644 -- {shlex.quote(stage + '/' + name)} {shlex.quote(spec['remote'])}")
            swapped.append(name)
            final = run(ssh, f"sha256sum -- {shlex.quote(spec['remote'])}").split()[0]
            if final != spec["baseline"]:
                raise RuntimeError(f"rollback hash mismatch {name}: {final}")
        markers = run(ssh, "node - <<'NODE'\nconst fs=require('fs');const s=fs.readFileSync('/linhhoasu/webgame/game/js/start.min_52ac8d58.js','utf8');const m=fs.readFileSync('/linhhoasu/webgame/game/js/main.min_a6195824.js','utf8');const i=fs.readFileSync('/linhhoasu/webgame/game/index.html','utf8');console.log(JSON.stringify({oldMapping:(s.match(/r=d\.inChina\?\"login_bg\":\"login_bg_tw\"/g)||[]).length,forceTw:(s.match(/r=\"login_bg_tw\"/g)||[]).length,chinaVisual:(m.match(/AppInfo\.inChina\?\(this\.loadingBGImg/g)||[]).length,oldToken:(i.match(/20260831_tien_duyen_fix_v1/g)||[]).length,newToken:(i.match(/20260902_login_tw/g)||[]).length}));\nNODE").strip()
        http = run(ssh, "printf 'index='; curl -sS -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:81/; printf ' start='; curl -sS -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:81/js/start.min_52ac8d58.js; printf ' main='; curl -sS -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:81/js/main.min_a6195824.js; printf ' ready='; curl -sS -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:8080/ready; echo").strip()
    except Exception:
        for name in reversed(swapped):
            try:
                run(ssh, f"cp -a -- {shlex.quote(rollback_backup + '/' + name)} {shlex.quote(FILES[name]['remote'])}")
            except Exception:
                pass
        raise
    finally:
        ssh.close()
    print(json.dumps({"result": "PASS", "restored": list(FILES), "rollbackBackup": rollback_backup,
                      "markers": json.loads(markers), "http": http, "restart": []}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
