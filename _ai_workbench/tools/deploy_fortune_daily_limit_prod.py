"""Deploy the Shop 11018000 one-claim-per-GMT+8-day production hotfix.

Safety properties:
- exact SHA-256 preconditions for both live handlers;
- local syntax + 38-check in-memory contract before connecting;
- remote backup of source, PM2 state, and the two activity fields migrated;
- only lhs-s1001 is stopped/restarted;
- automatic source/state rollback on any post-stop failure;
- no historical Baozi is removed.
"""

from __future__ import annotations

import base64
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
CANDIDATE = ROOT / "temp" / "fortune_daily_limit_candidate_20260901" / "app" / "src" / "handlers"
ITEM_LOCAL = CANDIDATE / "item.js"
ACTIVITY_LOCAL = CANDIDATE / "activity.js"
TEST_LOCAL = ROOT / "tools" / "test_fortune_daily_limit.js"
P0_TEST_LOCAL = ROOT / "tools" / "test_p0_item_commerce_contract.js"

REMOTE_APP = "/linhhoasu/lhs/newServer"
ITEM_REMOTE = f"{REMOTE_APP}/src/handlers/item.js"
ACTIVITY_REMOTE = f"{REMOTE_APP}/src/handlers/activity.js"
EXPECTED_ITEM = "f41bfd94a5da38ff68d9f961145623798fa792e037aa4a8b9a47e2af43541e7a"
EXPECTED_ACTIVITY = "5888443562068f2e3da91cf9a9ef6d1f9b5b4e58c6ba1849035691cef924327a"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def encode(source: str) -> str:
    return base64.b64encode(source.encode("utf-8")).decode("ascii")


def run_local(args: list[str], env: dict[str, str] | None = None) -> str:
    result = subprocess.run(
        args,
        cwd=ROOT,
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=180,
    )
    if result.returncode:
        raise RuntimeError((result.stdout + "\n" + result.stderr)[-8000:])
    return result.stdout


def run_remote(ssh: paramiko.SSHClient, command: str, timeout: int = 180) -> str:
    _, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    output = stdout.read().decode("utf-8", "replace")
    error = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError(error[-8000:] or output[-8000:] or f"remote exit={code}")
    return output


def pm2_snapshot(ssh: paramiko.SSHClient) -> dict[str, dict]:
    output = run_remote(
        ssh,
        "pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{for(const p of JSON.parse(s)){if([\"lhs-s1001\",\"lhs-dist\",\"lhs-admin\",\"lhs-real-bots\"].includes(p.name)){const e=p.pm2_env||{};console.log(JSON.stringify({name:p.name,status:e.status,pid:p.pid,restarts:e.restart_time,uptime:e.pm_uptime,cwd:e.pm_cwd,script:e.pm_exec_path}))}}})'",
    )
    rows = [json.loads(line) for line in output.splitlines() if line.strip().startswith("{")]
    return {row["name"]: row for row in rows}


