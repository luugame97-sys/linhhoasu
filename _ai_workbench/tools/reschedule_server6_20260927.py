"""Move S6's production opening gate to 2026-09-27 10:00 Asia/Bangkok.

The apply path is deliberately narrow: it CAS-updates the identity gameserver
row, the S6 PM2 launch stanza, and the S6 bot gate, then restarts only S6
processes and performs read-only launch QA.  A remote backup is written before
any mutation and the changed pieces are restored if a later step fails.
"""
import hashlib
import json
import shlex
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from snapshot_web_multiserver_20260906 import connect, run

APP = "/linhhoasu/lhs/newServer"
SID = 1006
OLD = 1790424000000  # 2026-09-26 19:00:00 +07:00
TARGET = 1790478000000  # 2026-09-27 10:00:00 +07:00
IDENTITY_DB = "lhs_s1001"
FILES = {
    "ecosystem": APP + "/ecosystem.config.js",
    "bot": APP + "/scripts/start-scheduled-bots-s6.js",
}
PROCESS_NAMES = ("lhs-s1006", "lhs-real-bots-s6")
PORT = 8087
WB = Path(__file__).resolve().parents[1]
OUT = WB / "temp" / "server6_reschedule_20260927"


def node(ssh, source, timeout=60):
    command = "node -e " + shlex.quote(source)
    stdin, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    output = stdout.read().decode("utf-8")
    if stdout.channel.recv_exit_status() != 0:
        raise RuntimeError("REMOTE_NODE_FAILED: " + stderr.read().decode("utf-8")[-1500:])
    return output


def run_long(ssh, command, input_text=None, timeout=180):
    stdin, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    if input_text is not None:
        stdin.write(input_text)
        stdin.channel.shutdown_write()
    output = stdout.read().decode("utf-8")
    if stdout.channel.recv_exit_status() != 0:
        raise RuntimeError("REMOTE_COMMAND_FAILED: " + stderr.read().decode("utf-8")[-2000:])
    return output


def pm2_state(ssh):
    rows = json.loads(run(ssh, "pm2 jlist"))
    result = []
    for item in rows:
        if item.get("name") not in PROCESS_NAMES:
            continue
        env = (item.get("pm2_env") or {}).get("env") or {}
        result.append({
            "name": item.get("name"),
            "status": (item.get("pm2_env") or {}).get("status"),
            "pid": item.get("pid"),
            "restarts": (item.get("pm2_env") or {}).get("restart_time"),
            "env": {key: env.get(key) for key in (
                "SERVER_ID", "HTTP_PORT", "WS_PORT", "SERVER_OPEN_TIME",
                "MONGO_URI", "REDIS_PREFIX", "BOT_WORKER_SERVER_ID",
                "BOT_WORKER_WS_URL")},
        })
    return sorted(result, key=lambda item: item["name"])


def mongo_state(ssh):
    source = r"""
const {MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');
(async()=>{
  const c=new MongoClient('mongodb://127.0.0.1:27017'); await c.connect();
  const identity=c.db('lhs_s1001'); const s6=c.db('lhs_s1006');
  const row=await identity.collection('gameservers').findOne({serverId:1006});
  const aliases=await s6.collection('gameservers').find({serverId:1006}).toArray();
  const players=await s6.collection('players').countDocuments({});
  console.log(JSON.stringify({now:Date.now(),row,aliases,players})); await c.close();
})().catch(e=>{console.error(e.message);process.exit(1)});
"""
    return json.loads(node(ssh, source))


def read_files(ssh):
    result = {}
    with ssh.open_sftp() as sftp:
        for key, path in FILES.items():
            data = sftp.open(path, "rb").read()
            result[key] = {
                "path": path,
                "data": data,
                "sha256": hashlib.sha256(data).hexdigest(),
                "bytes": len(data),
            }
    return result


def public_file_snapshot(files):
    return {key: {k: value for k, value in item.items() if k != "data"}
            for key, item in files.items()}


def current_state(ssh):
    files = read_files(ssh)
    return {
        "at": datetime.now(timezone.utc).isoformat(),
        "mongo": mongo_state(ssh),
        "pm2": pm2_state(ssh),
        "files": public_file_snapshot(files),
        "oldCounts": {
            "ecosystem": files["ecosystem"]["data"].decode("utf-8").count(str(OLD)),
            "bot": files["bot"]["data"].decode("utf-8").count(str(OLD)),
        },
        "targetCounts": {
            "ecosystem": files["ecosystem"]["data"].decode("utf-8").count(str(TARGET)),
            "bot": files["bot"]["data"].decode("utf-8").count(str(TARGET)),
        },
    }, files


def wait_ready(ssh):
    last = ""
    for _ in range(30):
        try:
            last = json.loads(run(ssh, f"curl -fsS --max-time 5 http://127.0.0.1:{PORT}/ready"))
            if last.get("status") == "ok" and last.get("checks") == {"mongo": True, "redis": True}:
                return last
        except Exception as error:  # bounded retry around a rolling PM2 restart
            last = str(error)
        time.sleep(1)
    raise RuntimeError("S6_NOT_READY:" + json.dumps(last, ensure_ascii=False))


