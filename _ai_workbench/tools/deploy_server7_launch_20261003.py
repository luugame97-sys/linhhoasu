"""Create S7 with a time-gated production opening on 2026-10-03 19:00 ICT.

This deploys from the effective live VPS files, never from a stale local
ecosystem file.  It takes a selective remote backup, uses CAS checks for files
and Mongo metadata, restarts only the game fleet required for the new route,
and runs read-only pre-open QA without creating an account or player.
"""
from __future__ import annotations

import hashlib
import json
import re
import shlex
import stat
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from rollback_role_lian_manifest_20260930 import ssh_config

import paramiko

ROOT = Path(__file__).resolve().parents[2]
APP = "/linhhoasu/lhs/newServer"
SID = 1007
OPEN = 1791028800000  # 2026-10-03 19:00:00 Asia/Bangkok
HTTP_PORT = 8088
WS_PORT = 9206
PUBLIC_PATH = "/ws-s7"
IDENTITY_DB = "lhs_s1001"
S7_DB = "lhs_s1007"
ROUTE_NAMES = [f"lhs-s100{i}" for i in range(1, 7)]
PORTS = dict(zip(ROUTE_NAMES, [8080, 8083, 8084, 8085, 8086, 8087]))
FILES = {
    "ecosystem": APP + "/ecosystem.config.js",
    "nginx": "/www/server/panel/vhost/nginx/game.lhs.conf",
    "webgm_env": "/linhhoasu/webgame/gm/.env",
    "bot_s6": APP + "/scripts/start-scheduled-bots-s6.js",
}
OUT = ROOT / "_ai_workbench/temp/server7_launch_20261003"


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def connect():
    args, kwargs = ssh_config()
    if args[0] != "103.116.104.165":
        raise RuntimeError("TARGET_VPS_MISMATCH")
    client = paramiko.SSHClient()
    client.load_system_host_keys()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(*args, **kwargs)
    return client


def run(ssh, command: str, input_text: str | None = None, timeout: int = 60) -> str:
    stdin, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    if input_text is not None:
        stdin.write(input_text)
        stdin.channel.shutdown_write()
    out = stdout.read().decode("utf-8", "replace")
    if stdout.channel.recv_exit_status() != 0:
        raise RuntimeError("REMOTE_FAILED: " + stderr.read().decode("utf-8", "replace")[-1600:])
    return out


def node(ssh, source: str) -> str:
    return run(ssh, "node -e " + shlex.quote(source))


def read_files(ssh) -> dict[str, dict]:
    result = {}
    with ssh.open_sftp() as sftp:
        for key, path in FILES.items():
            data = sftp.open(path, "rb").read()
            attrs = sftp.stat(path)
            result[key] = {
                "path": path,
                "data": data,
                "sha256": sha(data),
                "bytes": len(data),
                "mode": stat.S_IMODE(attrs.st_mode),
                "uid": attrs.st_uid,
                "gid": attrs.st_gid,
            }
    return result


def public_files(files):
    return {key: {k: item[k] for k in ("path", "sha256", "bytes", "mode", "uid", "gid")}
            for key, item in files.items()}


