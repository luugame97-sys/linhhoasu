"""Deploy checkpoint 4: server-authoritative cash recharge callback.

The tool uses compare-and-swap hashes, backups every touched production file,
stages JavaScript beside its destination, runs remote syntax/require/contract
checks, restarts only lhs-s1001, and auto-rolls back on a failed post gate.
"""
from __future__ import annotations

import getpass
import hashlib
import json
import os
import posixpath
import shlex
import time
from datetime import datetime, timezone
from pathlib import Path

import paramiko


HOST = "103.116.105.154"
ROOT = Path(__file__).resolve().parents[1]
CANDIDATE = ROOT / "temp/checkpoint4_minimal_candidate_20260901_142759/lhs/newServer"
REMOTE_ROOT = "/linhhoasu"
REMOTE_APP = REMOTE_ROOT + "/lhs/newServer"
LOCK_FILE = REMOTE_ROOT + "/_ai_workbench/locks/checkpoint4_cash_resolver.lock"

FILES = {
    "src/handlers/recharge.js": "89023a647f4dde41028d4d8bec888e63fe1cb897234ee630fac70431bd5f8e3d",
    "src/handlers/compat.js": "00efcabcc093ba95d527565a56eacbae725a8ab94a08304aac1f015509e6792c",
    "src/handlers/item.js": "f41bfd94a5da38ff68d9f961145623798fa792e037aa4a8b9a47e2af43541e7a",
    "src/services/RechargeRewardResolver.js": "c48a1bf68bce13333af1c6cd104a3811719dc479a5bff249cbf4d59a9706f778",
    "src/services/RechargeBenefitService.js": "e41a225f4366560df7e45b82ae2561b9a8ddb6fd9bc6076ab44afc69040cce6a",
    "src/services/Activity9Service.js": "688a4a59f34fe91facea9d2072ee1da8bd92b13b85668f4d7ed896376824bd71",
}


def q(value: str) -> str:
    return shlex.quote(value)


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(ssh: paramiko.SSHClient, command: str, timeout: int = 120, check: bool = True) -> str:
    _stdin, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    output = stdout.read().decode("utf-8", "replace")
    error = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if check and code:
        raise RuntimeError(error[-6000:] or output[-6000:] or f"remote exit={code}")
    return output


def remote_sha(ssh: paramiko.SSHClient, path: str) -> str:
    return run(ssh, f"sha256sum -- {q(path)} | awk '{{print $1}}'").strip().lower()


def remote_exists(ssh: paramiko.SSHClient, path: str) -> bool:
    marker = run(
        ssh,
        f"if test -e {q(path)}; then printf 'exists'; else printf 'missing'; fi",
    ).strip()
    if marker not in {"exists", "missing"}:
        raise RuntimeError(f"unexpected existence probe for {path}: {marker}")
    return marker == "exists"


def health(ssh: paramiko.SSHClient) -> dict[str, object]:
    result: dict[str, object] = {}
    for name, url in {
        "ready": "http://127.0.0.1:8080/ready",
        "health": "http://127.0.0.1:9200/health",
    }.items():
        raw = run(ssh, f"curl -sS --max-time 15 -w '\n__META__|%{{http_code}}' {q(url)}", timeout=30)
        body, _, code = raw.rpartition("\n__META__|")
        result[name] = {"code": code.strip(), "body": body[:1200]}
    return result


def assert_health(value: dict[str, object], label: str) -> None:
    for key in ("ready", "health"):
        row = value.get(key)
        if not isinstance(row, dict) or str(row.get("code")) != "200":
            raise RuntimeError(f"{label} {key} failed: {row}")
    ready = str(value["ready"].get("body", ""))
    if '"status":"ok"' not in ready or '"mongo":true' not in ready or '"redis":true' not in ready:
        raise RuntimeError(f"{label} readiness unhealthy: {ready}")


