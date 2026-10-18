"""Scoped, staged rollout for native power display synchronization.

The release changes only the audited server source files.  It snapshots the
live hashes first, stages/tests against a copied live source tree, installs
with a hash CAS and atomic renames, then restarts only lhs-s1001..lhs-s1006
one at a time.  No player, reward, Mongo or Redis mutation is performed by
this tool.
"""
import hashlib
import json
import shlex
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
from snapshot_web_multiserver_20260906 import connect


def run(ssh, command, input_text=None, timeout=60):
    stdin, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    if input_text is not None:
        stdin.write(input_text)
        stdin.channel.shutdown_write()
    output = stdout.read().decode("utf-8", "replace")
    error = stderr.read().decode("utf-8", "replace")
    if stdout.channel.recv_exit_status() != 0:
        raise RuntimeError((error + output)[-12000:])
    return output

WB = Path(__file__).resolve().parents[1]
WORK = WB.parent
OUT = WB / "temp" / "power_sync_fix_20260926"
MANIFEST = OUT / "release.json"
APP = "/linhhoasu/lhs/newServer"
GAME = "/linhhoasu/webgame/game"

SOURCES = [
    "src/services/ArenaReadModelService.js",
    "src/services/CrossArenaService.js",
    "src/services/BotPopulationService.js",
    "src/handlers/arena.js",
    "src/handlers/basic.js",
    "src/handlers/playerPayload.js",
    "src/handlers/chat.js",
    "src/handlers/compat.js",
    "src/handlers/fish.js",
    "src/handlers/activity.js",
    "src/handlers/guild.js",
    "src/handlers/farm.js",
    "src/handlers/farm1.js",
    "src/handlers/dungeon.js",
    "src/handlers/raid.js",
    "src/handlers/temple.js",
    "src/handlers/tower.js",
    "src/handlers/island.js",
    "src/handlers/cross-rival.js",
    "src/handlers/box.js",
    "src/net/HTTPServer.js",
    "src/net/HTTPServer1.js",
    "src/net/WSServer.js",
]
TESTS = [
    "test-arena-power-display.js",
    "test-competitions-v3.js",
    "test-core-gameplay-contract.js",
]
NODES = [
    ("lhs-s1006", 8087, 1006),
    ("lhs-s1005", 8086, 1005),
    ("lhs-s1004", 8085, 1004),
    ("lhs-s1003", 8084, 1003),
    ("lhs-s1002", 8083, 1002),
    ("lhs-s1001", 8080, 1001),
]
PORTS = [port for _, port, _ in NODES]
TARGETS = [APP + "/" + rel for rel in SOURCES]


def digest_bytes(data):
    return hashlib.sha256(data).hexdigest()


def local_digest(rel):
    return digest_bytes((WORK / "linhhoasu" / "lhs" / "newServer" / rel).read_bytes())


def save_manifest(data):
    OUT.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def node_json(ssh, body, timeout=60):
    raw = run(ssh, "node -", body, timeout=timeout)
    lines = [line.strip() for line in raw.splitlines() if line.strip()]
    for line in reversed(lines):
        if line.startswith("{") or line.startswith("["):
            try:
                return json.loads(line)
            except json.JSONDecodeError:
                continue
    raise RuntimeError("REMOTE_JSON_NOT_FOUND:" + raw[-1000:])


def parse_json_output(raw):
    """Extract the final result object even when a test prints pretty JSON."""
    decoder = json.JSONDecoder()
    found = []
    for index, char in enumerate(raw):
        if char not in "[{":
            continue
        try:
            value, _ = decoder.raw_decode(raw[index:])
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict) and ("result" in value or "tables" in value):
            found.append(value)
    if found:
        return found[-1]
    raise RuntimeError("TEST_JSON_NOT_FOUND:" + raw[-2000:])


def hashes(ssh, paths):
    body = (
        "const fs=require('fs'),c=require('crypto'),ps=" + json.dumps(paths) + ";"
        "const h=p=>fs.existsSync(p)?c.createHash('sha256').update(fs.readFileSync(p)).digest('hex'):null;"
        "console.log(JSON.stringify(Object.fromEntries(ps.map(p=>[p,h(p)]))));"
    )
    return node_json(ssh, body)


