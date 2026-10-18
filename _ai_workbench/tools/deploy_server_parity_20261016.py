from __future__ import annotations

import hashlib
import json
import shlex
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from skin_incident_remote import connect  # noqa: E402


ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "_ai_workbench" / "temp" / "server_parity_20261016"
REMOTE = {
    "server_config": "/linhhoasu/lhs/newServer/src/config/dropLevel100.js",
    "ecosystem": "/linhhoasu/lhs/newServer/ecosystem.config.js",
    "client": "/linhhoasu/webgame/game/js/main.min_drop200.js",
    "index": "/linhhoasu/webgame/game/index.html",
}
INDEX_OLD = b"js/main.min_drop200.js?v=20261013_artifact_ui_guard_v1"
INDEX_NEW = b"js/main.min_drop200.js?v=20261016_server_parity_v1"
SERVER_CONFIG_OLD = (
    b"    || [1001, 1002, 1003, 1004, 1005, 1006, 1007].includes(sid);"
)
SERVER_CONFIG_NEW = (
    b"    // New server instances use the same shared config catalog. Do not make\n"
    b"    // each launch wait for a source-code allowlist update before receiving\n"
    b"    // the current drop extension.\n"
    b"    || Number.isSafeInteger(sid) && sid >= 1001;"
)
CLIENT_OLD = b"if ([1001,1002,1003,1004,1005,1006,1007].indexOf(Number(serverId)) < 0) return;"
CLIENT_NEW = (
    b"var numericServerId=Number(serverId);\n"
    b"if (!Number.isSafeInteger(numericServerId) || numericServerId < 1001) return;"
)
PARITY_MARKER = b"// SERVER_PARITY_RELEASE_20261016_V1"
PARITY_BLOCK = (
    b"// SERVER_PARITY_RELEASE_20261016_V1\n"
    b"// Apply the current equipment-drop release after every S<N> template is\n"
    b"// created, so PM2 restart/resurrect cannot silently drop the feature flag.\n"
    b"for (const app of module.exports.apps.filter(app => app.script === 'src/app.js' && /^lhs-s\\d+$/.test(app.name))) {\n"
    b"  app.env.DROP_LEVEL_100_ENABLED = '1';\n"
    b"}\n"
)
PORTS = {
    "lhs-s1001": 8080,
    "lhs-s1002": 8083,
    "lhs-s1003": 8084,
    "lhs-s1004": 8085,
    "lhs-s1005": 8086,
    "lhs-s1006": 8087,
    "lhs-s1007": 8088,
    "lhs-s1008": 8089,
    "lhs-s1009": 8090,
}


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def replace_once(data: bytes, old: bytes, new: bytes) -> bytes:
    count = data.count(old)
    if count == 1:
        return data.replace(old, new)
    crlf_old = old.replace(b"\n", b"\r\n")
    crlf_new = new.replace(b"\n", b"\r\n")
    if data.count(crlf_old) == 1:
        return data.replace(crlf_old, crlf_new)
    if count == 0 and data.count(new) == 1:
        return data
    raise RuntimeError(f"CAS_MARKER_COUNT:{count}:{old[:80]!r}")


