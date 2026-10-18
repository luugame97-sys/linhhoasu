"""Deploy usable-item/rương fixes with hash guard, rollback and post-restart gates."""

from __future__ import annotations

import hashlib
import json
import os
import posixpath
import shlex
import sys
from datetime import datetime, timezone
from pathlib import Path

import paramiko


ROOT = Path(__file__).resolve().parents[1]
APP = "/linhhoasu/lhs/newServer"
CONFIG = "/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin"
REMOTE_FILES = [
    "src/handlers/item.js",
    "src/services/RewardGrantService.js",
    "src/services/RandomUsableItemRewardService.js",
    "src/handlers/elf.js",
    "src/handlers/curios.js",
    "src/handlers/artifact.js",
    "src/handlers/valhalla-formation.js",
]
LOCAL_ROOT = ROOT.parent / "linhhoasu/lhs/newServer"
CONTRACT = ROOT / "tools/test_usable_item_fixes_20260905.js"
PROCESS_NAMES = ["lhs-s1001", "lhs-s1002", "lhs-real-bots", "lhs-real-bots-s2", "lhs-dist", "lhs-admin"]

# Read-only precondition observed immediately before this deployment.
BASELINE = {
    "src/handlers/item.js": "700a0c86c3c3a2f4a7b8473e890b3b208ae3cd97c577c2dc268d3f9b47274277",
    "src/services/RewardGrantService.js": "ae42d855c6e295aa0e2aa23a1a5091fe739dea6f5de66c2dca1cdc1422a8868d",
    "src/services/RandomUsableItemRewardService.js": None,
    "src/handlers/elf.js": "8981cd45faa9cac10777ff380ac213936c09f45932b08eb9cc1b00d7759ea4b7",
    "src/handlers/curios.js": "7d75aee17d16dfe4436e5b248e9f52e4f2241143e53b1a492c411b901dfab195",
    "src/handlers/artifact.js": "a4437648adba5c6688550ab3c9be74c5f72443d137da59c11859b29839118155",
    "src/handlers/valhalla-formation.js": "26ec1be3282998e07d3e944a648ba213ef84abc8d55d76000fdc1975efb427e9",
}


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(ssh: paramiko.SSHClient, command: str, timeout: int = 300) -> str:
    _stdin, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    output = stdout.read().decode("utf-8", "replace")
    error = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError((error + output)[-30000:])
    return output


def pm2_state(ssh: paramiko.SSHClient) -> list[dict]:
    script = (
        'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.stringify('
        'JSON.parse(s).filter(p=>' + json.dumps(PROCESS_NAMES) + '.includes(p.name))'
        '.map(p=>({name:p.name,pid:p.pid,status:p.pm2_env.status,restarts:p.pm2_env.restart_time,uptime:p.pm2_env.pm_uptime})))))'
    )
    return json.loads(run(ssh, "pm2 jlist | node -e " + shlex.quote(script)))


def health(ssh: paramiko.SSHClient, port: int) -> dict:
    script = (
        'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const x=JSON.parse(s),'
        'r=x.runtime||{},b=r.bots||{},m=r.mapMonsters||{};console.log(JSON.stringify({'
        'status:x.status,real:Number((b.real||{}).count)||0,virtual:Number(b.botCount)||0,'
        'totalSlots:Number(m.totalSlots)||0,multiplier:Number(m.densityMultiplier)||0,'
        'invalid:Number(m.invalid)||0}))})'
    )
    return json.loads(run(ssh, f"curl -fsS http://127.0.0.1:{port}/health | node -e {shlex.quote(script)}"))


def wait_ready(ssh: paramiko.SSHClient, port: int) -> None:
    run(ssh, (
        "for i in $(seq 1 90); do "
        f"code=$(curl -s -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{port}/ready || true); "
        '[ "$code" = 200 ] && exit 0; sleep 1; done; exit 1'
    ), timeout=120)


