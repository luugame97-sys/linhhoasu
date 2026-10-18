"""Read-only verification that the marquee feature is fully removed."""
from __future__ import annotations

import getpass
import json
import shlex
from pathlib import Path

import paramiko

HOST = "103.116.105.154"
ROOT = Path(__file__).resolve().parents[1]
FILES = {
    "game/chat.js": ("/linhhoasu/lhs/newServer/src/handlers/chat.js", "edd5fe8eedf1298cd059443b42ccbd5828452292810ad6fcbe89979408384984"),
    "game/HTTPServer.js": ("/linhhoasu/lhs/newServer/src/net/HTTPServer.js", "cbefaa1dbdba23f80b63d8e1ae7ffc46b5056359c1a9cce306de909f1929d6ae"),
    "game/WSServer.js": ("/linhhoasu/lhs/newServer/src/net/WSServer.js", "9c7e82f49fdbc13934b4262da00823bf7b9f91a5b64a7b70fd910c535269cc8f"),
    "webgm/config.php": ("/linhhoasu/webgame/gm/config.php", "14fd6fc65762065f3059833d9713b310011475e3125484e8536ff2b824614d22"),
    "webgm/admin/admin_api.php": ("/linhhoasu/webgame/gm/admin/admin_api.php", "f1e2846c53aa015b72013cf9a56ffac174494a91ccabc17b40bc39bd666676d6"),
    "webgm/admin/index.php": ("/linhhoasu/webgame/gm/admin/index.php", "a95b170bb2c58d0c801c32a38ed67350913e05694700711daee909c9f5b70d42"),
    "webgm/assets/js/admin.js": ("/linhhoasu/webgame/gm/assets/js/admin.js", "ee399762e29789f1f7bab87e7f2166992b9dac5c54fc3e8815fca15cb50bdc29"),
}


def run(ssh: paramiko.SSHClient, command: str, timeout: int = 120) -> str:
    _, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError(err[-5000:] or out[-5000:] or f"remote exit={code}")
    return out


def main() -> None:
    password = getpass.getpass("Production password (not logged): ")
    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False,
                allow_agent=False, timeout=20, banner_timeout=20, auth_timeout=20)
    try:
        hashes = {}
        for key, (remote, expected) in FILES.items():
            actual = run(ssh, f"sha256sum -- {shlex.quote(remote)}").split()[0]
            hashes[key] = {"actual": actual, "expected": expected, "match": actual == expected}
        syntax = run(ssh, "cd /linhhoasu/lhs/newServer && node --check src/handlers/chat.js && node --check src/net/HTTPServer.js && node --check src/net/WSServer.js && echo SYNTAX_OK").strip()
        markers = run(ssh, "grep -aEi 'broadcast/marquee|MARQUEE_|buildMarqueeMarkup|_marqueeTimers|msgType: 16' /linhhoasu/lhs/newServer/src/handlers/chat.js /linhhoasu/lhs/newServer/src/net/HTTPServer.js /linhhoasu/lhs/newServer/src/net/WSServer.js /linhhoasu/webgame/gm/config.php /linhhoasu/webgame/gm/admin/admin_api.php /linhhoasu/webgame/gm/admin/index.php /linhhoasu/webgame/gm/assets/js/admin.js || true").strip()
        route = run(ssh, "curl -sS -o /tmp/lhs_marquee_rollback.json -w '%{http_code}' --max-time 8 -X POST -H 'Content-Type: application/json' -d '{\"text\":\"probe\"}' http://127.0.0.1:8080/api/internal/broadcast/marquee; printf '|'; tr -d '\\n' < /tmp/lhs_marquee_rollback.json; rm -f /tmp/lhs_marquee_rollback.json; echo").strip()
        health = run(ssh, "printf 'ready='; curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/ready; printf ' ws='; curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:9200/health; printf ' webgm='; curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:88/admin/index.php; echo").strip()
        pm2 = run(ssh, "pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{const n=[\"lhs-s1001\",\"lhs-dist\",\"lhs-admin\",\"lhs-real-bots\"];console.log(JSON.stringify(JSON.parse(s).filter(x=>n.includes(x.name)).map(x=>({name:x.name,pid:x.pid,status:x.pm2_env&&x.pm2_env.status,restarts:x.pm2_env&&x.pm2_env.restart_time}))))})'").strip()
    finally:
        ssh.close()
    data = {"host": HOST, "readOnly": True, "hashes": hashes, "syntax": syntax,
            "markers": markers, "route": route, "health": health, "pm2": json.loads(pm2)}
    out = ROOT / "temp" / "marquee_rollback_prod_verify_20260901.json"
    out.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(data, ensure_ascii=False, indent=2))
    print(f"OUT={out}")


if __name__ == "__main__":
    main()
