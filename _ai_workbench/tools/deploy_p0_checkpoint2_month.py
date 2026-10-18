"""Deploy P0 checkpoint 2: authoritative daily month-card claim (tag 1211)."""
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
LOCAL_COMMERCE = ROOT / "temp/p0_checkpoint2_month_candidate_20260901/commerce-compat.js"
LOCAL_ITEM_EXPECTED = ROOT / "temp/p0_checkpoint1_item_candidate_fresh_20260901/item.js"
LOCAL_TEST = ROOT / "tools/test_p0_item_commerce_contract.js"
REMOTE_ROOT = "/linhhoasu"
REMOTE_APP = "/linhhoasu/lhs/newServer"
REMOTE_COMMERCE = REMOTE_APP + "/src/handlers/commerce-compat.js"
REMOTE_ITEM = REMOTE_APP + "/src/handlers/item.js"
EXPECTED_COMMERCE = "77893f6e064e43c8ce6f02356211f968a11197612f7f2177bb27a2341198abb2"
EXPECTED_ITEM = "e1c9f84faee5152dbf667ee89a45f35c46f379fef68714384a3ce03543c1720d"
LOCK_DIR = REMOTE_ROOT + "/_ai_workbench/locks"
LOCK_FILE = LOCK_DIR + "/p0_checkpoint2_month.lock"


def q(value: str) -> str:
    return shlex.quote(value)


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(ssh: paramiko.SSHClient, command: str, timeout: int = 90, check: bool = True) -> str:
    _stdin, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    output = stdout.read().decode("utf-8", "replace")
    error = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if check and code:
        raise RuntimeError(error[-5000:] or output[-5000:] or f"remote exit {code}")
    return output


def remote_sha(ssh: paramiko.SSHClient, path: str) -> str:
    return run(ssh, f"sha256sum -- {q(path)} | awk '{{print $1}}'").strip().lower()


def metadata(ssh: paramiko.SSHClient, path: str) -> str:
    basic = run(ssh, f"stat -c '%u:%g:%a|%U:%G|%s|%y' -- {q(path)}").strip()
    context = run(
        ssh,
        "if command -v selinuxenabled >/dev/null 2>&1 && selinuxenabled; "
        f"then stat -c '%C' -- {q(path)}; else printf 'selinux-disabled'; fi",
    ).strip()
    prefix, sep, rest = basic.partition("|")
    if not sep:
        raise RuntimeError(f"metadata format mismatch: {basic}")
    return f"{prefix}:{context}|{rest}"


def health(ssh: paramiko.SSHClient) -> dict[str, object]:
    result: dict[str, object] = {}
    for name, url in {
        "ready": "http://127.0.0.1:8080/ready",
        "health": "http://127.0.0.1:9200/health",
    }.items():
        raw = run(ssh, f"curl -sS --max-time 15 -w '\\n__META__|%{{http_code}}' {q(url)}", timeout=30)
        body, _, code = raw.rpartition("\n__META__|")
        result[name] = {"code": code.strip(), "body": body[:1200]}
    return result


def assert_health(value: dict[str, object], label: str) -> None:
    for key in ("ready", "health"):
        row = value.get(key) or {}
        if not isinstance(row, dict) or str(row.get("code")) != "200":
            raise RuntimeError(f"{label} {key} failed: {row}")
    body = str((value["ready"] or {}).get("body", ""))
    if '"status":"ok"' not in body or '"mongo":true' not in body or '"redis":true' not in body:
        raise RuntimeError(f"{label} readiness unhealthy: {body[:1000]}")


def pm2_target(ssh: paramiko.SSHClient) -> dict[str, object]:
    raw = run(
        ssh,
        "pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{for(const p of JSON.parse(s)){if(p.name===\"lhs-s1001\"){const e=p.pm2_env||{};console.log(JSON.stringify({name:p.name,status:e.status,pid:p.pid,restarts:e.restart_time,uptime:e.pm_uptime,cwd:e.pm_cwd,script:e.pm_exec_path}))}}})'",
    ).strip()
    if not raw:
        raise RuntimeError("lhs-s1001 missing")
    return json.loads(raw.splitlines()[-1])