def pm2(ssh):
    selector = (
        "let s='';process.stdin.on('data',b=>s+=b).on('end',()=>{"
        "const xs=JSON.parse(s);console.log(JSON.stringify(xs.map(p=>({name:p.name,pid:p.pid,"
        "status:p.pm2_env.status,restarts:p.pm2_env.restart_time,started:p.pm2_env.pm_uptime,"
        "script:p.pm2_env.pm_exec_path,cwd:p.pm2_env.pm_cwd||p.pm2_env.cwd}))));});"
    )
    return json.loads(run(ssh, "pm2 jlist | node -e " + shlex.quote(selector)))


def readiness(ssh):
    return {
        str(port): run(
            ssh,
            "curl -s --max-time 8 -o /dev/null -w '%{http_code}' "
            + shlex.quote("http://127.0.0.1:" + str(port) + "/ready"),
        ).strip()
        for port in PORTS
    }


def wait_ready(ssh, port):
    last = ""
    for _ in range(45):
        try:
            last = run(
                ssh,
                "curl -s --max-time 8 -o /dev/null -w '%{http_code}' "
                + shlex.quote("http://127.0.0.1:" + str(port) + "/ready"),
            ).strip()
            if last == "200":
                return
        except Exception as exc:  # bounded retry while PM2 restarts
            last = str(exc)[-300:]
        time.sleep(1)
    raise RuntimeError("READY_TIMEOUT_" + str(port) + ":" + last)


def assert_unchanged_processes(before, after, restarted):
    old = {row["name"]: row for row in before}
    new = {row["name"]: row for row in after}
    for name, row in old.items():
        if name in restarted:
            continue
        if new.get(name) != row:
            raise RuntimeError("UNRELATED_PROCESS_CHANGED:" + name)


def stage(ssh):
    if MANIFEST.exists():
        raise RuntimeError("RELEASE_EXISTS_USE_VERIFY_OR_MOVE_OLD_MANIFEST")
    before = hashes(ssh, TARGETS)
    before_pm2 = pm2(ssh)
    baseline_ready = readiness(ssh)
    if any(value != "200" for value in baseline_ready.values()):
        raise RuntimeError("BASELINE_NOT_READY:" + json.dumps(baseline_ready))
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    stage_root = "/linhhoasu/_ai_workbench/temp/power_sync_fix_" + stamp
    run(ssh, "install -d -m 700 " + shlex.quote(stage_root + "/app"))
    run(
        ssh,
        "cp -a " + shlex.quote(APP + "/src") + " " + shlex.quote(stage_root + "/app/src")
        + " && cp -a " + shlex.quote(APP + "/scripts") + " " + shlex.quote(stage_root + "/app/scripts")
        + " && cp -a /linhhoasu/lhs/update " + shlex.quote(stage_root + "/update"),
    )
    with ssh.open_sftp() as sftp:
        for rel in SOURCES:
            local = WORK / "linhhoasu" / "lhs" / "newServer" / rel
            if not local.is_file():
                raise RuntimeError("LOCAL_SOURCE_MISSING:" + rel)
            sftp.put(str(local), stage_root + "/app/" + rel.replace("\\", "/"))
        for name in TESTS:
            local = WORK / "linhhoasu" / "lhs" / "newServer" / "scripts" / name
            if not local.is_file():
                raise RuntimeError("LOCAL_TEST_MISSING:" + name)
            sftp.put(str(local), stage_root + "/app/scripts/" + name)
    after = {APP + "/" + rel: local_digest(rel) for rel in SOURCES}
    staged_paths = [stage_root + "/app/" + rel for rel in SOURCES]
    staged_hashes = hashes(ssh, staged_paths)
    expected_staged = {stage_root + "/app/" + rel: after[APP + "/" + rel] for rel in SOURCES}
    if staged_hashes != expected_staged:
        raise RuntimeError("STAGE_READBACK_MISMATCH")

    env = (
        "NODE_PATH=" + shlex.quote(APP + "/node_modules")
        + " COMPETITION_APP=" + shlex.quote(stage_root + "/app")
        + " COMPETITION_MAIN=" + shlex.quote(GAME + "/js/main.min_drop100.js")
        + " CONFIG_BIN_PATH=" + shlex.quote(stage_root + "/update/resource/assets/excel/config_fashion_20260909.bin")
    )
    outputs = {}
    for name in ["test-competitions-v3.js", "test-arena-power-display.js"]:
        output = run(
            ssh,
            "cd " + shlex.quote(stage_root + "/app") + " && " + env + " node scripts/" + shlex.quote(name),
            timeout=90,
        )
        parsed = parse_json_output(output)
        if parsed.get("result") != "PASS":
            raise RuntimeError("STAGE_TEST_FAILED:" + name)
        outputs[name] = parsed
    core_output = run(
        ssh,
        "cd " + shlex.quote(stage_root + "/app") + " && " + env + " NODE_ENV=test node scripts/test-core-gameplay-contract.js",
        timeout=90,
    )
    core = parse_json_output(core_output)
    if core.get("result") != "ok":
        raise RuntimeError("STAGE_CORE_CONTRACT_FAILED")
    outputs["test-core-gameplay-contract.js"] = core
    for rel in SOURCES:
        run(ssh, "node --check " + shlex.quote(stage_root + "/app/" + rel), timeout=30)
    require_output = run(
        ssh,
        "cd " + shlex.quote(stage_root + "/app") + " && " + env + " node -e "
        + shlex.quote(
            "require(process.env.COMPETITION_APP + '/src/net/WSServer.js'); console.log(JSON.stringify({result:'PASS'}));"
        ),
        timeout=60,
    )
    outputs["WSServer-load"] = parse_json_output(require_output)
    if hashes(ssh, TARGETS) != before:
        raise RuntimeError("PRODUCTION_SOURCE_CHANGED_DURING_STAGE")
    after_pm2 = pm2(ssh)
    assert_unchanged_processes(before_pm2, after_pm2, set())
    report = {
        "status": "STAGED",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "stage": stage_root,
        "before": before,
        "after": after,
        "stagedHashes": staged_hashes,
        "baselineReady": baseline_ready,
        "beforePm2": before_pm2,
        "afterStagePm2": after_pm2,
        "tests": outputs,
        "productionWrites": 0,
        "realPlayerWrites": 0,
        "nodes": NODES,
    }
    save_manifest(report)
    print(json.dumps({"status": report["status"], "stage": stage_root, "tests": outputs}, ensure_ascii=False))