def main() -> None:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup = f"/linhhoasu/_ai_workbench/backups/server_parity_{stamp}"
    report: dict = {
        "result": "STARTED",
        "readOnlyBeforeMutation": True,
        "productionWrites": 0,
        "playerWrites": 0,
        "backup": backup,
        "paths": {},
        "restarts": [],
    }
    ssh = connect()
    sftp = ssh.open_sftp()
    swapped: list[tuple[str, str]] = []

    def run(command: str, check: bool = True) -> str:
        _, stdout, stderr = ssh.exec_command(command, timeout=90)
        out = stdout.read().decode("utf-8", "replace")
        err = stderr.read().decode("utf-8", "replace")
        code = stdout.channel.recv_exit_status()
        if check and code:
            raise RuntimeError(f"REMOTE_FAILED:{code}:{err[-1500:]}{out[-1500:]}")
        return out.strip()

    def write_stage(path: str, data: bytes) -> str:
        # Keep a .js suffix so Node's syntax checker treats staged source as
        # JavaScript instead of rejecting an otherwise valid temporary file.
        stage = f"{path}.server_parity_{stamp}.js"
        with sftp.open(stage, "wb") as handle:
            handle.write(data)
        run(f"chmod 644 {shlex.quote(stage)}")
        return stage

    try:
        before: dict[str, bytes] = {}
        candidate: dict[str, bytes] = {}
        for key, path in REMOTE.items():
            with sftp.open(path, "rb") as handle:
                before[key] = handle.read()
            report["paths"][key] = {"path": path, "beforeSha256": sha(before[key]), "beforeBytes": len(before[key])}

        candidate["server_config"] = replace_once(before["server_config"], SERVER_CONFIG_OLD, SERVER_CONFIG_NEW)
        candidate["client"] = replace_once(before["client"], CLIENT_OLD, CLIENT_NEW)
        candidate["ecosystem"] = (
            before["ecosystem"]
            if PARITY_MARKER in before["ecosystem"]
            else before["ecosystem"]
            + (b"\r\n" if b"\r\n" in before["ecosystem"] else b"\n")
            + PARITY_BLOCK.replace(b"\n", b"\r\n")
            if b"\r\n" in before["ecosystem"]
            else before["ecosystem"] + b"\n" + PARITY_BLOCK
        )
        candidate["index"] = replace_once(before["index"], INDEX_OLD, INDEX_NEW)

        for key, data in candidate.items():
            report["paths"][key]["candidateSha256"] = sha(data)
            report["paths"][key]["candidateBytes"] = len(data)

        run(f"install -d -m 700 {shlex.quote(backup)}")
        for key, path in REMOTE.items():
            run(f"cp -p -- {shlex.quote(path)} {shlex.quote(backup + '/' + Path(path).name)}")
        report["backupFiles"] = sorted(str(Path(path).name) for path in REMOTE.values())

        # Syntax-check the two executable candidates before swapping them.
        stage_server = write_stage(REMOTE["server_config"], candidate["server_config"])
        stage_eco = write_stage(REMOTE["ecosystem"], candidate["ecosystem"])
        run(f"node --check {shlex.quote(stage_server)}")
        run(f"node --check {shlex.quote(stage_eco)}")

        for key in ("server_config", "ecosystem", "client", "index"):
            path = REMOTE[key]
            with sftp.open(path, "rb") as handle:
                if sha(handle.read()) != report["paths"][key]["beforeSha256"]:
                    raise RuntimeError(f"CAS_CHANGED_BEFORE_SWAP:{key}")
            stage = write_stage(path, candidate[key])
            run(f"mv -f -- {shlex.quote(stage)} {shlex.quote(path)}")
            swapped.append((key, path))

        # Read-back all files after atomic swaps.
        for key, path in REMOTE.items():
            with sftp.open(path, "rb") as handle:
                live = handle.read()
            report["paths"][key]["afterSha256"] = sha(live)
            report["paths"][key]["afterBytes"] = len(live)
            if live != candidate[key]:
                raise RuntimeError(f"READBACK_HASH_MISMATCH:{key}")
        report["indexHttp"] = run("curl -fsS -o /dev/null -w '%{http_code}' --max-time 8 http://127.0.0.1:81/index.html")
        report["clientHttp"] = run("curl -fsS -o /dev/null -w '%{http_code}' --max-time 8 http://127.0.0.1:81/js/main.min_drop200.js")
        if report["indexHttp"] != "200" or report["clientHttp"] != "200":
            raise RuntimeError("STATIC_HTTP_VERIFY_FAILED")

        # Reload one game process at a time. S5 is intentionally not present in
        # the ecosystem file, so PM2 keeps its existing durable definition.
        for name, port in PORTS.items():
            if name == "lhs-s1005":
                command = f"pm2 restart {shlex.quote(name)} --update-env"
            else:
                command = (
                    f"cd /linhhoasu/lhs/newServer && pm2 startOrRestart ecosystem.config.js "
                    f"--only {shlex.quote(name)} --update-env"
                )
            run(command)
            ready = run(
                f"for i in $(seq 1 30); do code=$(curl -sS -o /dev/null -w '%{{http_code}}' --max-time 2 http://127.0.0.1:{port}/ready || true); "
                f"if [ \"$code\" = \"200\" ]; then echo 200; exit 0; fi; sleep 1; done; echo $code; exit 1"
            )
            report["restarts"].append({"name": name, "port": port, "ready": ready})
        run("pm2 save")

        pm2 = run(
            "pm2 jlist | node -e "
            + shlex.quote(
                "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const a=JSON.parse(s).filter(p=>/^lhs-s\\d+$/.test(p.name)).map(p=>({name:p.name,pid:p.pid,status:p.pm2_env.status,serverId:(p.pm2_env.env||{}).SERVER_ID,drop100:(p.pm2_env.env||{}).DROP_LEVEL_100_ENABLED}));console.log(JSON.stringify(a))});"
            )
        )
        report["pm2"] = json.loads(pm2)
        report["result"] = "DEPLOYED_AND_RESTARTED"
    except Exception as exc:
        report["result"] = "FAILED"
        report["error"] = str(exc)
        try:
            for key, path in reversed(swapped):
                backup_path = backup + "/" + Path(path).name
                run(f"cp -p -- {shlex.quote(backup_path)} {shlex.quote(path)}")
            if swapped:
                for name, port in PORTS.items():
                    run(f"pm2 restart {shlex.quote(name)} --update-env", check=False)
        except Exception as rollback_error:
            report["rollbackError"] = str(rollback_error)
        raise
    finally:
        OUT.mkdir(parents=True, exist_ok=True)
        (OUT / "deployment.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        try:
            run(f"rm -f -- {shlex.quote(REMOTE['server_config'] + '.server_parity_' + stamp + '.js')}", check=False)
            run(f"rm -f -- {shlex.quote(REMOTE['ecosystem'] + '.server_parity_' + stamp + '.js')}", check=False)
            run(f"rm -f -- {shlex.quote(REMOTE['client'] + '.server_parity_' + stamp + '.js')}", check=False)
            run(f"rm -f -- {shlex.quote(REMOTE['index'] + '.server_parity_' + stamp + '.js')}", check=False)
        finally:
            sftp.close()
            ssh.close()
        print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