def pm2_targets(ssh: paramiko.SSHClient) -> dict[str, dict[str, object]]:
    raw = run(
        ssh,
        "pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{for(const p of JSON.parse(s)){if([\"lhs-s1001\",\"lhs-dist\",\"lhs-admin\",\"lhs-real-bots\"].includes(p.name)){const e=p.pm2_env||{};console.log(JSON.stringify({name:p.name,status:e.status,pid:p.pid,restarts:e.restart_time,uptime:e.pm_uptime}))}}})'",
    )
    return {row["name"]: row for row in (json.loads(line) for line in raw.splitlines() if line.strip())}


def local_preflight() -> dict[str, str]:
    hashes: dict[str, str] = {}
    for rel in FILES:
        path = CANDIDATE / rel
        if not path.is_file():
            raise FileNotFoundError(path)
        hashes[rel] = digest(path)
    if hashes["src/handlers/recharge.js"] == FILES["src/handlers/recharge.js"]:
        raise RuntimeError("recharge candidate did not change")
    if hashes["src/services/RechargeRewardResolver.js"] == FILES["src/services/RechargeRewardResolver.js"]:
        raise RuntimeError("resolver candidate did not change")
    return hashes


def main() -> None:
    candidate_hashes = local_preflight()
    password = os.environ.get("LHS_PROD_PASSWORD") or getpass.getpass("Production password (not logged): ")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup = f"{REMOTE_ROOT}/_ai_workbench/backups/checkpoint4_cash_resolver_pre_{stamp}"
    stage_paths: dict[str, str] = {}
    remote_test_resolver = f"{REMOTE_ROOT}/_ai_workbench/temp/test_recharge_reward_resolver_{stamp}.js"
    remote_test_token = f"{REMOTE_ROOT}/_ai_workbench/temp/test_token_recharge_checkpoint3_{stamp}.js"
    remote_test_cash = f"{REMOTE_ROOT}/_ai_workbench/temp/test_cash_recharge_checkpoint4_{stamp}.js"
    installed = False
    restarted = False

    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False, allow_agent=False, timeout=20, banner_timeout=20, auth_timeout=20)
    pre: dict[str, object] = {}
    try:
        pre_hashes = {}
        for rel, expected in FILES.items():
            remote = f"{REMOTE_APP}/{rel}"
            current = remote_sha(ssh, remote)
            if current != expected:
                raise RuntimeError(f"precondition drift {rel}: {current} != {expected}")
            pre_hashes[rel] = current
        pre["hashes"] = pre_hashes
        pre["health"] = health(ssh)
        assert_health(pre["health"], "pre")
        pre["pm2"] = pm2_targets(ssh)
        if pre["pm2"].get("lhs-s1001", {}).get("status") != "online":
            raise RuntimeError("lhs-s1001 is not online")

        run(ssh, f"mkdir -p -- {q(backup)} {q(posixpath.dirname(LOCK_FILE))} {q(REMOTE_ROOT + '/_ai_workbench/temp')}")
        for rel, expected in FILES.items():
            remote = f"{REMOTE_APP}/{rel}"
            backup_file = f"{backup}/{rel}"
            run(ssh, f"mkdir -p -- {q(posixpath.dirname(backup_file))}; cp -p -- {q(remote)} {q(backup_file)}")
            if remote_sha(ssh, backup_file) != expected:
                raise RuntimeError(f"backup hash mismatch: {rel}")
        run(ssh, f"printf '%s' {q(json.dumps({'preHashes': pre_hashes, 'candidateHashes': candidate_hashes}, ensure_ascii=False))} > {q(backup + '/metadata.json')}")

        sftp = ssh.open_sftp()
        try:
            for rel in FILES:
                remote = f"{REMOTE_APP}/{rel}"
                stage = posixpath.join(posixpath.dirname(remote), f".{posixpath.basename(remote)}.checkpoint4-stage-{stamp}.js")
                stage_paths[rel] = stage
                sftp.put(str(CANDIDATE / rel), stage)
            sftp.put(str(ROOT / "tools/test_recharge_reward_resolver.js"), remote_test_resolver)
            sftp.put(str(ROOT / "tools/test_token_recharge_checkpoint3.js"), remote_test_token)
            sftp.put(str(ROOT / "tools/test_cash_recharge_checkpoint4.js"), remote_test_cash)
        finally:
            sftp.close()

        for rel, stage in stage_paths.items():
            reference = f"{REMOTE_APP}/{rel}"
            run(ssh, f"chown --reference={q(reference)} {q(stage)}; chmod --reference={q(reference)} {q(stage)}")
            if remote_sha(ssh, stage) != candidate_hashes[rel]:
                raise RuntimeError(f"stage hash mismatch: {rel}")
            run(ssh, f"cd {q(REMOTE_APP)} && node --check {q(stage)}")

        # Assemble an isolated remote runtime so require() sees all candidate
        # siblings without replacing production files yet.
        runtime = f"{REMOTE_ROOT}/_ai_workbench/temp/checkpoint4_runtime_{stamp}"
        run(ssh, f"rm -rf -- {q(runtime)}; mkdir -p -- {q(runtime)}; cp -a -- {q(REMOTE_APP + '/src')} {q(runtime + '/src')}; ln -s -- {q(REMOTE_APP + '/node_modules')} {q(runtime + '/node_modules')}")
        for rel, stage in stage_paths.items():
            dst = f"{runtime}/{rel}"
            run(ssh, f"mkdir -p -- {q(posixpath.dirname(dst))}; cp -p -- {q(stage)} {q(dst)}")

        config_path = f"{REMOTE_ROOT}/lhs/update/resource/assets/excel/config_e5ac72c2.bin"
        resolver_out = run(ssh, f"cd {q(REMOTE_ROOT)} && CONFIG_BIN_PATH={q(config_path)} APP_ROOT={q(runtime)} RECHARGE_RESOLVER_PATH={q(runtime + '/src/services/RechargeRewardResolver.js')} node {q(remote_test_resolver)}", timeout=180)
        if '"result":"ok"' not in resolver_out or '"catalog":614' not in resolver_out:
            raise RuntimeError(f"remote resolver catalog failed: {resolver_out[-5000:]}")
        token_out = run(ssh, f"cd {q(REMOTE_ROOT)} && CONFIG_BIN_PATH={q(config_path)} APP_ROOT={q(runtime)} NODE_PATH={q(REMOTE_APP + '/node_modules')} node {q(remote_test_token)}", timeout=180)
        if '"result":"ok"' not in token_out or '"checks":11' not in token_out:
            raise RuntimeError(f"remote token fixture failed: {token_out[-5000:]}")
        cash_out = run(ssh, f"cd {q(REMOTE_ROOT)} && CONFIG_BIN_PATH={q(config_path)} APP_ROOT={q(runtime)} NODE_PATH={q(REMOTE_APP + '/node_modules')} node {q(remote_test_cash)}", timeout=180)
        if '"result":"ok"' not in cash_out or '"checks":11' not in cash_out:
            raise RuntimeError(f"remote cash fixture failed: {cash_out[-5000:]}")

        swaps = []
        for rel in FILES:
            remote = f"{REMOTE_APP}/{rel}"
            expected = FILES[rel]
            swaps.append(f"test \"$(sha256sum -- {q(remote)} | awk '{{print $1}}')\" = {q(expected)}")
            swaps.append(f"mv -f -- {q(stage_paths[rel])} {q(remote)}")
        run(ssh, f"flock -x {q(LOCK_FILE)} sh -c {q('set -eu; ' + '; '.join(swaps))}")
        installed = True

        for rel, expected in candidate_hashes.items():
            if remote_sha(ssh, f"{REMOTE_APP}/{rel}") != expected:
                raise RuntimeError(f"post-swap hash mismatch: {rel}")
        run(ssh, f"cd {q(REMOTE_APP)} && node --check src/handlers/recharge.js && node --check src/handlers/compat.js && node --check src/handlers/item.js && node --check src/services/RechargeRewardResolver.js")
        require_out = run(ssh, f"cd {q(REMOTE_APP)} && node -e \"require('./src/handlers/recharge'); require('./src/handlers/compat'); require('./src/services/RechargeRewardResolver'); console.log('CHECKPOINT4_REQUIRE_OK')\"")
        if "CHECKPOINT4_REQUIRE_OK" not in require_out:
            raise RuntimeError("production require smoke failed")

        restart_output = run(ssh, "pm2 restart lhs-s1001 --update-env", timeout=180)
        restarted = True
        deadline = time.time() + 90
        post_health: dict[str, object] = {}
        post_pm2: dict[str, dict[str, object]] = {}
        while time.time() < deadline:
            try:
                post_health = health(ssh)
                post_pm2 = pm2_targets(ssh)
                if post_pm2.get("lhs-s1001", {}).get("status") == "online":
                    assert_health(post_health, "post")
                    break
            except Exception:
                pass
            time.sleep(3)
        assert_health(post_health, "post")
        if post_pm2.get("lhs-s1001", {}).get("status") != "online":
            raise RuntimeError("lhs-s1001 did not return online")
        for name in ("lhs-dist", "lhs-admin", "lhs-real-bots"):
            if post_pm2.get(name, {}).get("pid") != pre["pm2"].get(name, {}).get("pid"):
                raise RuntimeError(f"unrelated process changed pid: {name}")

        error_tail = run(ssh, "tail -n 160 /root/.pm2/logs/lhs-s1001-error.log 2>/dev/null || true", check=False)
        print(json.dumps({
            "result": "DEPLOYED",
            "checkpoint": "cash-recharge-catalog-resolver",
            "host": HOST,
            "backup": backup,
            "candidateHashes": candidate_hashes,
            "pre": pre,
            "post": {
                "health": post_health,
                "pm2": post_pm2,
                "otherProcessesRestarted": False,
                "errorTail": error_tail[-3000:],
            },
            "contracts": {
                "resolver": resolver_out.strip().splitlines()[-1],
                "token": token_out.strip().splitlines()[-1],
                "cash": cash_out.strip().splitlines()[-1],
            },
            "restartOutputTail": restart_output[-1200:],
            "deployedAt": datetime.now(timezone.utc).isoformat(),
        }, ensure_ascii=False, indent=2))
    except Exception:
        if installed:
            try:
                current_ok = all(
                    remote_sha(ssh, f"{REMOTE_APP}/{rel}") == expected
                    for rel, expected in candidate_hashes.items()
                )
                if current_ok:
                    rollback_commands = []
                    for rel in FILES:
                        remote = f"{REMOTE_APP}/{rel}"
                        source = f"{backup}/{rel}"
                        rollback_commands.append(f"cp -p -- {q(source)} {q(remote + '.rollback-stage')}")
                        rollback_commands.append(f"mv -f -- {q(remote + '.rollback-stage')} {q(remote)}")
                    run(ssh, f"flock -x {q(LOCK_FILE)} sh -c {q('set -eu; ' + '; '.join(rollback_commands))}")
                    if restarted:
                        run(ssh, "pm2 restart lhs-s1001 --update-env", timeout=180, check=False)
                    print("AUTO_ROLLBACK=completed")
                else:
                    print("AUTO_ROLLBACK=refused_drift")
            except Exception as rollback_error:
                print(f"AUTO_ROLLBACK_ERROR={rollback_error}")
        raise
    finally:
        cleanup = list(stage_paths.values()) + [remote_test_resolver, remote_test_token, remote_test_cash, f"{REMOTE_ROOT}/_ai_workbench/temp/checkpoint4_runtime_{stamp}"]
        run(ssh, "rm -rf -- " + " ".join(q(path) for path in cleanup), timeout=60, check=False)
        ssh.close()


if __name__ == "__main__":
    main()