def pm2_rows(ssh):
    rows = json.loads(run(ssh, "pm2 jlist"))
    wanted = set(ROUTE_NAMES + ["lhs-real-bots-s6", "lhs-s1007", "lhs-real-bots-s7", "lhs-bot-fleet-supervisor"])
    output = []
    keys = ["SERVER_ID", "SERVER_OPEN_TIME", "HTTP_PORT", "WS_PORT",
            "WS_PUBLIC_PATH", "WS_PUBLIC_PORT", "SERVER_NODE_HTTP_MAP",
            "IDENTITY_MONGO_DB", "MONGO_URI", "REDIS_PREFIX",
            "CROSS_EVENT_ENABLED", "ARENA_SETTLEMENT_ENABLED",
            "ARENA_SETTLEMENT_APPROVED", "ARENA_SETTLEMENT_ACTIVATION_AT",
            "EVENT_SETTLEMENT_ACTIVATION_AT", "WS_PUBLIC_PATH_1007", "WS_PUBLIC_PORT_1007",
            "BOT_WORKER_ENABLED", "BOT_WORKER_COUNT", "BOT_WORKER_LAZY_MAP_ACTIVATION",
            "BOT_WORKER_LAZY_BOTS_PER_MAP", "BOT_WORKER_LAZY_MAX_ACTIVE", "BOT_FLEET_MODE"]
    for row in rows:
        if row.get("name") not in wanted:
            continue
        env = (row.get("pm2_env") or {}).get("env") or {}
        output.append({
            "name": row.get("name"),
            "pid": row.get("pid"),
            "status": (row.get("pm2_env") or {}).get("status"),
            "restarts": (row.get("pm2_env") or {}).get("restart_time"),
            "env": {key: env.get(key) for key in keys},
        })
    return sorted(output, key=lambda item: item["name"])


def mongo_state(ssh):
    source = r"""
const {MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');
(async()=>{const c=new MongoClient('mongodb://127.0.0.1:27017');await c.connect();
const id=c.db('lhs_s1001'), admin=c.db('admin');
const rows=await id.collection('gameservers').find({}).sort({serverId:1}).toArray();
const dbs=(await admin.admin().listDatabases()).databases.map(x=>x.name);
const s7=c.db('lhs_s1007');
const collections=dbs.includes('lhs_s1007')?await s7.listCollections({},{nameOnly:true}).toArray():[];
const players=dbs.includes('lhs_s1007')?await s7.collection('players').countDocuments({}):0;
const roles=await id.collection('accounts').countDocuments({'roles.serverId':1007});
console.log(JSON.stringify({now:Date.now(),rows,dbs:dbs.filter(x=>/^lhs_s100[1-7]$/.test(x)),collections,players,roles}));
await c.close()})().catch(e=>{console.error(e.message);process.exit(1)});
"""
    return json.loads(node(ssh, source))


def state(ssh, files=None):
    if files is None:
        files = read_files(ssh)
    return {
        "at": datetime.now(timezone.utc).isoformat(),
        "mongo": mongo_state(ssh),
        "pm2": pm2_rows(ssh),
        "files": public_files(files),
    }, files


def ready(ssh, port: int):
    last = None
    for _ in range(40):
        try:
            last = json.loads(run(ssh, f"curl -fsS --max-time 5 http://127.0.0.1:{port}/ready"))
            if last.get("status") == "ok" and last.get("checks") == {"mongo": True, "redis": True}:
                return last
        except Exception as error:
            last = str(error)
        time.sleep(1)
    raise RuntimeError("NOT_READY:" + str(port) + ":" + json.dumps(last, ensure_ascii=False))


def webgm_ready(ssh):
    # Game Mongo/Redis readiness does not exercise PHP-FPM or the WebGM DB.
    # Readability must be checked as the worker user, never only as SSH root.
    run(ssh, 'runuser -u www -- test -r ' + shlex.quote(FILES['webgm_env']))
    checks = []
    for url, expected in (
        ('http://127.0.0.1:88/login.php', 200),
        ('http://127.0.0.1:81/web-panel/', 302),
        ('https://linhhoasu.lol/web-panel/login.php', 200),
        ('https://lhs.mg365.fun/login.php', 200),
    ):
        raw = run(ssh, 'curl -sS --max-time 20 -w ' + shlex.quote('\nSTATUS:%{http_code}') + ' ' + shlex.quote(url))
        body, status = raw.rsplit('\nSTATUS:', 1)
        if int(status) != expected or 'Không thể kết nối database website.' in body:
            raise RuntimeError('WEBGM_HTTP_FAILED:' + url + ':' + status)
        if expected == 200 and '<form' not in body:
            raise RuntimeError('WEBGM_LOGIN_FORM_MISSING:' + url)
        checks.append({'url': url, 'status': int(status)})
    return checks