def remote_install(ssh, report):
    backup = report["backup"]
    body = r"""
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const m=MANIFEST, APP=APPROOT, STAGE=STAGEROOT, BACKUP=BACKUPROOT;
const sha=p=>fs.existsSync(p)?crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'):null;
const rel=t=>t.slice((APP+'/').length);
const meta={};
const targets=Object.keys(m.after);
for(const t of targets){
  if(!t.startsWith(APP+'/'))throw Error('TARGET_SCOPE');
  if(sha(t)!==m.before[t])throw Error('INSTALL_CAS_DRIFT:'+t);
  const staged=STAGE+'/app/'+rel(t);
  if(sha(staged)!==m.after[t])throw Error('STAGE_CAS_DRIFT:'+t);
  if(m.before[t]!==null){const st=fs.statSync(t);meta[t]={mode:st.mode&0o7777,uid:st.uid,gid:st.gid,mtimeMs:st.mtimeMs};}
}
fs.mkdirSync(BACKUP,{recursive:false,mode:0o700});
for(const t of targets){if(m.before[t]===null)continue;const b=BACKUP+'/app/'+rel(t);fs.mkdirSync(path.dirname(b),{recursive:true,mode:0o700});fs.copyFileSync(t,b);}
fs.writeFileSync(BACKUP+'/manifest.json',JSON.stringify({before:m.before,after:m.after,meta},null,2),{flag:'wx',mode:0o600});
function writeAtomic(t,src,expected){const info=meta[t]||{mode:0o644,uid:0,gid:0};const tmp=t+'.power-sync-'+process.pid+'.tmp';if(fs.existsSync(tmp))throw Error('TEMP_TARGET_EXISTS:'+t);const data=fs.readFileSync(src);fs.writeFileSync(tmp,data,{flag:'wx',mode:info.mode});try{fs.chownSync(tmp,info.uid,info.gid);}catch(_){}try{fs.chmodSync(tmp,info.mode);}catch(_){}fs.renameSync(tmp,t);if(sha(t)!==expected)throw Error('WRITE_HASH_FAILED:'+t);}
const installed=[];
try{for(const t of targets){writeAtomic(t,STAGE+'/app/'+rel(t),m.after[t]);installed.push(t);}}
catch(error){for(const t of installed.reverse()){if(m.before[t]===null){if(sha(t)===m.after[t])fs.unlinkSync(t);}else if(sha(t)===m.after[t])writeAtomic(t,BACKUP+'/app/'+rel(t),m.before[t]);}throw error;}
console.log(JSON.stringify({result:'PASS',backup:BACKUP,files:targets.length,hashes:Object.fromEntries(targets.map(t=>[t,sha(t)]))}));
"""
    body = body.replace("MANIFEST", json.dumps({"before": report["before"], "after": report["after"]}))
    body = body.replace("APPROOT", json.dumps(APP)).replace("STAGEROOT", json.dumps(report["stage"]))
    body = body.replace("BACKUPROOT", json.dumps(backup))
    return node_json(ssh, body, timeout=120)