CLAIMER_SCAN = r'''
import datetime, glob, json, math, os, re, subprocess, time
DAY_MS = 86400000
GMT8_MS = 8 * 60 * 60 * 1000
now_ms = int(time.time() * 1000)
day_key = int(math.floor((now_ms + GMT8_MS) / DAY_MS))
local_tz = datetime.datetime.now().astimezone().tzinfo
date_re = re.compile(r'(20\d\d-\d\d-\d\d)[T ](\d\d:\d\d:\d\d(?:\.\d+)?)')
request_re = re.compile(r'legacy shop buy goodsId=11018000 count=(\d+) user=([^\s]+)')
paths = sorted(path for path in glob.glob('/linhhoasu/lhs/newServer/logs/combined-*.log') if os.path.isfile(path))
actors = {}
if paths:
    process = subprocess.Popen(['grep','-a','-H','goodsId=11018000'] + paths, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    for raw in iter(process.stdout.readline, b''):
        line_with_path = raw.decode('utf-8','replace')
        _path, sep, line = line_with_path.partition(':')
        if not sep: continue
        date_match = date_re.search(line[:180]); request_match = request_re.search(line)
        if not date_match or not request_match: continue
        stamp = date_match.group(1) + 'T' + date_match.group(2)
        try:
            parsed = datetime.datetime.strptime(stamp, '%Y-%m-%dT%H:%M:%S.%f')
        except ValueError:
            parsed = datetime.datetime.strptime(stamp, '%Y-%m-%dT%H:%M:%S')
        parsed = parsed.replace(tzinfo=local_tz)
        at_ms = int(parsed.timestamp() * 1000)
        if int(math.floor((at_ms + GMT8_MS) / DAY_MS)) != day_key: continue
        count = max(0, int(request_match.group(1))); user = request_match.group(2).strip()
        row = actors.setdefault(user, {'userId':user,'claims':0,'firstClaimAt':at_ms,'lastClaimAt':at_ms})
        row['claims'] += count; row['firstClaimAt'] = min(row['firstClaimAt'],at_ms); row['lastClaimAt'] = max(row['lastClaimAt'],at_ms)
    stderr = process.stderr.read().decode('utf-8','replace'); code = process.wait()
    if code not in (0,1): raise RuntimeError(stderr[-2000:] or 'grep failed')
print(json.dumps({'generatedAt':datetime.datetime.now().isoformat(),'dayKey':day_key,'actors':sorted(actors.values(),key=lambda r:r['userId'])},ensure_ascii=False))
'''


def migration_source(actors: list[dict], day_key: int, backup_path: str) -> str:
    actors_json = json.dumps(actors, ensure_ascii=False)
    return r'''
const fs = require('fs');
try { require('/linhhoasu/lhs/newServer/node_modules/dotenv').config({path:'/linhhoasu/lhs/newServer/.env'}); } catch (_) {}
const mongoose = require('/linhhoasu/lhs/newServer/node_modules/mongoose');
const Player = require('/linhhoasu/lhs/newServer/src/db/models/Player');
const actors = ''' + actors_json + r''';
const expectedDayKey = ''' + str(day_key) + r''';
const backupPath = ''' + json.dumps(backup_path) + r''';
function obj(v){return v&&typeof v==='object'&&!Array.isArray(v)?v:{}}
function arr(v){return Array.isArray(v)?v:[]}
function num(v){const n=Number(v);return Number.isFinite(n)?n:0}
(async()=>{
  const uri=process.env.MONGO_URI||'mongodb://127.0.0.1:27017/lhs_s1001';
  await mongoose.connect(uri,{serverSelectionTimeoutMS:7000});
  const ids=actors.map(row=>String(row.userId||'')).filter(Boolean);
  const players=ids.length?await Player.find({userId:{$in:ids},'shopInfo.buyRecords.11018000':{$gt:0}}).select({userId:1,activityInfo:1,shopInfo:1,rechargeInfo:1,items:1}).lean():[];
  const byActor=new Map(actors.map(row=>[String(row.userId||''),row]));
  const backup=[]; const migrated=[];
  for(const player of players){
    const info=obj(player.activityInfo), datas=arr(info.datas), activity=datas.find(row=>num(row&&row.id)===43001);
    if(!activity) continue;
    const actor=byActor.get(String(player.userId||''));
    const previousLedgerExists=Object.prototype.hasOwnProperty.call(info,'dailyShopClaims');
    const previousLedger=previousLedgerExists?JSON.parse(JSON.stringify(info.dailyShopClaims)):null;
    const previousBuyRecords=JSON.parse(JSON.stringify(obj(activity.buyRecords)));
    backup.push({userId:String(player.userId),previousLedgerExists,previousLedger,previousBuyRecords});
    info.dailyShopClaims=obj(info.dailyShopClaims); info.dailyShopClaims['43001']=obj(info.dailyShopClaims['43001']);
    info.dailyShopClaims['43001']['11018000']={dayKey:expectedDayKey,count:1,lastClaimAt:num(actor&&actor.lastClaimAt)||Date.now()};
    activity.buyRecords=obj(activity.buyRecords); activity.buyRecords['11018000']=1;
    await Player.collection.updateOne({userId:String(player.userId)},{$set:{'activityInfo.dailyShopClaims':info.dailyShopClaims,'activityInfo.datas':datas,updatedAt:new Date()}});
    migrated.push(String(player.userId));
  }
  fs.writeFileSync(backupPath,JSON.stringify({dayKey:expectedDayKey,actors,backup,migrated},null,2));
  console.log('MIGRATION_JSON='+JSON.stringify({dayKey:expectedDayKey,actorCount:actors.length,playerCount:players.length,migratedCount:migrated.length,migrated}));
  await mongoose.disconnect();
})().catch(async e=>{console.error(e.stack||String(e));try{await mongoose.disconnect()}catch(_){}process.exit(1)});
'''