def local_preflight() -> tuple[bytes, str]:
    if not LOCAL_COMMERCE.is_file() or not LOCAL_ITEM_EXPECTED.is_file() or not LOCAL_TEST.is_file():
        raise FileNotFoundError("checkpoint 2 artifact missing")
    candidate = LOCAL_COMMERCE.read_bytes()
    candidate_hash = digest(LOCAL_COMMERCE)
    if candidate_hash == EXPECTED_COMMERCE:
        raise RuntimeError("local commerce candidate is baseline")
    text = candidate.decode("utf-8")
    for marker in ("KNOWN_MONTH_CARD_IDS", "getGmt8DayKey", "getMonthCardDailyRewardRows"):
        if marker not in text:
            raise RuntimeError(f"local month marker missing: {marker}")
    return candidate, candidate_hash


def main() -> None:
    candidate, candidate_hash = local_preflight()
    if digest(LOCAL_ITEM_EXPECTED) != EXPECTED_ITEM:
        raise RuntimeError("local checkpoint 1 item artifact drifted")
    password = os.environ.get("LHS_PROD_PASSWORD") or getpass.getpass("Production password (not logged): ")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup = f"{REMOTE_ROOT}/_ai_workbench/backups/p0_checkpoint2_month_pre_{stamp}"
    backup_file = backup + "/commerce-compat.js"
    backup_meta = backup + "/metadata.json"
    handler_dir = posixpath.dirname(REMOTE_COMMERCE)
    stage = handler_dir + f"/commerce-compat.p0-stage-{stamp}.js"
    rollback_stage = handler_dir + f"/commerce-compat.p0-rollback-{stamp}.js"
    remote_test = f"{REMOTE_ROOT}/_ai_workbench/temp/p0_month_contract_{stamp}.js"
    installed = False
    restarted = False
    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False, allow_agent=False, timeout=20, banner_timeout=20, auth_timeout=20)
    pre: dict[str, object] = {}
    try:
        pre["commerceSha256"] = remote_sha(ssh, REMOTE_COMMERCE)
        pre["itemSha256"] = remote_sha(ssh, REMOTE_ITEM)
        if pre["commerceSha256"] != EXPECTED_COMMERCE:
            raise RuntimeError(f"commerce baseline drifted: {pre['commerceSha256']}")
        if pre["itemSha256"] != EXPECTED_ITEM:
            raise RuntimeError(f"checkpoint 1 item drifted: {pre['itemSha256']}")
        pre["commerceMetadata"] = metadata(ssh, REMOTE_COMMERCE)
        pre["health"] = health(ssh)
        assert_health(pre["health"], "pre")
        pre["pm2"] = pm2_target(ssh)
        if pre["pm2"].get("status") != "online":
            raise RuntimeError(f"lhs-s1001 not online: {pre['pm2']}")

        run(ssh, f"set -eu; mkdir -p -- {q(backup)} {q(LOCK_DIR)}; cp -p -- {q(REMOTE_COMMERCE)} {q(backup_file)}; if command -v selinuxenabled >/dev/null 2>&1 && selinuxenabled; then chcon --reference={q(REMOTE_COMMERCE)} {q(backup_file)}; fi; printf '%s' {q(json.dumps({'source': REMOTE_COMMERCE, 'baselineSha256': EXPECTED_COMMERCE, 'metadata': pre['commerceMetadata']}, ensure_ascii=False))} > {q(backup_meta)}")
        if remote_sha(ssh, backup_file) != EXPECTED_COMMERCE:
            raise RuntimeError("commerce backup hash mismatch")

        sftp = ssh.open_sftp()
        try:
            with sftp.file(stage, "wb") as handle:
                handle.write(candidate)
            sftp.put(str(LOCAL_TEST), remote_test)
        finally:
            sftp.close()
        run(ssh, "set -eu; " + f"chown --reference={q(REMOTE_COMMERCE)} {q(stage)} {q(remote_test)}; chmod --reference={q(REMOTE_COMMERCE)} {q(stage)} {q(remote_test)}; if command -v selinuxenabled >/dev/null 2>&1 && selinuxenabled; then chcon --reference={q(REMOTE_COMMERCE)} {q(stage)} {q(remote_test)}; fi")
        if remote_sha(ssh, stage) != candidate_hash:
            raise RuntimeError("commerce stage hash mismatch")
        run(ssh, f"cd {q(REMOTE_APP)} && node --check {q(stage)}")
        test_output = run(ssh, f"cd {q(REMOTE_ROOT)} && APP_ROOT={q(REMOTE_APP)} P0_COMMERCE_HANDLER_PATH={q(stage)} P0_ONLY_MONTH=1 node {q(remote_test)}", timeout=120)
        if '"result":"ok"' not in test_output or '"checks":13' not in test_output:
            raise RuntimeError(f"remote month contract failed: {test_output[-4000:]}")
        run(ssh, f"rm -f -- {q(remote_test)}")

        run(ssh, f"flock -x {q(LOCK_FILE)} sh -c " + q("set -eu; " + f"test \"$(sha256sum -- {q(REMOTE_COMMERCE)} | awk '{{print $1}}')\" = {q(EXPECTED_COMMERCE)}; mv -f -- {q(stage)} {q(REMOTE_COMMERCE)}"))
        installed = True
        post_commerce = remote_sha(ssh, REMOTE_COMMERCE)
        if post_commerce != candidate_hash:
            raise RuntimeError(f"post-swap commerce hash mismatch: {post_commerce}")

        restart_output = run(ssh, "pm2 restart lhs-s1001 --update-env", timeout=120)
        restarted = True
        deadline = time.time() + 75
        post_health: dict[str, object] = {}
        post_pm2: dict[str, object] = {}
        while time.time() < deadline:
            try:
                post_health = health(ssh)
                post_pm2 = pm2_target(ssh)
                if post_pm2.get("status") == "online":
                    assert_health(post_health, "post")
                    break
            except Exception:
                pass
            time.sleep(3)
        assert_health(post_health, "post")
        if post_pm2.get("status") != "online":
            raise RuntimeError(f"lhs-s1001 did not return online: {post_pm2}")
        post_meta = metadata(ssh, REMOTE_COMMERCE)
        if post_meta.split("|", 1)[0] != str(pre["commerceMetadata"]).split("|", 1)[0]:
            raise RuntimeError(f"commerce metadata changed: {pre['commerceMetadata']} -> {post_meta}")
        print(json.dumps({
            "result": "DEPLOYED",
            "checkpoint": "p0-month-card-1211",
            "host": HOST,
            "remote": REMOTE_COMMERCE,
            "backup": backup,
            "baselineCommerceSha256": EXPECTED_COMMERCE,
            "candidateCommerceSha256": candidate_hash,
            "checkpoint1ItemSha256": EXPECTED_ITEM,
            "pre": pre,
            "post": {"commerceSha256": post_commerce, "commerceMetadata": post_meta, "health": post_health, "pm2": post_pm2, "otherProcessesRestarted": False},
            "contract": "remote 13-case month fixture PASS; network=false; persistence=false",
            "deployedAt": datetime.now(timezone.utc).isoformat(),
            "restartOutputTail": restart_output[-1200:],
        }, ensure_ascii=False, indent=2))
    except Exception:
        if installed:
            try:
                current = remote_sha(ssh, REMOTE_COMMERCE)
                if current == candidate_hash:
                    run(ssh, f"flock -x {q(LOCK_FILE)} sh -c " + q("set -eu; " + f"test \"$(sha256sum -- {q(REMOTE_COMMERCE)} | awk '{{print $1}}')\" = {q(candidate_hash)}; cp -p -- {q(backup_file)} {q(rollback_stage)}; chown --reference={q(REMOTE_COMMERCE)} {q(rollback_stage)}; chmod --reference={q(REMOTE_COMMERCE)} {q(rollback_stage)}; if command -v selinuxenabled >/dev/null 2>&1 && selinuxenabled; then chcon --reference={q(REMOTE_COMMERCE)} {q(rollback_stage)}; fi; mv -f -- {q(rollback_stage)} {q(REMOTE_COMMERCE)}"))
                    if restarted:
                        run(ssh, "pm2 restart lhs-s1001 --update-env", timeout=120, check=False)
                    print("AUTO_ROLLBACK=completed")
                else:
                    print(f"AUTO_ROLLBACK=refused_drift current={current}")
            except Exception as rollback_error:
                print(f"AUTO_ROLLBACK_ERROR={rollback_error}")
        raise
    finally:
        if ssh.get_transport() and ssh.get_transport().is_active():
            run(ssh, f"rm -f -- {q(stage)} {q(rollback_stage)} {q(remote_test)}", timeout=30, check=False)
        ssh.close()


if __name__ == "__main__":
    main()