def save_remote_backup(ssh, files, state, backup):
    run(ssh, "install -d -m 700 " + shlex.quote(backup))
    with ssh.open_sftp() as sftp:
        for key, item in files.items():
            path = backup + "/" + key + ".before"
            with sftp.open(path, "wb") as handle:
                handle.write(item["data"])
            sftp.chmod(path, 0o600)
        state_path = backup + "/state.json"
        with sftp.open(state_path, "wb") as handle:
            handle.write(json.dumps(state, ensure_ascii=False, indent=2).encode("utf-8"))
        sftp.chmod(state_path, 0o600)
    run(ssh, "cp -p /root/.pm2/dump.pm2 " + shlex.quote(backup + "/dump.pm2.before")
        + " && chmod 600 " + shlex.quote(backup + "/dump.pm2.before"))


def write_file_cas(ssh, path, before, after):
    with ssh.open_sftp() as sftp:
        actual = sftp.open(path, "rb").read()
        if actual != before:
            raise RuntimeError("CAS_FILE_DRIFT:" + path)
        temp = path + ".reschedule_20260927.tmp"
        with sftp.open(temp, "wb") as handle:
            handle.write(after)
        sftp.chmod(temp, 0o640)
        sftp.posix_rename(temp, path)


def patch_files(files):
    ecosystem = files["ecosystem"]["data"].decode("utf-8")
    old_line = "const server6OpenTime = " + str(OLD) + ";"
    new_line = "const server6OpenTime = " + str(TARGET) + ";"
    if ecosystem.count(old_line) != 1:
        raise RuntimeError("S6_ECOSYSTEM_OPEN_LINE_UNEXPECTED")
    if "// S6_LAUNCH_20260926: 19:00 Asia/Bangkok;" not in ecosystem:
        raise RuntimeError("S6_ECOSYSTEM_HEADER_UNEXPECTED")
    ecosystem = ecosystem.replace(
        "// S6_LAUNCH_20260926: 19:00 Asia/Bangkok;",
        "// S6_LAUNCH_20260927: 10:00 Asia/Bangkok;",
        1,
    ).replace(old_line, new_line, 1)
    bot = files["bot"]["data"].decode("utf-8")
    old_bot = "const S6_OPEN_TIME = " + str(OLD) + ";"
    new_bot = "const S6_OPEN_TIME = " + str(TARGET) + ";"
    if bot.count(old_bot) != 1:
        raise RuntimeError("S6_BOT_OPEN_LINE_UNEXPECTED")
    bot = bot.replace(old_bot, new_bot, 1)
    return {"ecosystem": ecosystem.encode("utf-8"), "bot": bot.encode("utf-8")}


def update_mongo(ssh, row, old, new):
    oid = str(row["_id"])
    source = (
        "const {MongoClient,ObjectId}=require(" + json.dumps(APP + "/node_modules/mongodb") + ");"
        "(async()=>{const c=new MongoClient('mongodb://127.0.0.1:27017');await c.connect();"
        "const q={_id:new ObjectId(" + json.dumps(oid) + "),serverId:1006,openTime:" + str(old) + "};"
        "const x=await c.db('lhs_s1001').collection('gameservers').updateOne(q,{$set:{openTime:" + str(new) + "}});"
        "console.log(JSON.stringify({matched:Number(x.matchedCount??x.n??0),modified:Number(x.modifiedCount??x.nModified??0)}));"
        "await c.close()})().catch(e=>{console.error(e.message);process.exit(1)});"
    )
    result = json.loads(node(ssh, source))
    if result.get("matched") != 1 or result.get("modified") != 1:
        raise RuntimeError("S6_MONGO_CAS_FAILED:" + json.dumps(result))
    return result


def restart_s6(ssh):
    run(ssh, "cd " + APP + " && pm2 restart ecosystem.config.js --only lhs-s1006 --update-env")
    run(ssh, "cd " + APP + " && pm2 restart ecosystem.config.js --only lhs-real-bots-s6 --update-env")
    ready = wait_ready(ssh)
    run(ssh, "pm2 save")
    return ready


def run_launch_qa(ssh):
    source = (WB / "tools" / "qa_server6_launch_20260926.js").read_text(encoding="utf-8")
    source = source.replace("const OPEN = " + str(OLD) + ";", "const OPEN = " + str(TARGET) + ";")
    source = source.replace("qa_s6_gate_readonly_20260920", "qa_s6_reschedule_readonly_20260927")
    output = run_long(ssh, "node -", input_text=source, timeout=180)
    line = next((item for item in reversed(output.splitlines()) if item.startswith("SERVER6_LAUNCH_QA=")), None)
    if not line:
        raise RuntimeError("S6_QA_OUTPUT_MISSING:" + output[-1000:])
    return json.loads(line.split("=", 1)[1])