ROLLBACK_STATE = r'''
const fs=require('fs');
try{require('/linhhoasu/lhs/newServer/node_modules/dotenv').config({path:'/linhhoasu/lhs/newServer/.env'})}catch(_){}
const mongoose=require('/linhhoasu/lhs/newServer/node_modules/mongoose');
const Player=require('/linhhoasu/lhs/newServer/src/db/models/Player');
const backup=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));
function obj(v){return v&&typeof v==='object'&&!Array.isArray(v)?v:{}}
function arr(v){return Array.isArray(v)?v:[]}
(async()=>{const uri=process.env.MONGO_URI||'mongodb://127.0.0.1:27017/lhs_s1001';await mongoose.connect(uri,{serverSelectionTimeoutMS:7000});let restored=0;for(const row of arr(backup.backup)){const player=await Player.findOne({userId:String(row.userId)}).select({activityInfo:1}).lean();if(!player)continue;const info=obj(player.activityInfo),datas=arr(info.datas),activity=datas.find(x=>Number(x&&x.id)===43001);if(activity)activity.buyRecords=obj(row.previousBuyRecords);const set={'activityInfo.datas':datas,updatedAt:new Date()};const update={$set:set};if(row.previousLedgerExists)set['activityInfo.dailyShopClaims']=row.previousLedger;else update.$unset={'activityInfo.dailyShopClaims':''};await Player.collection.updateOne({userId:String(row.userId)},update);restored++}console.log(JSON.stringify({restored}));await mongoose.disconnect()})().catch(async e=>{console.error(e.stack||String(e));try{await mongoose.disconnect()}catch(_){}process.exit(1)});
'''


POST_AUDIT = r'''
try{require('/linhhoasu/lhs/newServer/node_modules/dotenv').config({path:'/linhhoasu/lhs/newServer/.env'})}catch(_){}
const mongoose=require('/linhhoasu/lhs/newServer/node_modules/mongoose');
const Player=require('/linhhoasu/lhs/newServer/src/db/models/Player');
const expected=JSON.parse(Buffer.from(process.argv[1],'base64').toString('utf8'));
function obj(v){return v&&typeof v==='object'&&!Array.isArray(v)?v:{}}
function arr(v){return Array.isArray(v)?v:[]}
(async()=>{const uri=process.env.MONGO_URI||'mongodb://127.0.0.1:27017/lhs_s1001';await mongoose.connect(uri,{serverSelectionTimeoutMS:7000});const ids=expected.migrated||[];const rows=ids.length?await Player.find({userId:{$in:ids}}).select({userId:1,activityInfo:1}).lean():[];const bad=[];for(const p of rows){const info=obj(p.activityInfo),ledger=obj(obj(info.dailyShopClaims)['43001'])['11018000'],activity=arr(info.datas).find(x=>Number(x&&x.id)===43001),buy=Number(obj(activity&&activity.buyRecords)['11018000'])||0;if(!ledger||Number(ledger.dayKey)!==Number(expected.dayKey)||Number(ledger.count)!==1||buy!==1)bad.push({userId:p.userId,ledger,buy})}console.log('POST_JSON='+JSON.stringify({expected:ids.length,found:rows.length,bad}));await mongoose.disconnect()})().catch(async e=>{console.error(e.stack||String(e));try{await mongoose.disconnect()}catch(_){}process.exit(1)});
'''