def patch_ecosystem(data: bytes) -> bytes:
    text = data.decode("utf-8")
    if "S7_LAUNCH_20261003" in text or "name: 'lhs-s1007'" in text:
        raise RuntimeError("S7_ECOSYSTEM_ALREADY_PRESENT")
    marker = "// S6_LAUNCH_20260927"
    if marker not in text or "name: 'lhs-s1006'" not in text:
        raise RuntimeError("S6_TEMPLATE_NOT_FOUND")
    block = f'''\n// S7_LAUNCH_20261003: 19:00 Asia/Bangkok; gameplay isolated from S1-S6.\nconst server7OpenTime = {OPEN};\nfor (const app of module.exports.apps.filter(app => /^lhs-s100[1-6]$/.test(app.name))) {{\n  app.env.WS_PUBLIC_PORT_1007 = 81;\n  app.env.WS_PUBLIC_PATH_1007 = '{PUBLIC_PATH}';\n  const routes = JSON.parse(app.env.SERVER_NODE_HTTP_MAP || '{{}}');\n  routes['1007'] = 'http://127.0.0.1:{HTTP_PORT}';\n  app.env.SERVER_NODE_HTTP_MAP = JSON.stringify(routes);\n}}\nconst server7Template = module.exports.apps.find(app => app.name === 'lhs-s1006');\nconst server7BotTemplate = module.exports.apps.find(app => app.name === 'lhs-real-bots-s6');\nif (!server7Template || !server7BotTemplate) throw new Error('S7_TEMPLATES_MISSING');\nmodule.exports.apps.push({{\n  ...server7Template,\n  name: 'lhs-s1007',\n  env: {{\n    ...server7Template.env,\n    SERVER_ID: 1007,\n    DEFAULT_SERVER_ID: 1007,\n    SERVER_NAME: 'S7',\n    SERVER_OPEN_TIME: server7OpenTime,\n    WS_PORT: {WS_PORT},\n    HTTP_PORT: {HTTP_PORT},\n    WS_PUBLIC_PATH: '{PUBLIC_PATH}',\n    WS_PUBLIC_PORT_1007: 81,\n    WS_PUBLIC_PATH_1007: '{PUBLIC_PATH}',\n    SERVER_NODE_HTTP_MAP: '{{"1001":"http://127.0.0.1:8080","1002":"http://127.0.0.1:8083","1003":"http://127.0.0.1:8084","1004":"http://127.0.0.1:8085","1005":"http://127.0.0.1:8086","1006":"http://127.0.0.1:8087"}}',\n    MONGO_URI: 'mongodb://localhost:27017/{S7_DB}',\n    REDIS_PREFIX: 's1007:',\n    IDENTITY_MONGO_DB: 'lhs_s1001',\n    AUTH_REDIS_PREFIX: 's1001:',\n    CROSS_EVENT_ENABLED: '1',\n    ARENA_SETTLEMENT_ENABLED: '1',\n    ARENA_SETTLEMENT_APPROVED: '1',\n    ARENA_SETTLEMENT_ACTIVATION_AT: server7OpenTime,\n    EVENT_SETTLEMENT_ACTIVATION_AT: server7OpenTime,\n  }},\n}}, {{\n  ...server7BotTemplate,\n  name: 'lhs-real-bots-s7',\n  script: 'scripts/start-scheduled-bots-s7.js',\n  env: {{\n    ...server7BotTemplate.env,\n    SERVER_OPEN_TIME: server7OpenTime,\n    BOT_WORKER_ENABLED: '1',\n    BOT_WORKER_COUNT: '580',\n    BOT_WORKER_ACTIVE_FARM_MIN_MS: '15000',\n    BOT_WORKER_ACTIVE_FARM_MAX_MS: '25000',\n    BOT_WORKER_LAZY_MAP_ACTIVATION: '1',\n    BOT_WORKER_LAZY_BOTS_PER_MAP: '2',\n    BOT_WORKER_LAZY_MAX_ACTIVE: '80',\n    BOT_WORKER_SERVER_ID: 1007,\n    BOT_WORKER_WS_URL: 'ws://127.0.0.1:{WS_PORT}',\n    BOT_WORKER_ACTIVITY_URL: 'http://127.0.0.1:{WS_PORT}/bot-activity',\n  }},\n}});\n'''
    return (text.rstrip() + "\n" + block).encode("utf-8")


