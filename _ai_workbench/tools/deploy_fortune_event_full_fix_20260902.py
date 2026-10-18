"""Deploy the complete Kim Ma Chuc Phuc event repair to production.

Safety gates:
- exact SHA-256 preconditions from the live snapshot;
- local syntax + isolated contracts before connecting;
- remote staging, source backup and QA-player snapshot;
- only lhs-s1001 is restarted;
- automatic source rollback if any post-swap gate fails.
"""
from __future__ import annotations

import getpass
import hashlib
import json
import os
import shlex
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

import paramiko


HOST = "103.116.105.154"
ROOT = Path(__file__).resolve().parents[1]
APP = "/linhhoasu/lhs/newServer"
CANDIDATE = ROOT / "temp" / "fortune_event_full_candidate_20260902" / "app"
CONFIG_BIN = ROOT.parent / "linhhoasu" / "lhs" / "update" / "resource" / "assets" / "excel" / "config_e5ac72c2.bin"

FILES = {
    "src/handlers/activity.js": "d4d01c76bad282f7baa0cf98f207c3fcf1e42aa80c5de01762c64e9a30a859f6",
    "src/handlers/item.js": "6176b6ea089ee5b3609318edf24d81ee4906dc86c62d99063477d4481a89c922",
    "src/handlers/playerPayload.js": "adce362a575fb7c56bc293ea69f8c7d79c215fb8e7045b518bfadb03b1205b5a",
    "src/handlers/box.js": "36535ee11c9a9e088dcc93bf9b536031d9e71256c9afb5dab8809361a35c04e8",
    "src/handlers/raid.js": "d34d14dc0096f9b2f966077c7c6812a6c067ff469b3981e578eb0e44b05db0cf",
    "src/services/MainTaskProgressService.js": "6f3b7ef1d759115d1c271a055ec27fe40d788768578be9b945ca56cfac66f97c",
    "src/services/PlayerService.js": "88a80a941ae020db970a2c5de38493ae1050a43c5ce0dbe2b2aa65603b6666fc",
}