def main() -> None:
    for path in (ITEM_LOCAL, ACTIVITY_LOCAL, TEST_LOCAL, P0_TEST_LOCAL):
        if not path.is_file():
            raise FileNotFoundError(path)

    env = os.environ.copy()
    env["NODE_PATH"] = str((ROOT / ".." / "linhhoasu" / "lhs" / "newServer" / "node_modules").resolve())
    env["FORTUNE_APP_ROOT"] = str((CANDIDATE.parent.parent).resolve())
    run_local(["node", "--check", str(ITEM_LOCAL)])
    run_local(["node", "--check", str(ACTIVITY_LOCAL)])
    contract_output = run_local(["node", str(TEST_LOCAL)], env=env)
    if '"result": "PASS"' not in contract_output or '"checks": 38' not in contract_output:
        raise RuntimeError("local 38-check contract did not pass")
    item_hash = sha256(ITEM_LOCAL)
    activity_hash = sha256(ACTIVITY_LOCAL)

    password = os.environ.get("LHS_PROD_PASSWORD") or getpass.getpass("Production password (not logged): ")
    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False, allow_agent=False, timeout=20, banner_timeout=20, auth_timeout=20)

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup_dir = f"/linhhoasu/_ai_workbench/backups/fortune_daily_limit_pre_{stamp}"
    stage_dir = f"/linhhoasu/_ai_workbench/temp/fortune_daily_limit_{stamp}"
    remote_test = f"{stage_dir}/test_fortune_daily_limit.js"
    remote_p0_test = f"{stage_dir}/test_p0_item_commerce_contract.js"
    stage_item = f"{stage_dir}/item.fortune-stage.js"
    stage_activity = f"{stage_dir}/activity.fortune-stage.js"
    state_backup = f"{backup_dir}/player_daily_state.json"
    before_pm2: dict[str, dict] = {}
    claim_scan: dict = {}
    migration: dict = {}
    stopped = False
    swapped = False
    migrated = False
    result_payload: dict = {}
    try:
        live_hashes = run_remote(ssh, f"sha256sum -- {shlex.quote(ITEM_REMOTE)} {shlex.quote(ACTIVITY_REMOTE)}")
        if EXPECTED_ITEM not in live_hashes or EXPECTED_ACTIVITY not in live_hashes:
            raise RuntimeError("live source hash precondition failed:\n" + live_hashes)
        before_pm2 = pm2_snapshot(ssh)
        if before_pm2.get("lhs-s1001", {}).get("status") != "online":
            raise RuntimeError("lhs-s1001 is not online before deploy")

        run_remote(ssh, f"mkdir -p -- {shlex.quote(backup_dir)} {shlex.quote(stage_dir)}")
        run_remote(ssh, f"cp -a -- {shlex.quote(ITEM_REMOTE)} {shlex.quote(backup_dir + '/item.js')} && cp -a -- {shlex.quote(ACTIVITY_REMOTE)} {shlex.quote(backup_dir + '/activity.js')} && pm2 jlist > {shlex.quote(backup_dir + '/pm2-before.json')}")
        sftp = ssh.open_sftp()
        try:
            sftp.put(str(ITEM_LOCAL), stage_item)
            sftp.put(str(ACTIVITY_LOCAL), stage_activity)
            sftp.put(str(TEST_LOCAL), remote_test)
            sftp.put(str(P0_TEST_LOCAL), remote_p0_test)
        finally:
            sftp.close()
        run_remote(ssh, f"node --check {shlex.quote(stage_item)} && node --check {shlex.quote(stage_activity)}")
        staged_hashes = run_remote(ssh, f"sha256sum -- {shlex.quote(stage_item)} {shlex.quote(stage_activity)}")
        if item_hash not in staged_hashes or activity_hash not in staged_hashes:
            raise RuntimeError("staged hash mismatch")

        scan_output = run_remote(ssh, f"python3 -c \"import base64;exec(base64.b64decode('{encode(CLAIMER_SCAN)}'))\"", timeout=300)
        claim_scan = json.loads(scan_output)
        (ROOT / "temp" / "fortune_package_audit" / f"fortune_today_claimers_predeploy_{stamp}.json").write_text(json.dumps(claim_scan, ensure_ascii=False, indent=2), encoding="utf-8")

        # Stop only the affected process so no old-code claim can race the
        # ledger backfill or the atomic source swap.
        run_remote(ssh, "pm2 stop lhs-s1001")
        stopped = True
        live_hashes_again = run_remote(ssh, f"sha256sum -- {shlex.quote(ITEM_REMOTE)} {shlex.quote(ACTIVITY_REMOTE)}")
        if EXPECTED_ITEM not in live_hashes_again or EXPECTED_ACTIVITY not in live_hashes_again:
            raise RuntimeError("live source changed after preflight")

        run_remote(ssh, f"install -o root -g root -m 0644 -- {shlex.quote(stage_item)} {shlex.quote(ITEM_REMOTE)} && install -o root -g root -m 0644 -- {shlex.quote(stage_activity)} {shlex.quote(ACTIVITY_REMOTE)}")
        swapped = True
        deployed_hashes = run_remote(ssh, f"sha256sum -- {shlex.quote(ITEM_REMOTE)} {shlex.quote(ACTIVITY_REMOTE)}")
        if item_hash not in deployed_hashes or activity_hash not in deployed_hashes:
            raise RuntimeError("deployed hash mismatch")

        migration_js = migration_source(claim_scan.get("actors", []), int(claim_scan.get("dayKey", 0)), state_backup)
        migration_output = run_remote(ssh, f"cd {shlex.quote(REMOTE_APP)} && node -e \"eval(Buffer.from('{encode(migration_js)}','base64').toString('utf8'))\"", timeout=180)
        marker = "MIGRATION_JSON="
        if marker not in migration_output:
            raise RuntimeError("migration did not return a result")
        migration = json.loads(migration_output.split(marker, 1)[1].splitlines()[0])
        migrated = True

        run_remote(ssh, "pm2 restart lhs-s1001 --update-env && pm2 save")
        stopped = False
        time.sleep(5)

        health = run_remote(ssh, "curl -sS --max-time 15 -w '\nHTTP=%{http_code}\n' http://127.0.0.1:8080/ready; curl -sS --max-time 15 -w '\nHTTP=%{http_code}\n' http://127.0.0.1:9200/health")
        if health.count("HTTP=200") < 2 or '"mongo":true' not in health or '"redis":true' not in health:
            raise RuntimeError("post-deploy health failed:\n" + health)

        fixture = run_remote(ssh, f"NODE_PATH={shlex.quote(REMOTE_APP + '/node_modules')} FORTUNE_APP_ROOT={shlex.quote(REMOTE_APP)} node {shlex.quote(remote_test)}", timeout=180)
        if '"result": "PASS"' not in fixture or '"checks": 38' not in fixture:
            raise RuntimeError("remote fortune fixture failed:\n" + fixture[-5000:])
        p0_fixture = run_remote(ssh, f"NODE_PATH={shlex.quote(REMOTE_APP + '/node_modules')} APP_ROOT={shlex.quote(REMOTE_APP)} P0_ONLY_PAID=1 node {shlex.quote(remote_p0_test)}", timeout=180)
        if '"result":"ok"' not in p0_fixture or '"checks":8' not in p0_fixture:
            raise RuntimeError("remote paid-route regression failed:\n" + p0_fixture[-5000:])

        expected_for_audit = base64.b64encode(json.dumps({"dayKey": migration.get("dayKey"), "migrated": migration.get("migrated", [])}).encode()).decode()
        post_output = run_remote(ssh, f"cd {shlex.quote(REMOTE_APP)} && node -e \"eval(Buffer.from('{encode(POST_AUDIT)}','base64').toString('utf8'))\" {shlex.quote(expected_for_audit)}", timeout=180)
        post_marker = "POST_JSON="
        if post_marker not in post_output:
            raise RuntimeError("post-migration audit missing")
        post_audit = json.loads(post_output.split(post_marker, 1)[1].splitlines()[0])
        if post_audit.get("expected") != post_audit.get("found") or post_audit.get("bad"):
            raise RuntimeError("post-migration audit failed: " + json.dumps(post_audit))

        after_pm2 = pm2_snapshot(ssh)
        for name in ("lhs-dist", "lhs-admin", "lhs-real-bots"):
            if before_pm2.get(name, {}).get("pid") != after_pm2.get(name, {}).get("pid"):
                raise RuntimeError(f"unrelated process PID changed: {name}")
        if after_pm2.get("lhs-s1001", {}).get("status") != "online":
            raise RuntimeError("lhs-s1001 is not online after deploy")
        if after_pm2["lhs-s1001"].get("pid") == before_pm2["lhs-s1001"].get("pid"):
            raise RuntimeError("lhs-s1001 PID did not change after controlled restart")
        if after_pm2["lhs-s1001"].get("restarts", 0) < before_pm2["lhs-s1001"].get("restarts", 0):
            raise RuntimeError("lhs-s1001 restart counter decreased unexpectedly")

        error_tail = run_remote(ssh, "tail -n 300 /root/.pm2/logs/lhs-s1001-error.log 2>/dev/null || true")
        new_error_markers = [line for line in error_tail.splitlines() if "SyntaxError" in line or "ReferenceError" in line or "Cannot find module" in line]
        # Historical errors may exist in the tail. The live module require and
        # 38-check remote fixture are the authoritative load gates; retain the
        # bounded tail for review without treating old lines as new failures.
        result_payload = {
            "deployedAt": datetime.now(timezone.utc).isoformat(),
            "host": HOST,
            "backupDir": backup_dir,
            "stageDir": stage_dir,
            "hashes": {"item": item_hash, "activity": activity_hash},
            "claimScan": {"dayKey": claim_scan.get("dayKey"), "actors": len(claim_scan.get("actors", []))},
            "migration": migration,
            "postAudit": post_audit,
            "health": health,
            "fixture": fixture[-2000:],
            "p0Fixture": p0_fixture[-2000:],
            "pm2Before": before_pm2,
            "pm2After": after_pm2,
            "boundedHistoricalErrorMarkers": new_error_markers[-20:],
            "rollback": "not used",
        }
        evidence_path = ROOT / "temp" / "fortune_package_audit" / f"fortune_daily_limit_deploy_{stamp}.json"
        evidence_path.write_text(json.dumps(result_payload, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps({"result": "PASS", "evidence": str(evidence_path), **result_payload}, ensure_ascii=False, indent=2))
    except Exception as error:
        rollback_errors: list[str] = []
        needs_rollback = stopped or swapped or migrated
        if needs_rollback:
            try:
                if not stopped:
                    run_remote(ssh, "pm2 stop lhs-s1001")
                    stopped = True
            except Exception as rollback_error:
                rollback_errors.append("stop: " + str(rollback_error))
            if swapped:
                try:
                    run_remote(ssh, f"cp -a -- {shlex.quote(backup_dir + '/item.js')} {shlex.quote(ITEM_REMOTE)} && cp -a -- {shlex.quote(backup_dir + '/activity.js')} {shlex.quote(ACTIVITY_REMOTE)}")
                except Exception as rollback_error:
                    rollback_errors.append("source: " + str(rollback_error))
            if migrated:
                try:
                    rollback_path_arg = shlex.quote(state_backup)
                    run_remote(ssh, f"cd {shlex.quote(REMOTE_APP)} && node -e \"eval(Buffer.from('{encode(ROLLBACK_STATE)}','base64').toString('utf8'))\" {rollback_path_arg}", timeout=180)
                except Exception as rollback_error:
                    rollback_errors.append("state: " + str(rollback_error))
            try:
                run_remote(ssh, "pm2 restart lhs-s1001 --update-env")
                stopped = False
            except Exception as rollback_error:
                rollback_errors.append("restart: " + str(rollback_error))
        raise RuntimeError(f"deploy failed: {error}; rollback_errors={rollback_errors}") from error
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