def remote_rollback(ssh, report):
    body = r"""
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const m=MANIFEST, APP=APPROOT, BACKUP=BACKUPROOT;
const sha=p=>fs.existsSync(p)?crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'):null;
const rel=t=>t.slice((APP+'/').length);
const saved=JSON.parse(fs.readFileSync(BACKUP+'/manifest.json','utf8')),meta=saved.meta||{};
function restore(t){const info=meta[t]||{mode:0o644,uid:0,gid:0};const src=BACKUP+'/app/'+rel(t),tmp=t+'.power-sync-rollback-'+process.pid+'.tmp';if(fs.existsSync(tmp))throw Error('TEMP_TARGET_EXISTS:'+t);fs.copyFileSync(src,tmp);try{fs.chownSync(tmp,info.uid,info.gid);}catch(_){}try{fs.chmodSync(tmp,info.mode);}catch(_){}fs.renameSync(tmp,t);if(sha(t)!==m.before[t])throw Error('ROLLBACK_HASH_FAILED:'+t);}
for(const t of Object.keys(m.after)){const current=sha(t);if(current===m.before[t])continue;if(current!==m.after[t])throw Error('ROLLBACK_EXTERNAL_DRIFT:'+t);if(m.before[t]===null){fs.unlinkSync(t);}else restore(t);}
console.log(JSON.stringify({result:'PASS',hashes:Object.fromEntries(Object.keys(m.before).map(t=>[t,sha(t)]))}));
"""
    body = body.replace("MANIFEST", json.dumps({"before": report["before"], "after": report["after"]}))
    body = body.replace("APPROOT", json.dumps(APP)).replace("BACKUPROOT", json.dumps(report["backup"]))
    return node_json(ssh, body, timeout=120)


def live_contract_tests(ssh, test_root=None):
    # Test scripts are local/release artifacts and are not part of the live
    # application tree.  Run them from the staged copy while pointing their
    # app under test at the installed live source.
    test_root = test_root or APP
    env = (
        "NODE_PATH=" + shlex.quote(APP + "/node_modules")
        + " COMPETITION_APP=" + shlex.quote(APP)
        + " COMPETITION_MAIN=" + shlex.quote(GAME + "/js/main.min_drop100.js")
    )
    if test_root != APP:
        env += " CONFIG_BIN_PATH=" + shlex.quote(test_root + "/update/resource/assets/excel/config_fashion_20260909.bin")
    out = {}
    for name in ["test-competitions-v3.js", "test-arena-power-display.js"]:
        raw = run(
            ssh,
            "cd " + shlex.quote(APP) + " && " + env + " node " + shlex.quote(test_root + "/app/scripts/" + name if test_root != APP else "scripts/" + name),
            timeout=90,
        )
        out[name] = parse_json_output(raw)
    raw = run(
        ssh,
        "cd " + shlex.quote(APP) + " && " + env + " NODE_ENV=test node "
        + shlex.quote(test_root + "/app/scripts/test-core-gameplay-contract.js" if test_root != APP else "scripts/test-core-gameplay-contract.js"),
        timeout=90,
    )
    out["test-core-gameplay-contract.js"] = parse_json_output(raw)
    return out


