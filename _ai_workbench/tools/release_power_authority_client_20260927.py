"""Deploy the client-side authoritative power presentation fix.

Only the web client entrypoint and the two presentation addons are changed.
The server's tag 6198 producer is already live and is verified separately.
This release never writes player/DB/Redis state and does not restart game
processes. Files are staged, backed up, installed with hash CAS/atomic rename,
then verified from disk and through nginx HTTP.
"""
import hashlib
import json
import shlex
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
from snapshot_web_multiserver_20260906 import connect


WB = Path(__file__).resolve().parents[1]
WORK = WB.parent
OUT = WB / "temp" / "power_authority_client_20260927"
MANIFEST = OUT / "release.json"
GAME = "/linhhoasu/webgame/game"
NODES = [("lhs-s1006", 8087), ("lhs-s1005", 8086), ("lhs-s1004", 8085),
         ("lhs-s1003", 8084), ("lhs-s1002", 8083), ("lhs-s1001", 8080)]
FILES = {
    GAME + "/index.html": WORK / "linhhoasu/webgame/game/index.html",
    GAME + "/js/lhs-power-relogin-v1.js": WORK / "linhhoasu/webgame/game/js/lhs-power-relogin-v1.js",
    GAME + "/js/lhs-power-authoritative-v1.js": WORK / "linhhoasu/webgame/game/js/lhs-power-authoritative-v1.js",
}
MARKERS = {
    "index.html": ["20260927_power_relogin_v4", "20260927_power_authoritative_v2"],
    "lhs-power-relogin-v1.js": ["20260927_power_relogin_v4"],
    "lhs-power-authoritative-v1.js": ["20260927_power_authoritative_v2", "TAG = 6198"],
}


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


def digest(data):
    return hashlib.sha256(data).hexdigest()


def local_hash(path):
    return digest(path.read_bytes())


def local_manifest():
    missing = [str(path) for path in FILES.values() if not path.is_file()]
    if missing:
        raise RuntimeError("LOCAL_FILE_MISSING:" + ",".join(missing))
    return {target: local_hash(path) for target, path in FILES.items()}


def remote_hashes(ssh, paths):
    body = (
        "const fs=require('fs'),c=require('crypto'),ps=" + json.dumps(paths) + ";"
        "const h=p=>fs.existsSync(p)?c.createHash('sha256').update(fs.readFileSync(p)).digest('hex'):null;"
        "console.log(JSON.stringify(Object.fromEntries(ps.map(p=>[p,h(p)]))));"
    )
    return node_json(ssh, body)


def http_hashes(ssh, paths, query):
    result = {}
    for target in paths:
        rel = target[len(GAME):].lstrip("/")
        url = "http://127.0.0.1:81/" + rel + "?v=" + query
        raw = run(ssh, "curl -fsS --max-time 15 " + shlex.quote(url) + " | sha256sum", timeout=30)
        result[target] = raw.strip().split()[0]
    return result


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


def local_tests():
    tests = [
        WORK / "_ai_workbench/tools/test_power_authoritative_v2_20260927.js",
        WORK / "_ai_workbench/tools/test_power_relogin_v4_20260927.js",
    ]
    outputs = {}
    for path in tests:
        proc = subprocess.run(["node", str(path)], cwd=str(WORK), text=True,
                              capture_output=True, check=True)
        lines = [line for line in proc.stdout.splitlines() if line.strip()]
        outputs[path.name] = json.loads(lines[-1])
        if outputs[path.name].get("result") != "PASS":
            raise RuntimeError("LOCAL_TEST_FAILED:" + path.name)
    for path in FILES.values():
        if path.suffix == ".js":
            subprocess.run(["node", "--check", str(path)], cwd=str(WORK), check=True,
                           capture_output=True, text=True)
    return outputs


