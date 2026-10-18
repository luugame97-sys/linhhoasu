"""Read-only production verification for case-insensitive account login."""
from __future__ import annotations

import getpass
import hashlib
import json
from pathlib import Path

import paramiko

HOST = "103.116.105.154"
ROOT = Path(__file__).resolve().parents[1]
CANDIDATE = ROOT / "temp" / "account_case_insensitive_candidate_20260901" / "src" / "handlers"
FILES = {
    "account.js": "/linhhoasu/lhs/newServer/src/handlers/account.js",
    "serverList.js": "/linhhoasu/lhs/newServer/src/handlers/serverList.js",
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(ssh: paramiko.SSHClient, command: str, timeout: int = 120) -> str:
    _, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    output = stdout.read().decode("utf-8", "replace")
    error = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError(error[-4000:] or output[-4000:] or f"remote exit={code}")
    return output


def main() -> None:
    password = getpass.getpass("Production password (not logged): ")
    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False,
                allow_agent=False, timeout=20, banner_timeout=20, auth_timeout=20)
    try:
        remote_hashes = {}
        for name, remote_path in FILES.items():
            remote_hashes[name] = run(ssh, f"sha256sum -- {remote_path}").split()[0]

        marker_cmd = (
            "grep -n -E 'canonicalPlatformAccount|canonicalSessionAccount|"
            "Account IDs are case-insensitive|accountService.normalizeAccountId' "
            "/linhhoasu/lhs/newServer/src/handlers/account.js "
            "/linhhoasu/lhs/newServer/src/handlers/serverList.js || true"
        )
        markers = run(ssh, marker_cmd).splitlines()
        syntax = run(
            ssh,
            "cd /linhhoasu/lhs/newServer && "
            "node --check src/handlers/account.js && "
            "node --check src/handlers/serverList.js && echo SYNTAX_OK",
        ).strip().splitlines()
        normalize = run(
            ssh,
            "cd /linhhoasu/lhs/newServer && node - <<'NODE'\n"
            "const a=require('./src/services/AccountService');\n"
            "console.log(JSON.stringify({samples:['Ohokaka12321','oHokaka12321','OHOKAKA12321'].map(input=>({input,normalized:a.normalizeAccountId(input)}))}));\n"
            "NODE",
        )
        pm2_raw = run(
            ssh,
            "pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{const p=JSON.parse(s).find(x=>x.name===\"lhs-s1001\");console.log(JSON.stringify({pid:p&&p.pid,status:p&&p.pm2_env&&p.pm2_env.status,restarts:p&&p.pm2_env&&p.pm2_env.restart_time,uptime:p&&p.pm2_env&&p.pm2_env.pm_uptime}))})'",
        ).strip()
        health = run(
            ssh,
            "printf 'ready='; curl -sS -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:8080/ready || true; "
            "printf ' ws='; curl -sS -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:9200/health || true; echo",
        ).strip()
    finally:
        ssh.close()

    local_hashes = {name: sha256(CANDIDATE / name) for name in FILES}
    data = {
        "host": HOST,
        "readOnly": True,
        "candidateHashes": local_hashes,
        "productionHashes": remote_hashes,
        "hashMatch": {name: local_hashes[name] == remote_hashes[name] for name in FILES},
        "markers": markers,
        "syntax": syntax,
        "normalize": normalize,
        "pm2": pm2_raw,
        "health": health,
    }
    out = ROOT / "temp" / "account_case_insensitive_prod_verify_20260901.json"
    out.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(data, ensure_ascii=False, indent=2))
    print(f"OUT={out}")


if __name__ == "__main__":
    main()