def deploy(ssh):
    report = json.loads(MANIFEST.read_text(encoding="utf-8"))
    if report.get("status") != "STAGED":
        raise RuntimeError("STAGED_RELEASE_REQUIRED")
    if hashes(ssh, list(report["before"])) != report["before"]:
        raise RuntimeError("PREDEPLOY_SOURCE_DRIFT")
    if hashes(ssh, list(report["stagedHashes"])) != report["stagedHashes"]:
        raise RuntimeError("STAGED_FILES_DRIFT")
    if any(value != "200" for value in readiness(ssh).values()):
        raise RuntimeError("PREDEPLOY_NOT_READY")
    for rel in SOURCES:
        target = APP + "/" + rel
        if local_digest(rel) != report["after"][target]:
            raise RuntimeError("LOCAL_SOURCE_DRIFT:" + rel)
    report["backup"] = "/linhhoasu/_ai_workbench/backups/power_sync_fix_20260926_" + datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    report["deployBeforePm2"] = pm2(ssh)
    report["status"] = "DEPLOYING"
    report["restarted"] = []
    save_manifest(report)
    try:
        installed = remote_install(ssh, report)
        report["remoteInstall"] = installed
        save_manifest(report)
        for name, port, sid in NODES:
            run(ssh, "pm2 restart " + shlex.quote(name), timeout=60)
            report["restarted"].append(name)
            save_manifest(report)
            wait_ready(ssh, port)
            if readiness(ssh).get(str(port)) != "200":
                raise RuntimeError("NODE_NOT_READY:" + name)
        report["liveTests"] = live_contract_tests(ssh, report["stage"])
        if any(value.get("result") not in ("PASS", "ok") for value in report["liveTests"].values()):
            raise RuntimeError("LIVE_CONTRACT_TEST_FAILED")
        report["hashes"] = hashes(ssh, list(report["after"]))
        if report["hashes"] != report["after"]:
            raise RuntimeError("FINAL_HASH_DRIFT")
        report["ready"] = readiness(ssh)
        if any(value != "200" for value in report["ready"].values()):
            raise RuntimeError("FINAL_NOT_READY")
        report["afterPm2"] = pm2(ssh)
        assert_unchanged_processes(report["deployBeforePm2"], report["afterPm2"], set(report["restarted"]))
        report["status"] = "DEPLOYED"
        report["productionWrites"] = 0
        report["realPlayerWrites"] = 0
        save_manifest(report)
        print(json.dumps({"status": report["status"], "backup": report["backup"], "ready": report["ready"], "restarted": report["restarted"], "tests": report["liveTests"]}, ensure_ascii=False))
    except Exception as error:
        report["error"] = str(error)[-6000:]
        save_manifest(report)
        try:
            rollback = remote_rollback(ssh, report)
            report["rollback"] = rollback
            for name, port, _ in NODES:
                if name not in report["restarted"]:
                    continue
                run(ssh, "pm2 restart " + shlex.quote(name), timeout=60)
                wait_ready(ssh, port)
            report["rollbackReady"] = readiness(ssh)
            report["status"] = "ROLLED_BACK"
            save_manifest(report)
        except Exception as rollback_error:
            report["rollbackError"] = str(rollback_error)[-6000:]
            report["status"] = "ROLLBACK_BLOCKED"
            save_manifest(report)
        raise


def verify(ssh):
    report = json.loads(MANIFEST.read_text(encoding="utf-8"))
    current = hashes(ssh, list(report.get("after", {})))
    ready = readiness(ssh)
    result = {
        "status": report.get("status"),
        "hashesMatch": current == report.get("after", {}),
        "hashes": current,
        "ready": ready,
        "productionWrites": 0,
    }
    print(json.dumps(result, ensure_ascii=False))
    if not result["hashesMatch"] or any(value != "200" for value in ready.values()):
        raise SystemExit(2)


def main():
    action = sys.argv[1] if len(sys.argv) > 1 else "stage"
    ssh = connect()
    try:
        if action == "stage":
            stage(ssh)
        elif action == "deploy":
            deploy(ssh)
        elif action == "verify":
            verify(ssh)
        else:
            raise SystemExit("usage: release_power_sync_fix_20260926.py [stage|deploy|verify]")
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