def main() -> None:
    global BASELINE
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except (AttributeError, OSError):
        pass

    credentials_path = Path(os.environ.get("LHS_PROD_CREDENTIAL_FILE", ROOT / "VPS103.116.105.154.txt"))
    credentials = credentials_path.read_text(encoding="utf-8-sig").splitlines()
    expected = {relative: digest(LOCAL_ROOT / relative) for relative in REMOTE_FILES}
    if os.environ.get('LHS_BASELINE_EVIDENCE'):
        prior = json.loads(Path(os.environ['LHS_BASELINE_EVIDENCE']).read_text(encoding='utf-8'))
        BASELINE = prior['installedHashes']
    contract = ROOT / 'tools/test_usable_item_safe_release_20260905.js' if os.environ.get('LHS_SAFE_RELEASE') == '1' else CONTRACT
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup = f"/linhhoasu/_ai_workbench/backups/usable_item_fix_{stamp}"
    stage = f"/linhhoasu/_ai_workbench/temp/usable_item_fix_{stamp}"
    evidence = ROOT / "temp" / f"usable_item_fix_deploy_{stamp}.json"
    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
    ssh.connect(credentials[0].strip(), username="root", password=credentials[2], look_for_keys=False, allow_agent=False, timeout=20)
    installed = False
    restarted = []
    result = {"generatedAt": datetime.now(timezone.utc).isoformat(), "backup": backup, "stage": stage}
    try:
        before_pm2 = pm2_state(ssh)
        before_health = [health(ssh, 9200), health(ssh, 9201)]
        remote_before = {}
        for relative in REMOTE_FILES:
            remote = f"{APP}/{relative}"
            output = run(ssh, f"if test -f {shlex.quote(remote)}; then sha256sum {shlex.quote(remote)}; else echo MISSING; fi").strip()
            remote_before[relative] = None if output == "MISSING" else output.split()[0]
        if remote_before != BASELINE:
            raise RuntimeError("REMOTE_DRIFT:" + json.dumps(remote_before, sort_keys=True))

        run(ssh, f"install -d -m 700 {backup}/files {stage}/files")
        for index, relative in enumerate(REMOTE_FILES, 1):
            remote = f"{APP}/{relative}"
            if BASELINE[relative] is not None:
                run(ssh, f"cp -a {shlex.quote(remote)} {backup}/files/{index:02d}.before")

        sftp = ssh.open_sftp()
        try:
            for index, relative in enumerate(REMOTE_FILES, 1):
                local = LOCAL_ROOT / relative
                sftp.put(str(local), f"{stage}/files/{index:02d}.js")
            sftp.put(str(CONTRACT), f"{stage}/test_usable_item_fixes_20260905.js")
            if contract != CONTRACT:
                sftp.put(str(contract), f"{stage}/{contract.name}")
        finally:
            sftp.close()

        for index in range(1, len(REMOTE_FILES) + 1):
            run(ssh, f"node --check {stage}/files/{index:02d}.js")
        run(ssh, f"node --check {stage}/test_usable_item_fixes_20260905.js")
        installed = True
        for index, relative in enumerate(REMOTE_FILES, 1):
            remote = f"{APP}/{relative}"
            run(ssh, f"install -m 644 {stage}/files/{index:02d}.js {shlex.quote(remote)}")
        installed = True
        installed_hashes = {
            relative: run(ssh, f"sha256sum {shlex.quote(APP + '/' + relative)}").split()[0]
            for relative in REMOTE_FILES
        }
        if installed_hashes != expected:
            raise RuntimeError("INSTALL_HASH_MISMATCH:" + json.dumps(installed_hashes, sort_keys=True))

        contract_cmd = f"cd {APP} && LHS_APP_ROOT={APP} LHS_CONFIG_PATH={CONFIG} node {stage}/{contract.name}"
        pre_contract = run(ssh, contract_cmd, timeout=420).strip()
        core = run(ssh, f"cd {APP} && npm run test:core-contract", timeout=300).strip()

        for process, port in [("lhs-s1002", 8083), ("lhs-s1001", 8080)]:
            restarted.append(process)
            run(ssh, f"cd {APP} && pm2 restart ecosystem.config.js --only {process} --update-env", timeout=180)
            wait_ready(ssh, port)
            contract = run(ssh, contract_cmd, timeout=420).strip()
            if '"result":"PASS"' not in contract:
                raise RuntimeError(f"{process.upper()}_CONTRACT_FAILED")

        after_pm2 = pm2_state(ssh)
        after_health = [health(ssh, 9200), health(ssh, 9201)]
        if not all(
            row["status"] == "ok" and row["virtual"] == 580
            and row["totalSlots"] == 2466 and row["multiplier"] == 2 and row["invalid"] == 0
            for row in after_health
        ):
            raise RuntimeError("HEALTH_FAILED:" + json.dumps(after_health))
        ready = {
            "s1": int(run(ssh, "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/ready").strip()),
            "s2": int(run(ssh, "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8083/ready").strip()),
        }
        errors = run(
            ssh,
            "for f in /root/.pm2/logs/lhs-s1001-error.log /root/.pm2/logs/lhs-s1002-error.log; do "
            "tail -n 120 \"$f\" | grep -E 'TypeError|ReferenceError|Unhandled|FATAL|SyntaxError' || true; done",
        ).strip()
        if ready != {"s1": 200, "s2": 200} or errors:
            raise RuntimeError("POST_RESTART_GATE_FAILED")

        result.update({
            "result": "PASS", "beforePm2": before_pm2, "afterPm2": after_pm2,
            "beforeHealth": before_health, "afterHealth": after_health, "ready": ready,
            "remoteBefore": remote_before, "installedHashes": installed_hashes,
            "expectedHashes": expected, "preContract": pre_contract, "core": core,
            "errors": errors,
        })
        evidence.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({"result": "PASS", "evidence": str(evidence), "backup": backup, "hashes": installed_hashes, "ready": ready, "health": after_health}, ensure_ascii=False))
    except Exception as exc:
        result.update({"result": "FAIL", "error": str(exc)})
        try:
            if installed:
                for index, relative in enumerate(REMOTE_FILES, 1):
                    if BASELINE[relative] is not None:
                        remote = f"{APP}/{relative}"
                        run(ssh, f"install -m 644 {backup}/files/{index:02d}.before {shlex.quote(remote)}")
                    else:
                        run(ssh, f"rm -f -- {shlex.quote(APP + '/' + relative)}")
                if restarted:
                    run(ssh, f"cd {APP} && pm2 restart ecosystem.config.js --only {','.join(restarted)} --update-env", timeout=240)
            result["rollback"] = "PASS"
        except Exception as rollback_error:
            result["rollback"] = f"FAIL:{rollback_error}"
        evidence.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        raise
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