def stage(ssh):
    if MANIFEST.exists():
        raise RuntimeError("RELEASE_EXISTS_USE_VERIFY_OR_MOVE_OLD_MANIFEST")
    after = local_manifest()
    tests = local_tests()
    before = remote_hashes(ssh, list(FILES))
    ready = readiness(ssh)
    if any(value != "200" for value in ready.values()):
        raise RuntimeError("BASELINE_NOT_READY:" + json.dumps(ready))
    if any(value is None for value in before.values()):
        raise RuntimeError("REMOTE_TARGET_MISSING")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    stage_root = "/linhhoasu/_ai_workbench/temp/power_authority_client_" + stamp
    run(ssh, "install -d -m 700 " + shlex.quote(stage_root + "/game/js"))
    staged = {}
    with ssh.open_sftp() as sftp:
        for target, local in FILES.items():
            rel = target[len(GAME):].lstrip("/")
            remote = stage_root + "/game/" + rel
            sftp.put(str(local), remote)
            staged[target] = remote
    staged_hashes = remote_hashes(ssh, list(staged.values()))
    expected = {staged[target]: after[target] for target in FILES}
    if staged_hashes != expected:
        raise RuntimeError("STAGE_READBACK_MISMATCH")
    report = {
        "status": "STAGED",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "stage": stage_root,
        "before": before,
        "after": after,
        "staged": staged,
        "stagedHashes": staged_hashes,
        "baselineReady": ready,
        "tests": tests,
        "productionWrites": 0,
        "realPlayerWrites": 0,
        "processRestarts": 0,
    }
    OUT.mkdir(parents=True, exist_ok=False)
    MANIFEST.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "STAGED", "stage": stage_root, "tests": tests}, ensure_ascii=False))


def install_remote(ssh, report):
    backup = report["backup"]
    body = r"""
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const m=MANIFEST,BACKUP=BACKUPROOT,STAGE=STAGEROOT,GAME=GAMEROOT;
const sha=p=>fs.existsSync(p)?crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'):null;
const targets=Object.keys(m.after),meta={};
for(const t of targets){if(sha(t)!==m.before[t])throw Error('INSTALL_CAS_DRIFT:'+t);const st=fs.statSync(t);meta[t]={mode:st.mode&0o7777,uid:st.uid,gid:st.gid};}
fs.mkdirSync(BACKUP,{recursive:false,mode:0o700});
for(const t of targets){const b=BACKUP+'/files'+t;fs.mkdirSync(path.dirname(b),{recursive:true,mode:0o700});fs.copyFileSync(t,b);}
fs.writeFileSync(BACKUP+'/manifest.json',JSON.stringify({before:m.before,after:m.after,meta},null,2),{flag:'wx',mode:0o600});
function writeAtomic(t,src,expected){const info=meta[t]||{mode:0o644,uid:0,gid:0};const tmp=t+'.power-authority-'+process.pid+'.tmp';if(fs.existsSync(tmp))throw Error('TEMP_TARGET_EXISTS:'+t);fs.copyFileSync(src,tmp);try{fs.chownSync(tmp,info.uid,info.gid);}catch(_){}try{fs.chmodSync(tmp,info.mode);}catch(_){}fs.renameSync(tmp,t);if(sha(t)!==expected)throw Error('WRITE_HASH_FAILED:'+t);}
const installed=[];
try{for(const t of targets){const src=STAGE+'/game/'+t.slice((GAME+'/').length);writeAtomic(t,src,m.after[t]);installed.push(t);}}
catch(error){for(const t of installed.reverse()){if(sha(t)===m.after[t])writeAtomic(t,BACKUP+'/files'+t,m.before[t]);}throw error;}
console.log(JSON.stringify({result:'PASS',backup:BACKUP,files:targets.length,hashes:Object.fromEntries(targets.map(t=>[t,sha(t)]))}));
"""
    body = body.replace("MANIFEST", json.dumps({"before": report["before"], "after": report["after"]}))
    body = body.replace("BACKUPROOT", json.dumps(backup))
    body = body.replace("STAGEROOT", json.dumps(report["stage"]))
    body = body.replace("GAMEROOT", json.dumps(GAME))
    return node_json(ssh, body, timeout=120)