def restore_remote(ssh, backup, old):
    with ssh.open_sftp() as sftp:
        for key, path in FILES.items():
            source = backup + "/" + key + ".before"
            data = sftp.open(source, "rb").read()
            temp = path + ".rollback_20260927.tmp"
            with sftp.open(temp, "wb") as handle:
                handle.write(data)
            sftp.chmod(temp, 0o640)
            sftp.posix_rename(temp, path)
    source = (
        "const {MongoClient,ObjectId}=require(" + json.dumps(APP + "/node_modules/mongodb") + ");"
        "(async()=>{const c=new MongoClient('mongodb://127.0.0.1:27017');await c.connect();"
        "const x=await c.db('lhs_s1001').collection('gameservers').updateOne({_id:new ObjectId(" +
        json.dumps(str(json.loads(run(ssh, "cat " + shlex.quote(backup + "/state.json")))["mongo"]["row"]["_id"])) +
        "),serverId:1006,openTime:" + str(TARGET) + "},{$set:{openTime:" + str(old) + "}});"
        "console.log(JSON.stringify({matched:Number(x.matchedCount??x.n??0),modified:Number(x.modifiedCount??x.modifiedCount??0)}));"
        "await c.close()})().catch(e=>{console.error(e.message);process.exit(1)});"
    )
    node(ssh, source)
    run(ssh, "cd " + APP + " && pm2 restart ecosystem.config.js --only lhs-s1006 --update-env")
    run(ssh, "cd " + APP + " && pm2 restart ecosystem.config.js --only lhs-real-bots-s6 --update-env")
    wait_ready(ssh)
    run(ssh, "pm2 save")


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    mode = sys.argv[1] if len(sys.argv) > 1 else "audit"
    if mode not in ("audit", "apply"):
        raise SystemExit("usage: reschedule_server6_20260927.py [audit|apply]")
    OUT.mkdir(parents=True, exist_ok=True)
    ssh = connect()
    backup = None
    changed = False
    try:
        before, files = current_state(ssh)
        row = before["mongo"]["row"]
        if not row or int(row.get("serverId", 0)) != SID:
            raise RuntimeError("S6_METADATA_MISSING")
        if mode == "audit":
            evidence = {"mode": mode, "target": TARGET, "targetLocal": "2026-09-27 10:00:00 +07:00", "before": before}
            path = OUT / "audit.json"
            path.write_text(json.dumps(evidence, ensure_ascii=False, indent=2), encoding="utf-8")
            print(json.dumps({"evidence": str(path), "result": evidence}, ensure_ascii=False))
            return
        if before["mongo"]["now"] >= TARGET:
            raise RuntimeError("TARGET_OPEN_TIME_ALREADY_REACHED")
        if row.get("openTime") != OLD or row.get("running") is not True or row.get("status") != 1:
            raise RuntimeError("S6_MONGO_STATE_CHANGED")
        if before["oldCounts"] != {"ecosystem": 1, "bot": 1}:
            raise RuntimeError("S6_RUNTIME_FILES_CHANGED")
        if before["targetCounts"] != {"ecosystem": 0, "bot": 0}:
            raise RuntimeError("S6_TARGET_ALREADY_PRESENT_OR_MIXED")
        for item in before["pm2"]:
            if item.get("status") != "online" or item.get("env", {}).get("SERVER_OPEN_TIME") != OLD:
                raise RuntimeError("S6_PM2_STATE_CHANGED:" + json.dumps(item, ensure_ascii=False))
        stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        backup = "/linhhoasu/_ai_workbench/backups/server6_reschedule_20260927_" + stamp
        save_remote_backup(ssh, files, before, backup)
        candidates = patch_files(files)
        for key, item in files.items():
            write_file_cas(ssh, item["path"], item["data"], candidates[key])
        changed = True
        mongo_result = update_mongo(ssh, row, OLD, TARGET)
        ready = restart_s6(ssh)
        qa = run_launch_qa(ssh)
        after, _ = current_state(ssh)
        after_row = after["mongo"]["row"]
        if after_row.get("openTime") != TARGET:
            raise RuntimeError("S6_READBACK_MONGO_FAILED")
        if any(item.get("env", {}).get("SERVER_OPEN_TIME") != TARGET for item in after["pm2"]):
            raise RuntimeError("S6_READBACK_PM2_FAILED")
        if after["targetCounts"] != {"ecosystem": 1, "bot": 1} or after["oldCounts"] != {"ecosystem": 0, "bot": 0}:
            raise RuntimeError("S6_READBACK_FILES_FAILED")
        evidence = {
            "mode": mode, "result": "PASS", "serverId": SID,
            "oldOpenTime": OLD, "newOpenTime": TARGET,
            "newLocal": "2026-09-27 10:00:00 +07:00", "backup": backup,
            "mongoUpdate": mongo_result, "ready": ready, "qa": qa,
            "before": before, "after": after,
        }
        path = OUT / "apply.json"
        path.write_text(json.dumps(evidence, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps({"evidence": str(path), "result": evidence}, ensure_ascii=False))
    except Exception:
        if mode == "apply" and changed and backup:
            try:
                restore_remote(ssh, backup, OLD)
            except Exception as rollback_error:
                raise RuntimeError("RESCHEDULE_FAILED_ROLLBACK_FAILED:" + str(rollback_error))
        raise
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