def patch_nginx(data: bytes) -> bytes:
    text = data.decode("utf-8")
    if "/ws-s7" in text:
        raise RuntimeError("S7_NGINX_ALREADY_PRESENT")
    match = re.search(r"    location /ws-s6 \{.*?\n    \}", text, re.S)
    if not match:
        raise RuntimeError("S6_NGINX_TEMPLATE_NOT_FOUND")
    block = match.group(0).replace("/ws-s6", PUBLIC_PATH).replace(":9205", f":{WS_PORT}")
    return (text[:match.end()] + "\n\n" + block + text[match.end():]).encode("utf-8")


def patch_webgm(data: bytes) -> bytes:
    text = data.decode("utf-8")
    if "LHS_SERVER_7_ID=" in text:
        raise RuntimeError("S7_WEBGM_ALREADY_PRESENT")
    if text.count("LHS_SERVER_COUNT=6") != 1:
        raise RuntimeError("WEBGM_COUNT_NOT_SIX")
    text = text.replace("LHS_SERVER_COUNT=6", "LHS_SERVER_COUNT=7", 1).rstrip()
    text += (f"\nLHS_SERVER_7_ID={SID}\nLHS_SERVER_7_KEY={SID}\n"
             "LHS_SERVER_7_NAME=Linh Họa Sư - S7\n"
             f"LHS_SERVER_7_API_BASE=http://127.0.0.1:{HTTP_PORT}\n")
    return text.encode("utf-8")


def patch_bot(data: bytes) -> bytes:
    text = data.decode("utf-8")
    if "S6_OPEN_TIME" not in text or "1006" not in text:
        raise RuntimeError("S6_BOT_TEMPLATE_NOT_FOUND")
    text = text.replace("S6", "S7").replace("1006", "1007").replace("9205", "9206")
    text = text.replace("1790478000000", str(OPEN))
    if "S6" in text or "1006" in text or "9205" in text:
        raise RuntimeError("S7_BOT_TEMPLATE_REPLACEMENT_INCOMPLETE")
    return text.encode("utf-8")


def backup(ssh, files, before, path):
    run(ssh, "install -d -m 700 " + shlex.quote(path))
    with ssh.open_sftp() as sftp:
        for key, item in files.items():
            dest = path + "/" + key + ".before"
            with sftp.open(dest, "wb") as out:
                out.write(item["data"])
            sftp.chmod(dest, 0o600)
        with sftp.open(path + "/state.json", "wb") as out:
            out.write(json.dumps(before, ensure_ascii=False, indent=2).encode("utf-8"))
        sftp.chmod(path + "/state.json", 0o600)
    run(ssh, "cp -p /root/.pm2/dump.pm2 " + shlex.quote(path + "/dump.pm2.before")
        + " && chmod 600 " + shlex.quote(path + "/dump.pm2.before"))


def write_cas(ssh, item, data: bytes):
    with ssh.open_sftp() as sftp:
        if sftp.open(item["path"], "rb").read() != item["data"]:
            raise RuntimeError("CAS_FILE_DRIFT:" + item["path"])
        tmp = item["path"] + ".s7_20261003.tmp"
        with sftp.open(tmp, "wb") as out:
            out.write(data)
        sftp.chmod(tmp, item["mode"])
        sftp.chown(tmp, item["uid"], item["gid"])
        sftp.posix_rename(tmp, item["path"])


