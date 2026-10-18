"""Deploy native marquee API + WebGM controls with backup and rollback."""
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
CANDIDATE = ROOT / "temp" / "marquee_broadcast_candidate_20260901"

FILES = {
    "game/chat.js": {
        "local": CANDIDATE / "game" / "chat.js",
        "remote": "/linhhoasu/lhs/newServer/src/handlers/chat.js",
        "expected": "edd5fe8eedf1298cd059443b42ccbd5828452292810ad6fcbe89979408384984",
    },
    "game/HTTPServer.js": {
        "local": CANDIDATE / "game" / "HTTPServer.js",
        "remote": "/linhhoasu/lhs/newServer/src/net/HTTPServer.js",
        "expected": "cbefaa1dbdba23f80b63d8e1ae7ffc46b5056359c1a9cce306de909f1929d6ae",
    },
    "game/WSServer.js": {
        "local": CANDIDATE / "game" / "WSServer.js",
        "remote": "/linhhoasu/lhs/newServer/src/net/WSServer.js",
        "expected": "9c7e82f49fdbc13934b4262da00823bf7b9f91a5b64a7b70fd910c535269cc8f",
    },
    "webgm/config.php": {
        "local": CANDIDATE / "config.php",
        "remote": "/linhhoasu/webgame/gm/config.php",
        "expected": "14fd6fc65762065f3059833d9713b310011475e3125484e8536ff2b824614d22",
    },
    "webgm/admin/admin_api.php": {
        "local": CANDIDATE / "admin" / "admin_api.php",
        "remote": "/linhhoasu/webgame/gm/admin/admin_api.php",
        "expected": "f1e2846c53aa015b72013cf9a56ffac174494a91ccabc17b40bc39bd666676d6",
    },
    "webgm/admin/index.php": {
        "local": CANDIDATE / "admin" / "index.php",
        "remote": "/linhhoasu/webgame/gm/admin/index.php",
        "expected": "a95b170bb2c58d0c801c32a38ed67350913e05694700711daee909c9f5b70d42",
    },
    "webgm/assets/js/admin.js": {
        "local": CANDIDATE / "assets" / "js" / "admin.js",
        "remote": "/linhhoasu/webgame/gm/assets/js/admin.js",
        "expected": "ee399762e29789f1f7bab87e7f2166992b9dac5c54fc3e8815fca15cb50bdc29",
    },
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def run(ssh: paramiko.SSHClient, command: str, timeout: int = 180) -> str:
    _, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    output = stdout.read().decode("utf-8", "replace")
    error = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError(error[-6000:] or output[-6000:] or f"remote exit={code}")
    return output


def q(value: str) -> str:
    return shlex.quote(str(value))


def main() -> None:
    local_hashes = {key: sha256(value["local"]) for key, value in FILES.items()}
    password = getpass.getpass("Production password (not logged): ")
    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False,
                allow_agent=False, timeout=20, banner_timeout=20, auth_timeout=20)

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup = f"/linhhoasu/_ai_workbench/backups/marquee_broadcast_pre_{stamp}"
    stage = f"/linhhoasu/_ai_workbench/temp/marquee_broadcast_{stamp}"
    swapped: list[tuple[str, str]] = []
    try:
        for key, value in FILES.items():
            live_hash = run(ssh, f"sha256sum -- {q(value['remote'])}").split()[0]
            if live_hash != value["expected"]:
                raise RuntimeError(f"hash precondition failed {key}: {live_hash}")
            if local_hashes[key] == value["expected"]:
                raise RuntimeError(f"candidate unexpectedly equals production for {key}")

        run(ssh, f"mkdir -p -- {q(backup)} {q(stage + '/game')} {q(stage + '/webgm/admin')} {q(stage + '/webgm/assets/js')}")
        for key, value in FILES.items():
            backup_path = f"{backup}/{key}"
            run(ssh, f"mkdir -p -- {q(backup_path.rsplit('/', 1)[0])}")
            run(ssh, f"cp -a -- {q(value['remote'])} {q(backup_path)}")

        sftp = ssh.open_sftp()
        try:
            for key, value in FILES.items():
                staged = f"{stage}/{key}"
                sftp.put(str(value["local"]), staged)
        finally:
            sftp.close()

        run(
            ssh,
            f"cd /linhhoasu/lhs/newServer && node --check {q(stage + '/game/chat.js')} && "
            f"node --check {q(stage + '/game/HTTPServer.js')} && node --check {q(stage + '/game/WSServer.js')} && "
            f"node -e \"require('./src/handlers/chat');require('./src/net/HTTPServer');require('./src/net/WSServer');console.log('REQUIRE_OK')\"",
        )
        run(ssh, f"php -l {q(stage + '/webgm/config.php')} >/dev/null && php -l {q(stage + '/webgm/admin/admin_api.php')} >/dev/null && php -l {q(stage + '/webgm/admin/index.php')} >/dev/null")
        for key, value in FILES.items():
            staged = f"{stage}/{key}"
            staged_hash = run(ssh, f"sha256sum -- {q(staged)}").split()[0]
            if staged_hash != local_hashes[key]:
                raise RuntimeError(f"stage hash mismatch {key}: {staged_hash}")
            run(ssh, f"install -o root -g root -m 0644 -- {q(staged)} {q(value['remote'])}")
            swapped.append((key, value["remote"]))
            deployed_hash = run(ssh, f"sha256sum -- {q(value['remote'])}").split()[0]
            if deployed_hash != local_hashes[key]:
                raise RuntimeError(f"deploy hash mismatch {key}: {deployed_hash}")

        require_live = run(
            ssh,
            "cd /linhhoasu/lhs/newServer && node -e "
            "\"require('./src/handlers/chat');require('./src/net/HTTPServer');require('./src/net/WSServer');console.log('LIVE_REQUIRE_OK')\"",
        ).strip()
        run(ssh, "pm2 restart lhs-s1001 --update-env >/dev/null && pm2 save >/dev/null", 240)
        health = run(
            ssh,
            "for i in $(seq 1 40); do h=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:8080/ready || true); "
            "w=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:9200/health || true); "
            "[ \"$h|$w\" = \"200|200\" ] && { echo \"http=$h ws=$w\"; exit 0; }; sleep 1; done; exit 1",
            240,
        ).strip()
        webgm_http = run(
            ssh,
            "printf 'admin='; curl -sS -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:88/admin/index.php; "
            "printf ' js='; curl -sS -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:88/assets/js/admin.js; echo",
        ).strip()
        pm2 = run(
            ssh,
            "pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{const a=JSON.parse(s).filter(x=>[\"lhs-s1001\",\"lhs-dist\",\"lhs-admin\",\"lhs-real-bots\"].includes(x.name)).map(x=>({name:x.name,pid:x.pid,status:x.pm2_env&&x.pm2_env.status,restarts:x.pm2_env&&x.pm2_env.restart_time}));console.log(JSON.stringify(a))})'",
        ).strip()
        # Validate the new authenticated route without sending a visible message.
        route_test = run(
            ssh,
            "cd /linhhoasu/lhs/newServer && node - <<'NODE'\n"
            "require('./node_modules/dotenv').config({path:'./.env'});\n"
            "const crypto=require('crypto');const {signInternalRequest}=require('./src/utils/internalAuth');\n"
            "(async()=>{const path='/api/internal/broadcast/marquee';const body={text:''};const timestamp=Date.now();const nonce=crypto.randomBytes(12).toString('hex');const key=String(process.env.API_KEY||'');const signature=signInternalRequest({secret:key,method:'POST',path,timestamp,nonce,body});const r=await fetch('http://127.0.0.1:8080'+path,{method:'POST',headers:{'Content-Type':'application/json','X-API-Key':key,'X-Timestamp':String(timestamp),'X-Nonce':nonce,'X-Signature':signature},body:JSON.stringify(body)});console.log(JSON.stringify({status:r.status,body:await r.json()}));})().catch(e=>{console.error(e.stack||String(e));process.exit(1)});\n"
            "NODE",
        ).strip()
    except Exception:
        for key, remote in swapped:
            backup_path = f"{backup}/{key}"
            try:
                run(ssh, f"cp -a -- {q(backup_path)} {q(remote)}")
            except Exception:
                pass
        if swapped:
            try:
                run(ssh, "pm2 restart lhs-s1001 --update-env >/dev/null", 240)
            except Exception:
                pass
        raise
    finally:
        ssh.close()

    result = {
        "result": "PASS",
        "host": HOST,
        "backup": backup,
        "stage": stage,
        "candidateHashes": local_hashes,
        "restart": ["lhs-s1001"],
        "require": require_live,
        "health": health,
        "webgm": webgm_http,
        "pm2": json.loads(pm2),
        "routeValidation": route_test,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
