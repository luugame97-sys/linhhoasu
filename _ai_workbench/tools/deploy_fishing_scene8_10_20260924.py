"""Guarded rollout for fishing scenes 8-10.

The candidate binaries must be patched from the live VPS snapshot.  This
script stages first, verifies the remote baseline, then installs atomically
and restarts only the five game workers.  Rollback restores every changed
file from the same remote backup if any post-install check fails.
"""

from __future__ import annotations

import hashlib
import json
import shlex
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import paramiko

WB = Path(__file__).resolve().parents[1]
ROOT = WB / "temp" / "fishing_scene8_10_candidate_20260924"
PROJECT = WB.parent
EVIDENCE = ROOT / "deploy"
APP = "/linhhoasu/lhs/newServer"
GAME = "/linhhoasu/webgame/game"
TARGETS = [
    ("remote_lhs_config_e5ac72c2.scene8_10.bin", "/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin", "lhs_config_e5ac72c2.bin"),
    ("remote_webgame_config_e5ac72c2.scene8_10.bin", "/linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin", "webgame_config_e5ac72c2.bin"),
    ("remote_lhs_config_fashion.scene8_10.bin", "/linhhoasu/lhs/update/resource/assets/excel/config_fashion_20260909.bin", "lhs_config_fashion_20260909.bin"),
    ("remote_webgame_config_fashion.scene8_10.bin", "/linhhoasu/webgame/game/update/resource/assets/excel/config_fashion_20260909.bin", "webgame_config_fashion_20260909.bin"),
    ("playerPayload.js", f"{APP}/src/handlers/playerPayload.js", "playerPayload.js"),
    ("index.html", f"{GAME}/index.html", "index.html"),
]
WORKERS = [("lhs-s1001", 8080), ("lhs-s1002", 8083), ("lhs-s1003", 8084), ("lhs-s1004", 8085), ("lhs-s1005", 8086)]