def insert_metadata(ssh):
    row = {"serverId": SID, "pageId": 1, "pageName": "MEGAME365", "serverName": "S7",
           "running": False, "status": 0, "isNew": True, "isRecommend": False,
           "openTime": OPEN, "rechargeArea": 1}
    source = ("const {MongoClient}=require(" + json.dumps(APP + "/node_modules/mongodb") + ");"
              "(async()=>{const c=new MongoClient('mongodb://127.0.0.1:27017');await c.connect();"
              "const r=" + json.dumps(row, ensure_ascii=False) + ";"
              "const q={serverId:1007};const old=await c.db('lhs_s1001').collection('gameservers').findOne(q);"
              "if(old)throw Error('S7_ROW_EXISTS');const x=await c.db('lhs_s1001').collection('gameservers').insertOne(r);"
              "console.log(JSON.stringify({inserted:String(x.insertedId)}));await c.close()})()"
              ".catch(e=>{console.error(e.message);process.exit(1)});")
    return json.loads(node(ssh, source))


def publish(ssh):
    source = ("const {MongoClient}=require(" + json.dumps(APP + "/node_modules/mongodb") + ");"
              "(async()=>{const c=new MongoClient('mongodb://127.0.0.1:27017');await c.connect();"
              "const x=await c.db('lhs_s1001').collection('gameservers').updateOne({serverId:1007,openTime:" + str(OPEN) + ",running:false,status:0},{$set:{running:true,status:1}});"
              "if(Number(x.matchedCount??x.n??0)!==1)throw Error('S7_CAS_PUBLISH_FAILED');"
              "console.log('S7_PUBLISHED_TIME_GATE_ACTIVE');await c.close()})().catch(e=>{console.error(e.message);process.exit(1)});")
    return node(ssh, source).strip()


def add_route_and_restart(ssh, item):
    name = item["name"]
    routes = json.loads(item['env'].get('SERVER_NODE_HTTP_MAP') or '{}')
    routes['1007'] = 'http://127.0.0.1:8088'
    delta = 'WS_PUBLIC_PORT_1007=81 WS_PUBLIC_PATH_1007=/ws-s7 SERVER_NODE_HTTP_MAP=' + shlex.quote(json.dumps(routes,separators=(',',':')))
    run(ssh, delta + " pm2 restart " + shlex.quote(name) + " --update-env")
    return ready(ssh, PORTS[name])


def start_s7(ssh):
    run(ssh, "cd " + APP + " && pm2 start ecosystem.config.js --only lhs-s1007")
    return ready(ssh, HTTP_PORT)


def start_bot(ssh):
    run(ssh, "cd " + APP + " && pm2 start ecosystem.config.js --only lhs-real-bots-s7")