def rollback_remote(ssh, report):
    body = r"""
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const m=MANIFEST,BACKUP=BACKUPROOT;
const sha=p=>fs.existsSync(p)?crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'):null;
const saved=JSON.parse(fs.readFileSync(BACKUP+'/manifest.json','utf8')),meta=saved.meta||{};
function restore(t){const info=meta[t],src=BACKUP+'/files'+t,tmp=t+'.power-authority-rollback-'+process.pid+'.tmp';fs.copyFileSync(src,tmp);try{fs.chownSync(tmp,info.uid,info.gid);}catch(_){}try{fs.chmodSync(tmp,info.mode);}catch(_){}fs.renameSync(tmp,t);if(sha(t)!==m.before[t])throw Error('ROLLBACK_HASH_FAILED:'+t);}
for(const t of Object.keys(m.after)){const current=sha(t);if(current===m.before[t])continue;if(current!==m.after[t])throw Error('ROLLBACK_EXTERNAL_DRIFT:'+t);restore(t);}
console.log(JSON.stringify({result:'PASS',hashes:Object.fromEntries(Object.keys(m.before).map(t=>[t,sha(t)]))}));
"""
    body = body.replace("MANIFEST", json.dumps({"before": report["before"], "after": report["after"]}))
    body = body.replace("BACKUPROOT", json.dumps(report["backup"]))
    return node_json(ssh, body, timeout=120)


def verify_live(ssh, report):
    disk = remote_hashes(ssh, list(report["after"]))
    http = http_hashes(ssh, list(report["after"]), "20260927_power_authority_client_v1")
    ready = readiness(ssh)
    marker = run(ssh, "grep -E '20260927_power_(relogin_v4|authoritative_v2)' "
                 + shlex.quote(GAME + "/index.html"), timeout=20).strip()
    result = {"disk": disk, "http": http, "expected": report["after"], "ready": ready,
              "indexMarkers": marker, "productionWrites": 0, "processRestarts": 0}
    if disk != report["after"] or http != report["after"] or any(v != "200" for v in ready.values()):
        raise RuntimeError("LIVE_VERIFY_FAILED:" + json.dumps(result, ensure_ascii=False))
    return result


def deploy(ssh):
    report = json.loads(MANIFEST.read_text(encoding="utf-8"))
    if report.get("status") != "STAGED":
        raise RuntimeError("STAGED_RELEASE_REQUIRED")
    if remote_hashes(ssh, list(report["before"])) != report["before"]:
        raise RuntimeError("PREDEPLOY_SOURCE_DRIFT")
    if local_manifest() != report["after"]:
        raise RuntimeError("LOCAL_SOURCE_DRIFT")
    report["backup"] = "/linhhoasu/_ai_workbench/backups/power_authority_client_20260927_" + datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    report["status"] = "DEPLOYING"
    MANIFEST.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    try:
        report["remoteInstall"] = install_remote(ssh, report)
        report["liveVerify"] = verify_live(ssh, report)
        report["status"] = "DEPLOYED"
        MANIFEST.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({"status": report["status"], "backup": report["backup"], "verify": report["liveVerify"]}, ensure_ascii=False))
    except Exception as error:
        report["error"] = str(error)[-6000:]
        MANIFEST.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        try:
            report["rollback"] = rollback_remote(ssh, report)
            report["status"] = "ROLLED_BACK"
            MANIFEST.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        except Exception as rollback_error:
            report["rollbackError"] = str(rollback_error)[-6000:]
            report["status"] = "ROLLBACK_BLOCKED"
            MANIFEST.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        raise


def verify(ssh):
    report = json.loads(MANIFEST.read_text(encoding="utf-8"))
    result = verify_live(ssh, report)
    result["status"] = report.get("status")
    print(json.dumps(result, ensure_ascii=False))


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
            raise SystemExit("usage: release_power_authority_client_20260927.py [stage|deploy|verify]")
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