def local_path(local_name: str) -> Path:
    overrides = {
        "playerPayload.js": PROJECT / "linhhoasu" / "lhs" / "newServer" / "src" / "handlers" / "playerPayload.js",
        "index.html": PROJECT / "linhhoasu" / "webgame" / "game" / "index.html",
    }
    return overrides.get(local_name, ROOT / local_name)


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_json(name: str, value: object) -> None:
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    (EVIDENCE / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def run(ssh: paramiko.SSHClient, command: str, body: str | None = None, timeout: int = 60) -> str:
    stdin, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    if body is not None:
        stdin.write(body)
        stdin.channel.shutdown_write()
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError((err + out)[-16000:])
    return out


def remote_hashes(ssh: paramiko.SSHClient, paths: list[str]) -> dict[str, str | None]:
    payload = json.dumps(paths)
    script = (
        "const fs=require('fs'),c=require('crypto');"
        f"console.log(JSON.stringify(Object.fromEntries({payload}.map(p=>[p,fs.existsSync(p)"
        "?c.createHash('sha256').update(fs.readFileSync(p)).digest('hex'):null]))));"
    )
    return json.loads(run(ssh, "node -", script))


def pm2(ssh: paramiko.SSHClient) -> list[dict]:
    script = "let x='';process.stdin.on('data',b=>x+=b).on('end',()=>console.log(JSON.stringify(JSON.parse(x).map(p=>({name:p.name,pid:p.pid,status:p.pm2_env.status,restarts:p.pm2_env.restart_time})))));"
    return json.loads(run(ssh, "pm2 jlist | node -e " + shlex.quote(script)))


def readiness(ssh: paramiko.SSHClient) -> dict[str, int]:
    result = {}
    for _name, port in WORKERS:
        code = run(ssh, f"curl -s -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{port}/ready").strip()
        result[str(port)] = int(code or 0)
    return result


def wait_ready(ssh: paramiko.SSHClient, port: int) -> None:
    for _ in range(60):
        try:
            if run(ssh, f"curl -s -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{port}/ready").strip() == "200":
                return
        except RuntimeError:
            pass
        time.sleep(1)
    raise RuntimeError(f"READY_TIMEOUT_{port}")


def connect() -> paramiko.SSHClient:
    lines = (WB / "VPS103.116.105.154.txt").read_text(encoding="utf-8-sig").splitlines()
    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
    ssh.connect(lines[0].strip(), username="root", password=lines[2], look_for_keys=False, allow_agent=False, timeout=20)
    return ssh


def stage(ssh: paramiko.SSHClient) -> None:
    remote_targets = [target for _local, target, _name in TARGETS]
    before = remote_hashes(ssh, remote_targets)
    assert all(before[path] for path in remote_targets), "REMOTE_TARGET_MISSING"
    assert readiness(ssh) == {str(port): 200 for _name, port in WORKERS}, "PRE_STAGE_NOT_READY"
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    remote_stage = f"/linhhoasu/_ai_workbench/temp/fishing_scene8_10_{stamp}"
    run(ssh, f"install -d -m 700 {shlex.quote(remote_stage)}")
    sftp = ssh.open_sftp()
    try:
        for local_name, _target, remote_name in TARGETS:
            local = local_path(local_name)
            assert local.exists(), f"LOCAL_CANDIDATE_MISSING:{local_name}"
            sftp.put(str(local), f"{remote_stage}/{remote_name}")
    finally:
        sftp.close()
    staged_hashes = remote_hashes(ssh, [f"{remote_stage}/{remote_name}" for _local, _target, remote_name in TARGETS])
    expected_staged = {f"{remote_stage}/{remote_name}": digest(local_path(local_name)) for local_name, _target, remote_name in TARGETS}
    assert staged_hashes == expected_staged, "STAGE_HASH_MISMATCH"
    run(ssh, f"node --check {remote_stage}/playerPayload.js")
    config_script = (
        "const c=require('/linhhoasu/lhs/newServer/src/services/ConfigService');"
        "const t=c.loadAllTables();"
        "const ids=[8,9,10];"
        "if(!ids.every(id=>t.FishSceneConfig[id]&&t.FishSceneConfig[id].cond&&t.FishSceneConfig[id].fishes.length))process.exit(2);"
        "console.log(JSON.stringify(ids.map(id=>({id,cond:t.FishSceneConfig[id].cond,picture:t.FishSceneConfig[id].picture}))));"
    )
    config_out = run(ssh, f"NODE_ENV=test LOG_DIR= CONFIG_BIN_PATH={shlex.quote(remote_stage + '/lhs_config_fashion_20260909.bin')} node -", config_script).strip()
    data = {
        "result": "STAGED",
        "version": "fishing_scene8_10_release_v1",
        "remoteStage": remote_stage,
        "baseline": before,
        "staged": expected_staged,
        "beforePm2": pm2(ssh),
        "beforeReady": readiness(ssh),
        "configRows": json.loads(config_out.splitlines()[-1]),
        "candidateHashes": {local: digest(local_path(local)) for local, _target, _name in TARGETS},
        "productionWrites": 0,
    }
    write_json("stage.json", data)
    print(json.dumps({"result": "STAGED", "remoteStage": remote_stage, "configRows": data["configRows"], "ready": data["beforeReady"]}, ensure_ascii=False))


def deploy(ssh: paramiko.SSHClient) -> None:
    stage_info = json.loads((EVIDENCE / "stage.json").read_text(encoding="utf-8"))
    remote_stage = stage_info["remoteStage"]
    targets = [target for _local, target, _name in TARGETS]
    assert remote_hashes(ssh, targets) == stage_info["baseline"], "PREINSTALL_DRIFT"
    assert readiness(ssh) == {str(port): 200 for _name, port in WORKERS}, "PREINSTALL_NOT_READY"
    backup = remote_stage.replace("/temp/", "/backups/")
    run(ssh, f"install -d -m 700 {shlex.quote(backup)}")
    report = {"result": "INSTALLING", "backup": backup, "remoteStage": remote_stage, "beforePm2": pm2(ssh), "restarted": []}
    installed: list[tuple[int, str]] = []
    try:
        for index, (_local, target, remote_name) in enumerate(TARGETS):
            run(ssh, f"cp -a {shlex.quote(target)} {shlex.quote(backup + '/' + str(index) + '.before')}")
            staged = f"{remote_stage}/{remote_name}"
            next_path = target + ".scene8_10_next"
            run(ssh, f"install -m 644 {shlex.quote(staged)} {shlex.quote(next_path)} && mv -f {shlex.quote(next_path)} {shlex.quote(target)}")
            installed.append((index, target))
        expected = {target: digest(local_path(local)) for local, target, _name in TARGETS}
        assert remote_hashes(ssh, targets) == expected, "POST_INSTALL_HASH_MISMATCH"
        for name, port in WORKERS:
            report["restarted"].append(name)
            run(ssh, f"pm2 restart {shlex.quote(name)}", timeout=60)
            wait_ready(ssh, port)
        assert readiness(ssh) == {str(port): 200 for _name, port in WORKERS}, "POST_RESTART_NOT_READY"
        config_script = (
            "const c=require('/linhhoasu/lhs/newServer/src/services/ConfigService');"
            "const t=c.loadAllTables();"
            "console.log(JSON.stringify([8,9,10].map(id=>({id,cond:t.FishSceneConfig[id].cond}))));"
        )
        config_out = run(ssh, f"NODE_ENV=test LOG_DIR= CONFIG_BIN_PATH={shlex.quote(targets[2])} node -", config_script).strip()
        served_index = run(ssh, "curl -fsS --max-time 15 http://127.0.0.1:81/ | sha256sum").split()[0]
        # Nginx's SPA fallback serves index.html for the raw /assets URL, so
        # verify the config on disk (the browser cache-bust is checked via the
        # served index hash) and verify the loaded table above.
        served_config = run(ssh, "sha256sum /linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin").split()[0]
        report.update({"result": "DEPLOYED", "expected": expected, "afterPm2": pm2(ssh), "ready": readiness(ssh),
                       "configRows": json.loads(config_out.splitlines()[-1]), "servedIndexSha256": served_index,
                       "servedConfigSha256": served_config, "finishedAt": datetime.now(timezone.utc).isoformat(),
                       "productionWrites": 0})
        assert served_config == expected["/linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin"], "SERVED_CONFIG_MISMATCH"
        write_json("deploy.json", report)
        print(json.dumps({"result": "DEPLOYED", "backup": backup, "restarted": report["restarted"], "ready": report["ready"], "configRows": report["configRows"]}, ensure_ascii=False))
    except Exception as error:
        report.update({"result": "FAIL", "error": str(error)})
        try:
            for index, target in reversed(installed):
                run(ssh, f"install -m 644 {shlex.quote(backup + '/' + str(index) + '.before')} {shlex.quote(target)}")
            for name, port in WORKERS:
                if name in report["restarted"]:
                    run(ssh, f"pm2 restart {shlex.quote(name)}", timeout=60)
                    wait_ready(ssh, port)
            report["rollbackReady"] = readiness(ssh)
        finally:
            write_json("release-error.json", report)
        raise


def main() -> None:
    action = sys.argv[1] if len(sys.argv) > 1 else "stage"
    if action not in {"stage", "deploy"}:
        raise SystemExit("usage: deploy_fishing_scene8_10_20260924.py [stage|deploy]")
    ssh = connect()
    try:
        stage(ssh) if action == "stage" else deploy(ssh)
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