def validate_candidate(ssh, stage):
    source = r'''
const assert=require('assert/strict'),fs=require('fs'),vm=require('vm');
const root='/linhhoasu/lhs/newServer', live=require(root+'/ecosystem.config.js');
const req=require('module').createRequire(root+'/ecosystem.config.js');
const sandbox={module:{exports:{}},require:req,process,__dirname:root};
vm.runInNewContext(fs.readFileSync(STAGE+'/ecosystem.js','utf8'),sandbox);
const candidate=JSON.parse(JSON.stringify(sandbox.module.exports));
assert.equal(candidate.apps.length,live.apps.length+2);
for(const old of live.apps){
  const actual=candidate.apps.find(x=>x.name===old.name);assert(actual);
  const expected=JSON.parse(JSON.stringify(old));
  if(/^lhs-s100[1-6]$/.test(old.name)){
    expected.env.WS_PUBLIC_PORT_1007=81;expected.env.WS_PUBLIC_PATH_1007='/ws-s7';
    const routes=JSON.parse(expected.env.SERVER_NODE_HTTP_MAP||'{}');routes['1007']='http://127.0.0.1:8088';
    expected.env.SERVER_NODE_HTTP_MAP=JSON.stringify(routes);
  }
  assert.deepEqual(actual,expected,'UNRELATED_CONFIG_CHANGED:'+old.name);
}
const game=candidate.apps.find(x=>x.name==='lhs-s1007'),bot=candidate.apps.find(x=>x.name==='lhs-real-bots-s7');
for(const [key,value] of Object.entries({SERVER_ID:1007,DEFAULT_SERVER_ID:1007,SERVER_NAME:'S7',
 SERVER_OPEN_TIME:1791028800000,HTTP_PORT:8088,WS_PORT:9206,IDENTITY_MONGO_DB:'lhs_s1001',
 MONGO_URI:'mongodb://localhost:27017/lhs_s1007',REDIS_PREFIX:'s1007:',
 ARENA_SETTLEMENT_ENABLED:'1',ARENA_SETTLEMENT_APPROVED:'1',ARENA_SETTLEMENT_ACTIVATION_AT:1791028800000,
 EVENT_SETTLEMENT_ACTIVATION_AT:1791028800000})) assert.equal(game.env[key],value,key);
const baseline=require('child_process').execFileSync('pm2',['jlist'],{encoding:'utf8'});
const liveBot=JSON.parse(baseline).find(x=>x.name==='lhs-real-bots-s6').pm2_env;
for(const [key,value] of Object.entries(bot.env))if(key.startsWith('BOT_')&&!['BOT_WORKER_SERVER_ID','BOT_WORKER_WS_URL','BOT_WORKER_ACTIVITY_URL'].includes(key))assert.equal(String(value),String(liveBot[key]),key);
const gate=require(STAGE+'/bot_s7.js');
assert.equal(gate.S7_OPEN_TIME,1791028800000);assert.equal(gate.validateConfig(bot.env).openTime,1791028800000);
assert.equal(gate.validateConfig(bot.env).readyUrl,'http://127.0.0.1:9206/ready');
(async()=>{
let now=1791028799999,make=0,start=0,callback,readies=0;
const g=gate.createGate({env:bot.env,now:()=>now,schedule:f=>(callback=f,1),cancel:()=>{},
 ready:async()=>{readies++;return true;},makeWorker:()=>{make++;return{start:()=>start++,stop(){}};},onError:e=>{throw e;}});
await g.start();assert.equal(make,0);assert.equal(readies,0);now++;await callback();assert.equal(make,1);assert.equal(start,1);g.stop();
console.log('CANDIDATE_VALIDATED:oldAppsPreserved,newIdentityIsolated,botLimitsMatchLive,botBoundaryPass');
})().catch(e=>{console.error(e.stack);process.exit(1)});
'''.replace('STAGE', json.dumps(stage))
    print(node(ssh, source).strip(), flush=True)


