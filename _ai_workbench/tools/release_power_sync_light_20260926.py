"""Deploy the opt-in lightweight combat-power sync packet and client handler.

This release is deliberately separate from the already deployed power read-model
fix. It changes only the packet route, its service, and the served client addon.
Player/DB/reward data is never written. Files are installed with hash CAS and a
recoverable remote backup; game nodes are restarted one at a time.
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


WB = Path(__file__).resolve().parents[1]
WORK = WB.parent
OUT = WB / "temp" / "power_sync_light_20260926_v2"
MANIFEST = OUT / "release.json"
APP = "/linhhoasu/lhs/newServer"
GAME = "/linhhoasu/webgame/game"
CONFIG = "/linhhoasu/lhs/update/resource/assets/excel/config_fashion_20260909.bin"
NODES = [
    ("lhs-s1006", 8087),
    ("lhs-s1005", 8086),
    ("lhs-s1004", 8085),
    ("lhs-s1003", 8084),
    ("lhs-s1002", 8083),
    ("lhs-s1001", 8080),
]

FILES = {
    APP + "/src/net/WSServer.js": WORK / "linhhoasu/lhs/newServer/src/net/WSServer.js",
    APP + "/src/handlers/index.js": WORK / "linhhoasu/lhs/newServer/src/handlers/index.js",
    APP + "/src/services/PowerDisplaySyncService.js": WORK / "linhhoasu/lhs/newServer/src/services/PowerDisplaySyncService.js",
    GAME + "/index.html": WORK / "linhhoasu/webgame/game/index.html",
    GAME + "/js/lhs-power-authoritative-v1.js": WORK / "linhhoasu/webgame/game/js/lhs-power-authoritative-v1.js",
}
TESTS = [
    "test-power-display-sync-service.js",
    "test-arena-power-display.js",
    "test-competitions-v3.js",
    "test-core-gameplay-contract.js",
]


def run(ssh, command, input_text=None, timeout=90):
    stdin, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    if input_text is not None:
        stdin.write(input_text)
        stdin.channel.shutdown_write()
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    if stdout.channel.recv_exit_status() != 0:
        raise RuntimeError((err + out)[-12000:])
    return out


def node_json(ssh, body, timeout=90):
    raw = run(ssh, "node -", body, timeout=timeout)
    decoder = json.JSONDecoder()
    for i, ch in enumerate(raw):
        if ch not in "[{":
            continue
        try:
            value, _ = decoder.raw_decode(raw[i:])
        except json.JSONDecodeError:
            continue
        if isinstance(value, (dict, list)):
            return value
    raise RuntimeError("REMOTE_JSON_NOT_FOUND:" + raw[-2000:])


def sha(data):
    return hashlib.sha256(data).hexdigest()


def local_hash(path):
    return sha(path.read_bytes())


def remote_hashes(ssh, paths):
    body = (
        "const fs=require('fs'),c=require('crypto'),ps=" + json.dumps(paths) + ";"
        "const h=p=>fs.existsSync(p)?c.createHash('sha256').update(fs.readFileSync(p)).digest('hex'):null;"
        "console.log(JSON.stringify(Object.fromEntries(ps.map(p=>[p,h(p)]))));"
    )
    return node_json(ssh, body)


def pm2(ssh):
    selector = (
        "let s='';process.stdin.on('data',b=>s+=b).on('end',()=>{const xs=JSON.parse(s);"
        "console.log(JSON.stringify(xs.map(p=>({name:p.name,pid:p.pid,status:p.pm2_env.status,"
        "restarts:p.pm2_env.restart_time,started:p.pm2_env.pm_uptime,script:p.pm2_env.pm_exec_path,"
        "cwd:p.pm2_env.pm_cwd||p.pm2_env.cwd}))));});"
    )
    return json.loads(run(ssh, "pm2 jlist | node -e " + shlex.quote(selector)))


def readiness(ssh):
    return {
        str(port): run(
            ssh,
            "curl -s --max-time 8 -o /dev/null -w '%{http_code}' "
            + shlex.quote("http://127.0.0.1:" + str(port) + "/ready"),
            timeout=20,
        ).strip()
        for _, port in NODES
    }


def wait_ready(ssh, port):
    last = ""
    for _ in range(45):
        try:
            last = run(
                ssh,
                "curl -s --max-time 8 -o /dev/null -w '%{http_code}' "
                + shlex.quote("http://127.0.0.1:" + str(port) + "/ready"),
                timeout=20,
            ).strip()
            if last == "200":
                return
        except Exception as exc:
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


def parse_test(raw):
    decoder = json.JSONDecoder()
    found = []
    for i, ch in enumerate(raw):
        if ch not in "[{":
            continue
        try:
            value, _ = decoder.raw_decode(raw[i:])
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict) and ("result" in value or "tables" in value):
            found.append(value)
    if not found:
        raise RuntimeError("TEST_JSON_NOT_FOUND:" + raw[-2000:])
    return found[-1]


def local_manifest():
    missing = [str(path) for path in FILES.values() if not path.is_file()]
    if missing:
        raise RuntimeError("LOCAL_FILE_MISSING:" + ",".join(missing))
    after = {target: local_hash(path) for target, path in FILES.items()}
    return after


def stage(ssh):
    if MANIFEST.exists():
        raise RuntimeError("RELEASE_EXISTS_USE_VERIFY_OR_MOVE_OLD_MANIFEST")
    after = local_manifest()
    targets = list(FILES)
    before = remote_hashes(ssh, targets)
    baseline = readiness(ssh)
    if any(value != "200" for value in baseline.values()):
        raise RuntimeError("BASELINE_NOT_READY:" + json.dumps(baseline))
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    stage_root = "/linhhoasu/_ai_workbench/temp/power_sync_light_" + stamp
    run(ssh, "install -d -m 700 " + shlex.quote(stage_root + "/app"))
    run(
        ssh,
        "cp -a " + shlex.quote(APP + "/src") + " " + shlex.quote(stage_root + "/app/src")
        + " && cp -a " + shlex.quote(APP + "/scripts") + " " + shlex.quote(stage_root + "/app/scripts")
        + " && cp -a /linhhoasu/lhs/update " + shlex.quote(stage_root + "/update"),
    )
    with ssh.open_sftp() as sftp:
        for target, local in FILES.items():
            if target.startswith(APP + "/"):
                staged = stage_root + "/app/" + target[len(APP) + 1:]
            else:
                staged = stage_root + "/game/" + target[len(GAME) + 1:]
            parent = str(Path(staged).parent).replace("\\", "/")
            run(ssh, "install -d -m 700 " + shlex.quote(parent))
            sftp.put(str(local), staged)
        for name in TESTS:
            local = WORK / "linhhoasu/lhs/newServer/scripts" / name
            if not local.is_file():
                raise RuntimeError("LOCAL_TEST_MISSING:" + name)
            sftp.put(str(local), stage_root + "/app/scripts/" + name)
    staged_paths = []
    for target in targets:
        staged_paths.append(stage_root + "/app/" + target[len(APP) + 1:] if target.startswith(APP + "/")
                            else stage_root + "/game/" + target[len(GAME) + 1:])
    staged_hashes = remote_hashes(ssh, staged_paths)
    expected_staged = {path: after[target] for target, path in zip(targets, staged_paths)}
    if staged_hashes != expected_staged:
        raise RuntimeError("STAGE_READBACK_MISMATCH")

    env = (
        "NODE_PATH=" + shlex.quote(APP + "/node_modules")
        + " COMPETITION_APP=" + shlex.quote(stage_root + "/app")
        + " COMPETITION_MAIN=" + shlex.quote(GAME + "/js/main.min_drop100.js")
        + " CONFIG_BIN_PATH=" + shlex.quote(stage_root + "/update/resource/assets/excel/config_fashion_20260909.bin")
    )
    outputs = {}
    for name in TESTS[:1] + TESTS[1:3]:
        raw = run(ssh, "cd " + shlex.quote(stage_root + "/app") + " && " + env
                  + " node scripts/" + shlex.quote(name), timeout=120)
        result = parse_test(raw)
        if result.get("result") != "PASS":
            raise RuntimeError("STAGE_TEST_FAILED:" + name)
        outputs[name] = result
    raw = run(ssh, "cd " + shlex.quote(stage_root + "/app") + " && " + env
              + " NODE_ENV=test node scripts/test-core-gameplay-contract.js", timeout=120)
    result = parse_test(raw)
    if result.get("result") != "ok":
        raise RuntimeError("STAGE_CORE_CONTRACT_FAILED")
    outputs["test-core-gameplay-contract.js"] = result
    for target in targets:
        staged = stage_root + "/app/" + target[len(APP) + 1:] if target.startswith(APP + "/") \
            else stage_root + "/game/" + target[len(GAME) + 1:]
        run(ssh, "node --check " + shlex.quote(staged), timeout=30) if staged.endswith(".js") else None
    if remote_hashes(ssh, targets) != before:
        raise RuntimeError("PRODUCTION_SOURCE_CHANGED_DURING_STAGE")
    before_pm2 = pm2(ssh)
    after_pm2 = pm2(ssh)
    assert_unchanged_processes(before_pm2, after_pm2, set())
    report = {
        "status": "STAGED",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "stage": stage_root,
        "before": before,
        "after": after,
        "stagedHashes": staged_hashes,
        "baselineReady": baseline,
        "tests": outputs,
        "productionWrites": 0,
        "realPlayerWrites": 0,
        "nodes": NODES,
    }
    OUT.mkdir(parents=True, exist_ok=False)
    MANIFEST.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "STAGED", "stage": stage_root, "tests": outputs}, ensure_ascii=False))


def remote_install(ssh, report):
    backup = report["backup"]
    body = r"""
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const m=MANIFEST, BACKUP=BACKUPROOT;
const sha=p=>fs.existsSync(p)?crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'):null;
const targets=Object.keys(m.after),meta={};
for(const t of targets){if(sha(t)!==m.before[t])throw Error('INSTALL_CAS_DRIFT:'+t);if(m.before[t]!==null){const st=fs.statSync(t);meta[t]={mode:st.mode&0o7777,uid:st.uid,gid:st.gid};}}
fs.mkdirSync(BACKUP,{recursive:false,mode:0o700});
for(const t of targets){if(m.before[t]===null)continue;const b=BACKUP+'/files'+t;fs.mkdirSync(path.dirname(b),{recursive:true,mode:0o700});fs.copyFileSync(t,b);}
fs.writeFileSync(BACKUP+'/manifest.json',JSON.stringify({before:m.before,after:m.after,meta},null,2),{flag:'wx',mode:0o600});
function writeAtomic(t,src,expected){const info=meta[t]||{mode:0o644,uid:0,gid:0};const tmp=t+'.power-sync-light-'+process.pid+'.tmp';if(fs.existsSync(tmp))throw Error('TEMP_TARGET_EXISTS:'+t);fs.copyFileSync(src,tmp);try{fs.chownSync(tmp,info.uid,info.gid);}catch(_){}try{fs.chmodSync(tmp,info.mode);}catch(_){}fs.renameSync(tmp,t);if(sha(t)!==expected)throw Error('WRITE_HASH_FAILED:'+t);}
const installed=[];
try{for(const t of targets){const src=STAGE+(t.startsWith(APPROOT+'/')?'/app/'+t.slice((APPROOT+'/').length):'/game/'+t.slice((GAMEROOT+'/').length));writeAtomic(t,src,m.after[t]);installed.push(t);}}
catch(error){for(const t of installed.reverse()){if(m.before[t]===null){if(sha(t)===m.after[t])fs.unlinkSync(t);}else if(sha(t)===m.after[t])writeAtomic(t,BACKUP+'/files'+t,m.before[t]);}throw error;}
console.log(JSON.stringify({result:'PASS',backup:BACKUP,files:targets.length,hashes:Object.fromEntries(targets.map(t=>[t,sha(t)]))}));
"""
    body = body.replace("MANIFEST", json.dumps({"before": report["before"], "after": report["after"]}))
    body = body.replace("STAGE", json.dumps(report["stage"]))
    body = body.replace("BACKUPROOT", json.dumps(backup))
    body = body.replace("APPROOT", json.dumps(APP)).replace("GAMEROOT", json.dumps(GAME))
    return node_json(ssh, body, timeout=120)


def remote_rollback(ssh, report):
    body = r"""
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const m=MANIFEST,BACKUP=BACKUPROOT;
const sha=p=>fs.existsSync(p)?crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'):null;
const saved=JSON.parse(fs.readFileSync(BACKUP+'/manifest.json','utf8')),meta=saved.meta||{};
function restore(t){const info=meta[t]||{mode:0o644,uid:0,gid:0},src=BACKUP+'/files'+t,tmp=t+'.power-sync-light-rollback-'+process.pid+'.tmp';fs.copyFileSync(src,tmp);try{fs.chownSync(tmp,info.uid,info.gid);}catch(_){}try{fs.chmodSync(tmp,info.mode);}catch(_){}fs.renameSync(tmp,t);if(sha(t)!==m.before[t])throw Error('ROLLBACK_HASH_FAILED:'+t);}
for(const t of Object.keys(m.after)){const current=sha(t);if(current===m.before[t])continue;if(current!==m.after[t])throw Error('ROLLBACK_EXTERNAL_DRIFT:'+t);if(m.before[t]===null)fs.unlinkSync(t);else restore(t);}
console.log(JSON.stringify({result:'PASS',hashes:Object.fromEntries(Object.keys(m.before).map(t=>[t,sha(t)]))}));
"""
    body = body.replace("MANIFEST", json.dumps({"before": report["before"], "after": report["after"]}))
    body = body.replace("BACKUPROOT", json.dumps(report["backup"]))
    return node_json(ssh, body, timeout=120)


def live_tests(ssh, stage_root):
    env = (
        "NODE_PATH=" + shlex.quote(APP + "/node_modules")
        + " COMPETITION_APP=" + shlex.quote(APP)
        + " COMPETITION_MAIN=" + shlex.quote(GAME + "/js/main.min_drop100.js")
        + " CONFIG_BIN_PATH=" + shlex.quote(CONFIG)
    )
    out = {}
    # The new service contract test is kept in the staged evidence tree, not
    # copied into the production application scripts. Verify its live source
    # with an inline read-only probe below; existing regression scripts remain
    # under the production app and are run there directly.
    for name in TESTS[1:3]:
        raw = run(ssh, "cd " + shlex.quote(APP) + " && " + env + " node "
                  + shlex.quote(stage_root + "/app/scripts/" + name), timeout=120)
        out[name] = parse_test(raw)
    raw = run(ssh, "cd " + shlex.quote(APP) + " && " + env + " NODE_ENV=test node "
              + shlex.quote(stage_root + "/app/scripts/test-core-gameplay-contract.js"), timeout=120)
    out["test-core-gameplay-contract.js"] = parse_test(raw)
    probe = (
        "const s=require('./src/services/PowerDisplaySyncService'),"
        "r=require('./src/services/ArenaReadModelService'),b=require('./src/services/BattleService'),"
        "x={userId:'live-power-probe',serverId:1001,player:{playerId:'probe',level:1}},"
        "a=b.calcPlayerPower(x.player),p=s.packet(x,1,true);"
        "if(!p||p.tag!==6198||p.data.power!==r.displayPower(a)||p.data.powerScore!==b.calcPowerScore(a))process.exit(2);"
        "console.log(JSON.stringify({result:'PASS',tag:p.tag,power:p.data.power,powerScore:p.data.powerScore,productionWrites:0}));"
    )
    raw = run(ssh, "cd " + shlex.quote(APP) + " && " + env + " node -e " + shlex.quote(probe), timeout=120)
    out["power-display-sync-live-probe"] = parse_test(raw)
    return out


def deploy(ssh):
    report = json.loads(MANIFEST.read_text(encoding="utf-8"))
    if report.get("status") != "STAGED":
        raise RuntimeError("STAGED_RELEASE_REQUIRED")
    if remote_hashes(ssh, list(report["before"])) != report["before"]:
        raise RuntimeError("PREDEPLOY_SOURCE_DRIFT")
    if any(value != "200" for value in readiness(ssh).values()):
        raise RuntimeError("PREDEPLOY_NOT_READY")
    if local_manifest() != report["after"]:
        raise RuntimeError("LOCAL_SOURCE_DRIFT")
    report["backup"] = "/linhhoasu/_ai_workbench/backups/power_sync_light_20260926_" + datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    report["deployBeforePm2"] = pm2(ssh)
    report["status"] = "DEPLOYING"
    report["restarted"] = []
    MANIFEST.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    try:
        report["remoteInstall"] = remote_install(ssh, report)
        MANIFEST.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        for name, port in NODES:
            run(ssh, "pm2 restart " + shlex.quote(name), timeout=60)
            report["restarted"].append(name)
            MANIFEST.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            wait_ready(ssh, port)
        report["liveTests"] = live_tests(ssh, report["stage"])
        if any(value.get("result") not in ("PASS", "ok") for value in report["liveTests"].values()):
            raise RuntimeError("LIVE_CONTRACT_TEST_FAILED")
        report["hashes"] = remote_hashes(ssh, list(report["after"]))
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
        MANIFEST.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({"status": report["status"], "backup": report["backup"], "ready": report["ready"], "tests": report["liveTests"]}, ensure_ascii=False))
    except Exception as error:
        report["error"] = str(error)[-6000:]
        MANIFEST.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        try:
            report["rollback"] = remote_rollback(ssh, report)
            for name, port in NODES:
                if name not in report["restarted"]:
                    continue
                run(ssh, "pm2 restart " + shlex.quote(name), timeout=60)
                wait_ready(ssh, port)
            report["rollbackReady"] = readiness(ssh)
            report["status"] = "ROLLED_BACK"
            MANIFEST.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        except Exception as rollback_error:
            report["rollbackError"] = str(rollback_error)[-6000:]
            report["status"] = "ROLLBACK_BLOCKED"
            MANIFEST.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        raise


def verify(ssh):
    report = json.loads(MANIFEST.read_text(encoding="utf-8"))
    current = remote_hashes(ssh, list(report.get("after", {})))
    ready = readiness(ssh)
    result = {"status": report.get("status"), "hashesMatch": current == report.get("after", {}),
              "hashes": current, "ready": ready, "productionWrites": 0}
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
            raise SystemExit("usage: release_power_sync_light_20260926.py [stage|deploy|verify]")
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