TESTS = {
    "test_fortune_daily_limit.js": ROOT / "tools" / "test_fortune_daily_limit.js",
    "test_fortune_event_full.js": ROOT / "tools" / "test_fortune_event_full.js",
    "test_fortune_player_consumption_tracking.js": ROOT / "tools" / "test_fortune_player_consumption_tracking.js",
    "test_fortune_event_real_config.js": ROOT / "tools" / "test_fortune_event_real_config.js",
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run_local(args: list[str], cwd: Path | None = None, env: dict[str, str] | None = None, timeout: int = 240) -> str:
    result = subprocess.run(
        args,
        cwd=str(cwd or ROOT.parent),
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout,
    )
    if result.returncode:
        raise RuntimeError((result.stdout + "\n" + result.stderr)[-12000:])
    return result.stdout + result.stderr


def run_remote(ssh: paramiko.SSHClient, command: str, timeout: int = 240) -> str:
    _, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    output = stdout.read().decode("utf-8", "replace")
    error = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError(error[-12000:] or output[-12000:] or f"remote exit={code}")
    return output


def pm2_snapshot(ssh: paramiko.SSHClient) -> dict[str, dict]:
    output = run_remote(
        ssh,
        "pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{for(const p of JSON.parse(s)){if([\"lhs-s1001\",\"lhs-real-bots\",\"lhs-dist\",\"lhs-admin\"].includes(p.name)){const e=p.pm2_env||{};console.log(JSON.stringify({name:p.name,pid:p.pid,status:e.status,restarts:e.restart_time,uptime:e.pm_uptime,cwd:e.pm_cwd,script:e.pm_exec_path}))}}})'",
    )
    rows = [json.loads(line) for line in output.splitlines() if line.strip().startswith("{")]
    return {row["name"]: row for row in rows}


def parse_hashes(output: str) -> dict[str, str]:
    result = {}
    for line in output.splitlines():
        parts = line.split()
        if len(parts) >= 2:
            result[parts[-1].replace(f"{APP}/", "")] = parts[0].lower()
    return result


def wait_health(ssh: paramiko.SSHClient) -> str:
    last = ""
    for _ in range(45):
        try:
            last = run_remote(
                ssh,
                "curl -sS --max-time 4 -w '\\nREADY_HTTP=%{http_code}\\n' http://127.0.0.1:8080/ready; curl -sS --max-time 4 -w '\\nHEALTH_HTTP=%{http_code}\\n' http://127.0.0.1:9200/health",
                timeout=15,
            )
            if "READY_HTTP=200" in last and "HEALTH_HTTP=200" in last and '"mongo":true' in last and '"redis":true' in last:
                return last
        except Exception as error:
            last = str(error)
        time.sleep(1)
    raise RuntimeError("health gate failed: " + last[-4000:])


def local_preflight() -> dict[str, object]:
    for rel in FILES:
        path = CANDIDATE / rel
        if not path.is_file():
            raise FileNotFoundError(path)
        run_local(["node", "--check", str(path)])
    for path in TESTS.values():
        if not path.is_file():
            raise FileNotFoundError(path)

    env = os.environ.copy()
    env["FORTUNE_APP_ROOT"] = str(CANDIDATE)
    env["NODE_PATH"] = str((ROOT.parent / "linhhoasu" / "lhs" / "newServer" / "node_modules").resolve())
    env["CONFIG_BIN_PATH"] = str(CONFIG_BIN.resolve())
    outputs = {}
    for name, path in TESTS.items():
        outputs[name] = run_local(["node", str(path)], env=env)
        if '"result":"PASS"' not in outputs[name].replace(" ", ""):
            raise RuntimeError(f"local contract did not report PASS: {name}")
    core = run_local(["node", "scripts/test-core-gameplay-contract.js"], cwd=CANDIDATE, env=env)
    if '"result":"ok"' not in core.replace(" ", "") or '"tables":714' not in core.replace(" ", ""):
        raise RuntimeError("local core contract did not report 714-table PASS")
    return {
        "hashes": {rel: sha256(CANDIDATE / rel) for rel in FILES},
        "contracts": {name: output[-2500:] for name, output in outputs.items()},
        "core": core[-2500:],
    }


def main() -> None:
    local = local_preflight()
    password = os.environ.get("LHS_PROD_PASSWORD") or getpass.getpass("Production password (not logged): ")
    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False, allow_agent=False, timeout=20, banner_timeout=20, auth_timeout=20)

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup = f"/linhhoasu/_ai_workbench/backups/fortune_event_full_fix_pre_{stamp}"
    stage = f"/linhhoasu/_ai_workbench/temp/fortune_event_full_fix_{stamp}"
    evidence: dict[str, object] = {
        "host": HOST,
        "startedAt": datetime.now(timezone.utc).isoformat(),
        "backup": backup,
        "stage": stage,
        "local": local,
    }
    before_pm2: dict[str, dict] = {}
    stopped = False
    swapped = False
    try:
        live_paths = [f"{APP}/{rel}" for rel in FILES]
        live_hash_output = run_remote(ssh, "sha256sum " + " ".join(shlex.quote(path) for path in live_paths))
        live_hashes = parse_hashes(live_hash_output)
        evidence["preHashes"] = live_hashes
        if any(live_hashes.get(rel) != expected for rel, expected in FILES.items()):
            raise RuntimeError("live source changed since audited snapshot")

        before_pm2 = pm2_snapshot(ssh)
        evidence["pm2Before"] = before_pm2
        if before_pm2.get("lhs-s1001", {}).get("status") != "online":
            raise RuntimeError("lhs-s1001 is not online before deploy")

        dirs = {rel.rsplit("/", 1)[0] for rel in FILES}
        mkdir_parts = [shlex.quote(backup), shlex.quote(stage)]
        mkdir_parts += [shlex.quote(f"{backup}/{directory}") for directory in dirs]
        mkdir_parts += [shlex.quote(f"{stage}/{directory}") for directory in dirs]
        run_remote(ssh, "mkdir -p " + " ".join(mkdir_parts))
        for rel in FILES:
            run_remote(ssh, f"cp -a -- {shlex.quote(f'{APP}/{rel}')} {shlex.quote(f'{backup}/{rel}')}")
        run_remote(ssh, f"pm2 jlist > {shlex.quote(backup + '/pm2-before.json')}")

        # Full QA-player document, no password/account credential fields.
        player_backup_js = r'''try{require('/linhhoasu/lhs/newServer/node_modules/dotenv').config({path:'/linhhoasu/lhs/newServer/.env'})}catch(_){}const mongoose=require('/linhhoasu/lhs/newServer/node_modules/mongoose');const Account=require('/linhhoasu/lhs/newServer/src/db/models/Account');const Player=require('/linhhoasu/lhs/newServer/src/db/models/Player');const fs=require('fs');(async()=>{await mongoose.connect(process.env.MONGO_URI||'mongodb://127.0.0.1:27017/lhs_s1001',{serverSelectionTimeoutMS:7000});const a=await Account.findOne({accountId:'vanduc97'}).select({roles:1}).lean();const ids=(a&&Array.isArray(a.roles)?a.roles:[]).map(r=>String(r&&r.userId||'')).filter(Boolean);const docs=await Player.find({userId:{$in:ids}}).lean();fs.writeFileSync(process.argv[1],JSON.stringify({accountId:'vanduc97',players:docs},null,2));console.log(JSON.stringify({players:docs.length}));await mongoose.disconnect()})().catch(async e=>{console.error(e.stack||String(e));try{await mongoose.disconnect()}catch(_){}process.exit(1)});'''
        encoded = __import__("base64").b64encode(player_backup_js.encode()).decode()
        qa_backup = run_remote(
            ssh,
            f"cd {shlex.quote(APP)} && node -e \"eval(Buffer.from('{encoded}','base64').toString('utf8'))\" {shlex.quote(backup + '/vanduc97-player-before.json')}",
        )
        evidence["qaPlayerBackup"] = qa_backup.strip()

        sftp = ssh.open_sftp()
        try:
            for rel in FILES:
                sftp.put(str(CANDIDATE / rel), f"{stage}/{rel}")
            for name, path in TESTS.items():
                sftp.put(str(path), f"{stage}/{name}")
        finally:
            sftp.close()

        run_remote(ssh, " && ".join(f"node --check {shlex.quote(f'{stage}/{rel}')}" for rel in FILES))
        stage_hashes = parse_hashes(run_remote(ssh, "sha256sum " + " ".join(shlex.quote(f"{stage}/{rel}") for rel in FILES)))
        # parse_hashes keeps the stage prefix; validate by basename-independent ordered output.
        stage_text = run_remote(ssh, "sha256sum " + " ".join(shlex.quote(f"{stage}/{rel}") for rel in FILES))
        for digest in local["hashes"].values():
            if digest not in stage_text:
                raise RuntimeError("staged candidate hash mismatch")

        log_sizes = json.loads(run_remote(
            ssh,
            "python3 - <<'PY'\nimport json,os\npaths=['/root/.pm2/logs/lhs-s1001-out.log','/root/.pm2/logs/lhs-s1001-error.log']\nprint(json.dumps({p:(os.path.getsize(p) if os.path.exists(p) else 0) for p in paths}))\nPY",
        ))
        evidence["logOffsets"] = log_sizes

        run_remote(ssh, "pm2 stop lhs-s1001")
        stopped = True
        second_hashes = parse_hashes(run_remote(ssh, "sha256sum " + " ".join(shlex.quote(path) for path in live_paths)))
        if second_hashes != live_hashes:
            raise RuntimeError("live source changed after preflight")
        for rel in FILES:
            run_remote(ssh, f"install -o root -g root -m 0644 -- {shlex.quote(f'{stage}/{rel}')} {shlex.quote(f'{APP}/{rel}')}")
        swapped = True

        deployed_hashes = parse_hashes(run_remote(ssh, "sha256sum " + " ".join(shlex.quote(path) for path in live_paths)))
        evidence["deployedHashes"] = deployed_hashes
        if any(deployed_hashes.get(rel) != digest for rel, digest in local["hashes"].items()):
            raise RuntimeError("deployed source hash mismatch")

        run_remote(ssh, "pm2 restart lhs-s1001 --update-env")
        stopped = False
        health = wait_health(ssh)
        evidence["health"] = health[-5000:]

        remote_env = f"NODE_PATH={shlex.quote(APP + '/node_modules')} FORTUNE_APP_ROOT={shlex.quote(APP)} CONFIG_BIN_PATH={shlex.quote('/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin')}"
        remote_contracts = {}
        for name in TESTS:
            output = run_remote(ssh, f"cd {shlex.quote(APP)} && {remote_env} node {shlex.quote(stage + '/' + name)}", timeout=240)
            if '"result":"PASS"' not in output.replace(" ", ""):
                raise RuntimeError(f"remote contract did not report PASS: {name}")
            remote_contracts[name] = output[-3500:]
        core = run_remote(ssh, f"cd {shlex.quote(APP)} && CONFIG_BIN_PATH=/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin node scripts/test-core-gameplay-contract.js", timeout=240)
        if '"result":"ok"' not in core.replace(" ", "") or '"tables":714' not in core.replace(" ", ""):
            raise RuntimeError("remote core contract failed")
        evidence["remoteContracts"] = remote_contracts
        evidence["remoteCore"] = core[-3500:]

        log_probe = run_remote(
            ssh,
            "python3 - <<'PY'\nimport json,os,re\no=" + json.dumps(log_sizes) + "\nrows=[]\nfor p,start in o.items():\n data=b''\n if os.path.exists(p):\n  with open(p,'rb') as f:f.seek(start);data=f.read()\n text=data.decode('utf-8','replace')\n bad=[line for line in text.splitlines() if re.search(r'SyntaxError|ReferenceError|TypeError|Unhandled|处理 tag=.*失败|getActiveDailyShopPolicy is not a function',line,re.I)]\n rows.append({'path':p,'newBytes':len(data),'errors':bad[-50:]})\nprint(json.dumps(rows,ensure_ascii=False))\nPY",
        )
        log_rows = json.loads(log_probe)
        evidence["newLogs"] = log_rows
        if any(row.get("errors") for row in log_rows):
            raise RuntimeError("new production errors detected after deploy")

        after_pm2 = pm2_snapshot(ssh)
        evidence["pm2After"] = after_pm2
        for name in ("lhs-dist", "lhs-admin", "lhs-real-bots"):
            if before_pm2.get(name, {}).get("pid") != after_pm2.get(name, {}).get("pid"):
                raise RuntimeError(f"unrelated process PID changed: {name}")
        if after_pm2.get("lhs-s1001", {}).get("status") != "online":
            raise RuntimeError("lhs-s1001 is not online after deploy")
        run_remote(ssh, "pm2 save")
        evidence["status"] = "PASS"
        evidence["finishedAt"] = datetime.now(timezone.utc).isoformat()
        evidence["rollback"] = "not used"
    except Exception as error:
        evidence["status"] = "FAILED"
        evidence["error"] = str(error)
        rollback_errors = []
        if swapped or stopped:
            try:
                if not stopped:
                    run_remote(ssh, "pm2 stop lhs-s1001")
                    stopped = True
                if swapped:
                    for rel in FILES:
                        run_remote(ssh, f"cp -a -- {shlex.quote(f'{backup}/{rel}')} {shlex.quote(f'{APP}/{rel}')}")
                run_remote(ssh, "pm2 restart lhs-s1001 --update-env")
                stopped = False
                evidence["rollbackHealth"] = wait_health(ssh)[-5000:]
            except Exception as rollback_error:
                rollback_errors.append(str(rollback_error))
        evidence["rollback"] = {"attempted": bool(swapped or stopped), "errors": rollback_errors}
    finally:
        ssh.close()

    out = ROOT / "temp" / f"fortune_event_full_deploy_{stamp}.json"
    out.write_text(json.dumps(evidence, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"status": evidence.get("status"), "evidence": str(out), "backup": backup, "hashes": evidence.get("deployedHashes"), "rollback": evidence.get("rollback")}, ensure_ascii=False, indent=2))
    if evidence.get("status") != "PASS":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