def qa(ssh):
    source = (ROOT / "_ai_workbench/tools/qa_server6_launch_20260926.js").read_text(encoding="utf-8")
    for old, new in [("1006", "1007"), ("1790424000000", str(OPEN)),
                     ("1790478000000", str(OPEN)), ("9205", str(WS_PORT)),
                     ("/ws-s6", PUBLIC_PATH), ("server6", "server7"),
                     ("SERVER6", "SERVER7"), ("S6", "S7"),
                     ("qa_s6_gate_readonly_20260920", "qa_s7_gate_readonly_20261003"),
                     ("103.116.105.154", "103.116.104.165")]:
        source = source.replace(old, new)
    source = source.replace("8086, 8087", "8086, 8087, 8088")
    output = run(ssh, "node -", input_text=source, timeout=240)
    line = next((row for row in reversed(output.splitlines()) if row.startswith("SERVER7_LAUNCH_QA=")), None)
    if not line:
        raise RuntimeError("S7_QA_OUTPUT_MISSING:" + output[-1200:])
    return json.loads(line.split("=", 1)[1])


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    mode = sys.argv[1] if len(sys.argv) > 1 else "audit"
    if mode not in ("audit", "apply"):
        raise SystemExit("usage: deploy_server7_launch_20261003.py [audit|apply]")
    OUT.mkdir(parents=True, exist_ok=True)
    ssh = connect()
    changed = []
    backup_path = None
    inserted = False
    try:
        before, files = state(ssh)
        mongo = before["mongo"]
        if mongo["now"] >= OPEN:
            raise RuntimeError("OPEN_TIME_ALREADY_PASSED")
        if any(int(row.get("serverId", 0)) == SID for row in mongo["rows"]):
            raise RuntimeError("S7_ROW_EXISTS")
        if mongo["collections"] or mongo["players"] or mongo["roles"]:
            raise RuntimeError("S7_DATA_EXISTS")
        if any(row.get("name") in ("lhs-s1007", "lhs-real-bots-s7") for row in before["pm2"]):
            raise RuntimeError("S7_PROCESS_EXISTS")
        listeners = run(ssh, "ss -lnt")
        if f":{HTTP_PORT} " in listeners or f":{WS_PORT} " in listeners:
            raise RuntimeError("S7_PORT_BUSY")
        for port in PORTS.values():
            ready(ssh, port)
        before['webgm'] = webgm_ready(ssh)
        if mode == "audit":
            evidence = {"mode": mode, "serverId": SID, "openTime": OPEN,
                        "openLocal": "2026-10-03 19:00:00 +07:00", "before": before,
                        "crossPoolAutoInclude": True}
            path = OUT / "audit.json"
            path.write_text(json.dumps(evidence, ensure_ascii=False, indent=2), encoding="utf-8")
            print(json.dumps({"evidence": str(path), "result": evidence}, ensure_ascii=False))
            return
        candidates = {
            "ecosystem": patch_ecosystem(files["ecosystem"]["data"]),
            "nginx": patch_nginx(files["nginx"]["data"]),
            "webgm_env": patch_webgm(files["webgm_env"]["data"]),
            "bot_s7": patch_bot(files["bot_s6"]["data"]),
        }
        stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        backup_path = "/linhhoasu/_ai_workbench/backups/server7_launch_20261003_" + stamp
        backup(ssh, files, before, backup_path)
        # Validate syntax before touching live files. Candidate execution uses the
        # live require() base; comparison confirms only the S7 route changes old apps.
        stage = OUT.name
        remote_stage = '/linhhoasu/_ai_workbench/temp/' + stage
        run(ssh, 'install -d -m 700 ' + shlex.quote(remote_stage))
        with ssh.open_sftp() as sftp:
            for key, data in candidates.items():
                with sftp.open(remote_stage + '/' + key + '.js', 'wb') as out:
                    out.write(data)
            bot_path = APP + '/scripts/start-scheduled-bots-s7.js'
            try:
                sftp.stat(bot_path)
                raise RuntimeError('S7_BOT_ALREADY_EXISTS')
            except FileNotFoundError:
                pass
        run(ssh, 'node --check ' + remote_stage + '/ecosystem.js && node --check ' + remote_stage + '/bot_s7.js')
        validate_candidate(ssh, remote_stage)
        for key in ('ecosystem', 'nginx', 'webgm_env'):
            write_cas(ssh, files[key], candidates[key])
            changed.append(FILES[key])
        webgm_ready(ssh)
        with ssh.open_sftp() as sftp:
            with sftp.open(bot_path, 'wb') as out:
                out.write(candidates['bot_s7'])
            sftp.chmod(bot_path, 0o644)
        changed.append(bot_path)
        insert_result = insert_metadata(ssh)
        inserted = True
        changed.append("S7 metadata")
        # The game must be reachable before publication; the metadata remains closed.
        start_s7(ssh)
        changed.append("lhs-s1007")
        run(ssh, "nginx -t && nginx -s reload")
        changed.append("nginx reload")
        for name in ROUTE_NAMES:
            item = next(p for p in before['pm2'] if p['name'] == name)
            add_route_and_restart(ssh, item)
            changed.append(name + " route")
            print(name + '_S7_ROUTE_READY', flush=True)
        print(publish(ssh), flush=True)
        changed.append("S7 published")
        start_bot(ssh)
        changed.append("lhs-real-bots-s7")
        run(ssh, "pm2 save")
        qa_result = qa(ssh)
        qa_result['webgm'] = webgm_ready(ssh)
        after, final_files = state(ssh)
        row = next((row for row in after["mongo"]["rows"] if int(row.get("serverId", 0)) == SID), None)
        if not row or row.get("openTime") != OPEN or row.get("running") is not True or row.get("status") != 1:
            raise RuntimeError("S7_READBACK_METADATA_FAILED")
        if after["mongo"]["players"] != 0 or after["mongo"]["roles"] != 0:
            raise RuntimeError("S7_EARLY_ROLE_CREATED")
        if any(row.get("status") != "online" for row in after["pm2"] if row.get("name") in ROUTE_NAMES + ["lhs-s1007"]):
            raise RuntimeError("S7_PROCESS_NOT_ONLINE")
        for key in ('ecosystem', 'nginx', 'webgm_env'):
            if final_files[key]['data'] != candidates[key]:
                raise RuntimeError('FINAL_FILE_DRIFT:'+key)
        if final_files['bot_s6']['data'] != files['bot_s6']['data']:
            raise RuntimeError('S6_BOT_CHANGED')
        for name in ROUTE_NAMES:
            proc=next(p for p in after['pm2'] if p['name']==name)
            assert proc['env']['WS_PUBLIC_PATH_1007']=='/ws-s7'
            assert json.loads(proc['env']['SERVER_NODE_HTTP_MAP'])['1007']=='http://127.0.0.1:8088'
        game=next(p for p in after['pm2'] if p['name']=='lhs-s1007')
        assert game['env']['SERVER_OPEN_TIME']==OPEN
        assert game['env']['IDENTITY_MONGO_DB']=='lhs_s1001'
        assert game['env']['MONGO_URI']=='mongodb://localhost:27017/lhs_s1007'
        assert game['env']['REDIS_PREFIX']=='s1007:'
        assert [x for x in after['mongo']['rows'] if int(x['serverId'])!=SID]==before['mongo']['rows']
        with ssh.open_sftp() as sftp:
            assert sftp.open(bot_path,'rb').read()==candidates['bot_s7']
        bot_local=ROOT/'linhhoasu/lhs/newServer/scripts/start-scheduled-bots-s7.js'
        if bot_local.exists() and bot_local.read_bytes()!=candidates['bot_s7']:
            raise RuntimeError('LOCAL_S7_BOT_CONFLICT')
        bot_local.write_bytes(candidates['bot_s7'])
        evidence = {"result": "DEPLOYED_SCHEDULED", "serverId": SID,
                    "openTime": OPEN, "openLocal": "2026-10-03 19:00:00 +07:00",
                    "backup": backup_path, "changed": changed,
                    "insert": insert_result, "qa": qa_result,
                    "before": before, "after": after,
                    "finalFiles": public_files(final_files)}
        path = OUT / "evidence.json"
        path.write_text(json.dumps(evidence, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps({"evidence": str(path), "result": evidence}, ensure_ascii=False))
    except Exception as error:
        failure = {'result':'INCOMPLETE','error':str(error),'changed':changed,'backup':backup_path,
                   'rollback':'Close S7 metadata by exact serverId/openTime, stop only S7 processes; CAS-restore changed files from backup and restore S1-S6 route env from state.json. Never remove player data.'}
        (OUT / 'failure.json').write_text(json.dumps(failure,ensure_ascii=False,indent=2),encoding='utf-8')
        print(json.dumps(failure,ensure_ascii=False),flush=True)
        raise
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
