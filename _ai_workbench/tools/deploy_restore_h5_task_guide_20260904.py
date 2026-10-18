"""Deploy the explicit H5 task-guide restore with backup and rollback."""

import hashlib
import json
import os
import posixpath
import shlex
from datetime import datetime, timezone
from pathlib import Path

import paramiko


ROOT = Path(__file__).resolve().parents[1]
CANDIDATE = ROOT / "temp" / "task_guide_restore_candidate_20260904"
WEB = "/linhhoasu/webgame/game"
FILES = {
    WEB + "/js/main.min_a6195824.js": CANDIDATE / "js" / "main.min_a6195824.js",
    WEB + "/index.html": CANDIDATE / "index.html",
}
BASELINE = {
    WEB + "/js/main.min_a6195824.js": "e0dc168341c2883e9c45bb147507e9ab06e52111e325a52b5dbe586aca494513",
    WEB + "/index.html": "a41a73ba2608cbffd5cc2775f424a8a6d31eb5889217114f4a26621ff689bd70",
}


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def run(client, command, timeout=120):
    _, stdout, stderr = client.exec_command(command, timeout=timeout)
    output = stdout.read().decode("utf-8", "replace")
    error = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError((error + output)[-5000:])
    return output


def pm2_snapshot(client):
    script = (
        'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>'
        'console.log(JSON.stringify(JSON.parse(s).filter(p=>['
        '"lhs-s1001","lhs-s1002","lhs-real-bots","lhs-real-bots-s2",'
        '"lhs-dist","lhs-admin"].includes(p.name)).map(p=>({name:p.name,'
        'pid:p.pid,status:p.pm2_env.status,restarts:p.pm2_env.restart_time})))))'
    )
    return json.loads(run(client, "pm2 jlist | node -e " + shlex.quote(script)))


def health(client, port):
    script = (
        'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{let x=JSON.parse(s),'
        'r=x.runtime||{},b=r.bots||{},m=r.mapMonsters||{};console.log(JSON.stringify('
        '{status:x.status,real:Number((b.real||{}).count)||0,virtual:Number(b.botCount)||0,'
        'totalSlots:Number(m.totalSlots)||0,multiplier:Number(m.densityMultiplier)||0,'
        'invalid:Number(m.invalid)||0}))})'
    )
    return json.loads(
        run(
            client,
            "curl -fsS http://127.0.0.1:{}/health | node -e {}".format(
                port, shlex.quote(script)
            ),
        )
    )


def main():
    expected = {remote: digest(local) for remote, local in FILES.items()}
    credential_path = Path(os.environ["LHS_PROD_CREDENTIAL_FILE"])
    credentials = credential_path.read_text(encoding="utf-8-sig").splitlines()
    client = paramiko.SSHClient()
    client.load_system_host_keys()
    client.set_missing_host_key_policy(paramiko.RejectPolicy())
    client.connect(
        credentials[0].strip(), username="root", password=credentials[2],
        look_for_keys=False, allow_agent=False, timeout=20,
    )
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup = "/linhhoasu/_ai_workbench/backups/task_guide_restore_" + stamp
    stage = "/linhhoasu/_ai_workbench/temp/task_guide_restore_" + stamp
    evidence = ROOT / "temp" / ("task_guide_restore_deploy_" + stamp + ".json")
    installed = False
    try:
        before_pm2 = pm2_snapshot(client)
        before_health = [health(client, 9200), health(client, 9201)]
        remote_before = {}
        for remote in FILES:
            remote_before[remote] = run(client, "sha256sum " + shlex.quote(remote)).split()[0]
        if remote_before != BASELINE:
            raise RuntimeError("REMOTE_DRIFT:" + json.dumps(remote_before, sort_keys=True))
        run(client, "install -d -m 700 {} {}".format(backup, stage))
        sftp = client.open_sftp()
        try:
            for remote, local in FILES.items():
                name = remote.replace("/", "__").strip("_")
                run(client, "cp -a {} {}/{}".format(remote, backup, name))
                sftp.put(str(local), posixpath.join(stage, name))
            sftp.put(
                str(ROOT / "tools" / "test_restore_h5_task_guide_20260904.js"),
                posixpath.join(stage, "test_restore_h5_task_guide_20260904.js"),
            )
        finally:
            sftp.close()
        remote_main = posixpath.join(stage, FILES.keys().__iter__().__next__().replace("/", "__").strip("_"))
        remote_index = posixpath.join(stage, list(FILES.keys())[1].replace("/", "__").strip("_"))
        run(client, "node --check " + remote_main)
        contract_output = run(
            client,
            "node {}/test_restore_h5_task_guide_20260904.js {} {}".format(
                stage, remote_main, remote_index
            ),
        ).strip()
        for remote in FILES:
            name = remote.replace("/", "__").strip("_")
            run(client, "install -m 644 {}/{} {}".format(stage, name, remote))
        installed = True
        served_main_hash = run(
            client,
            "curl -fsS http://127.0.0.1:81/js/main.min_a6195824.js | sha256sum",
        ).split()[0]
        served_index = run(client, "curl -fsS http://127.0.0.1:81/")
        after_hashes = {}
        for remote in FILES:
            after_hashes[remote] = run(client, "sha256sum " + shlex.quote(remote)).split()[0]
        after_pm2 = pm2_snapshot(client)
        after_health = [health(client, 9200), health(client, 9201)]
        checks = {
            "contract": '"result":"PASS"' in contract_output,
            "hashes": after_hashes == expected,
            "servedMainHash": served_main_hash == expected[WEB + "/js/main.min_a6195824.js"],
            "servedMarker": "20260904_task_guide_restore1" in served_index,
            "pm2Unchanged": before_pm2 == after_pm2,
            "pm2Online": len(after_pm2) == 6 and all(x["status"] == "online" for x in after_pm2),
            "health": all(
                x["status"] == "ok" and x["real"] == 580 and x["virtual"] == 580
                and x["totalSlots"] == 2466 and x["multiplier"] == 2 and x["invalid"] == 0
                for x in after_health
            ),
        }
        if not all(checks.values()):
            raise RuntimeError("POSTCHECK_FAILED:" + json.dumps(checks, sort_keys=True))
        payload = {
            "result": "PASS",
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "backup": backup,
            "checks": checks,
            "contract": contract_output,
            "beforeHashes": remote_before,
            "hashes": after_hashes,
            "servedMainHash": served_main_hash,
            "beforePm2": before_pm2,
            "afterPm2": after_pm2,
            "beforeHealth": before_health,
            "afterHealth": after_health,
        }
        evidence.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({"result": "PASS", "backup": backup, "evidence": str(evidence), "sha256": digest(evidence), "checks": checks}))
    except Exception:
        if installed:
            for remote in FILES:
                name = remote.replace("/", "__").strip("_")
                run(client, "cp -p {}/{} {}".format(backup, name, remote))
            print("ROLLBACK=restored", flush=True)
        raise
    finally:
        try:
            run(client, "rm -rf " + shlex.quote(stage))
        except Exception:
            pass
        client.close()


if __name__ == "__main__":
    main()
