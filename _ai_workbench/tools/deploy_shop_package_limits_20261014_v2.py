"""Roll out paid daily package limits and the matching native ShopConfig bytes.

The deploy is selective: it patches only ShopConfig[4000002..4000006] on the
four exact production binaries and the server overlay. Every file is backed up
before the CAS swap; game processes are restarted one at a time and readiness
is polled before continuing.
"""
from __future__ import annotations

import ast
import hashlib
import json
import shlex
import time
from datetime import datetime, timezone
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[2]
LOCAL_SOURCE = ROOT / "linhhoasu/lhs/newServer/src/config/petPackageUnlimited.js"
REMOTE_ROOT = "/linhhoasu"
REMOTE_SOURCE = f"{REMOTE_ROOT}/lhs/newServer/src/config/petPackageUnlimited.js"
CREDS = ROOT / "_ai_workbench/VPS103.116.104.165.txt"
OUT = ROOT / "_ai_workbench/temp/shop_package_limits_20261014"
NODES = [(f"lhs-s{sid}", port) for sid, port in zip(range(1001, 1009), [8080, 8083, 8084, 8085, 8086, 8087, 8088, 8089])]
REMOTE_BINARIES = [
    f"{REMOTE_ROOT}/lhs/update/resource/assets/excel/config_fashion_20260909.bin",
    f"{REMOTE_ROOT}/lhs/update/resource/assets/excel/config_e5ac72c2.bin",
    f"{REMOTE_ROOT}/webgame/game/update/resource/assets/excel/config_fashion_20260909.bin",
    f"{REMOTE_ROOT}/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin",
]


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def q(value: str) -> str:
    return shlex.quote(value)


def connect() -> paramiko.SSHClient:
    host, user, password = CREDS.read_text(encoding="utf-8-sig").splitlines()
    client = paramiko.SSHClient()
    client.load_system_host_keys()
    client.set_missing_host_key_policy(paramiko.RejectPolicy())
    client.connect(host, username=user, password=password, look_for_keys=False, allow_agent=False, timeout=20)
    return client


def run(client: paramiko.SSHClient, command: str, timeout: int = 120) -> str:
    _, stdout, stderr = client.exec_command(command, timeout=timeout)
    output = stdout.read().decode("utf-8", "replace")
    error = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError(f"REMOTE_RC{code}:{error[-1500:]}:{output[-800:]}")
    return output


def remote_hash(client: paramiko.SSHClient, path: str) -> str:
    return run(client, f"sha256sum -- {q(path)} | awk '{{print $1}}'").strip()


def process_snapshot(client: paramiko.SSHClient) -> list[dict]:
    code = (
        "const a=JSON.parse(require('child_process').execFileSync('pm2',['jlist'],{encoding:'utf8'}));"
        "console.log(JSON.stringify(a.map(p=>({name:p.name,pid:p.pid,status:p.pm2_env.status,restart_time:p.pm2_env.restart_time}))))"
    )
    return json.loads(run(client, "node -e " + q(code)))


def readiness(client: paramiko.SSHClient, port: int) -> dict:
    last = ""
    for _ in range(45):
        try:
            raw = run(client, f"curl -fsS --max-time 5 http://127.0.0.1:{port}/ready", 15)
            last = raw
            body = json.loads(raw)
            if body.get("status") == "ok" and body.get("checks", {}).get("mongo") is True and body.get("checks", {}).get("redis") is True:
                return body
        except Exception as exc:  # readiness is expected to fail during restart
            last = str(exc)
        time.sleep(2)
    raise RuntimeError(f"READINESS_TIMEOUT:{port}:{last[-600:]}")


REMOTE_PATCHER = r'''const fs=require('fs'),path=require('path'),zlib=require('zlib'),crypto=require('crypto');
const {BinJsonUtil,ByteArray}=require('/linhhoasu/lhs/newServer/src/protocol/BinJsonUtil');
const source=process.env.PACKAGE_SOURCE, sourceStage=process.env.PACKAGE_SOURCE_STAGE;
const backup=process.env.PACKAGE_BACKUP, stage=process.env.PACKAGE_STAGE;
const files=JSON.parse(process.env.PACKAGE_BINARIES);
const ids=[4000002,4000003,4000004,4000005,4000006];
function hash(b){return crypto.createHash('sha256').update(b).digest('hex');}
function chunks(b){let a=[],o=0;while(o<b.length){const s=o,n=b[o++],name=b.toString('utf8',o,o+n);o+=n;const l=b.readUInt32BE(o);o+=4;const c=b.subarray(o,o+l);o+=l;const x=zlib.inflateSync(c);a.push({name,raw:b.subarray(s,o),value:BinJsonUtil.readFullJson(new ByteArray(x.buffer.slice(x.byteOffset,x.byteOffset+x.byteLength)))});}if(o!==b.length)throw Error('BIN_TRAILING');return a;}
function encode(name,v){const n=Buffer.from(name),o=new ByteArray(undefined,1024*1024);BinJsonUtil.json2bin(v,o);const c=zlib.deflateSync(Buffer.from(o.buffer),{level:6}),h=Buffer.alloc(1+n.length+4);h.writeUInt8(n.length);n.copy(h,1);h.writeUInt32BE(c.length,1+n.length);return Buffer.concat([h,c]);}
function patch(b){const cs=chunks(b),sh=cs.find(x=>x.name==='ShopConfig');if(!sh)throw Error('SHOP_CONFIG_MISSING');const v={...sh.value};for(const id of ids){const k=String(id),r=v[k]||v[id];if(!r||Number(r.id)!==id||Number(r.payId)!==id||Number(r.tab)!==4)throw Error('SHOP_ROW_INVALID:'+id);v[k]={...r,limit:0,limitType:0};}const out=Buffer.concat(cs.map(x=>x===sh?encode(x.name,v):x.raw));const chk=chunks(out).find(x=>x.name==='ShopConfig').value;for(const id of ids){const r=chk[String(id)];if(!r||r.limit!==0||r.limitType!==0)throw Error('SHOP_VERIFY:'+id);}return out;}
function copyPreserve(src,dst){fs.mkdirSync(path.dirname(dst),{recursive:true});fs.copyFileSync(src,dst);const st=fs.statSync(src);fs.chmodSync(dst,st.mode&0o7777);try{fs.chownSync(dst,st.uid,st.gid);}catch(_e){}}
const before={},after={};let swapped=[],prepared=[];
try{
  before[source]=hash(fs.readFileSync(source));
  if(before[source]!==process.env.PACKAGE_SOURCE_HASH)throw Error('SOURCE_CAS_PREIMAGE');
  copyPreserve(source,backup+'/petPackageUnlimited.js');
  fs.copyFileSync(sourceStage,stage+'/petPackageUnlimited.js');
  files.forEach((file,i)=>{const b=fs.readFileSync(file);before[file]=hash(b);const out=patch(b);after[file]=hash(out);const st=stage+'/binary_'+i+'.bin';fs.writeFileSync(st,out,{flag:'wx'});fs.chmodSync(st,fs.statSync(file).mode&0o7777);prepared.push({file,stage:st,backup:backup+'/binary_'+i+'.bin',before:before[file],after:after[file],bytesBefore:b.length,bytesAfter:out.length});});
  for(const p of prepared){copyPreserve(p.file,p.backup);if(hash(fs.readFileSync(p.file))!==p.before)throw Error('BIN_CAS_PREIMAGE:'+p.file);}
  if(hash(fs.readFileSync(source))!==before[source])throw Error('SOURCE_CAS_CHANGED');
  const sourceTmp=source+'.shop_package_limits.tmp';fs.copyFileSync(sourceStage,sourceTmp);fs.chmodSync(sourceTmp,fs.statSync(source).mode&0o7777);fs.renameSync(sourceTmp,source);swapped.push(source);
  for(const p of prepared){const tmp=p.file+'.shop_package_limits.tmp';fs.copyFileSync(p.stage,tmp);fs.chmodSync(tmp,fs.statSync(p.file).mode&0o7777);fs.renameSync(tmp,p.file);swapped.push(p.file);}
  if(hash(fs.readFileSync(source))!==hash(fs.readFileSync(sourceStage)))throw Error('SOURCE_POSTIMAGE');
  for(const p of prepared)if(hash(fs.readFileSync(p.file))!==p.after)throw Error('BIN_POSTIMAGE:'+p.file);
  console.log('RECEIPT:'+JSON.stringify({before,after,prepared}));
}catch(e){for(const file of swapped){const b=file===source?backup+'/petPackageUnlimited.js':prepared?.find(p=>p.file===file)?.backup;if(b&&fs.existsSync(b)){const tmp=file+'.shop_package_limits.rollback.tmp';fs.copyFileSync(b,tmp);fs.renameSync(tmp,file);}}console.error(e.stack||e);process.exit(1);}
'''


def runtime_readback(client: paramiko.SSHClient) -> dict:
    code = (
        "const C=require('/linhhoasu/lhs/newServer/src/services/ConfigService');"
        "const t=C.reload(),s=t.ShopConfig||{};"
        "const ids=[4000001,4000002,4000003,4000004,4000005,4000006,4000007,4000008,4000103];"
        "const rows=ids.map(id=>{const r=s[id]||s[String(id)]||{};return{id,limit:Number(r.limit),limitType:Number(r.limitType),payId:Number(r.payId),tab:Number(r.tab)}});"
        "for(const id of [4000002,4000003,4000004,4000005,4000006]){const r=rows.find(x=>x.id===id);if(!r||r.limit!==0||r.limitType!==0)throw Error('TARGET_WRONG:'+id)}"
        "for(const id of [4000001,4000007,4000008]){const r=rows.find(x=>x.id===id);if(!r||r.limit!==1||r.limitType!==1)throw Error('UNCHANGED_WRONG:'+id)}"
        "const w=rows.find(x=>x.id===4000103);if(!w||w.limit!==0||w.limitType!==0)throw Error('WEEKLY_REGRESSED');"
        "console.log(JSON.stringify({rows}));"
    )
    lines = [line.strip() for line in run(client, "node -e " + q(code), 120).splitlines() if line.strip()]
    return json.loads(lines[-1])


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup = f"{REMOTE_ROOT}/_ai_workbench/backups/shop_package_limits_20261014_v2_{stamp}"
    stage = f"{REMOTE_ROOT}/_ai_workbench/temp/shop_package_limits_20261014_v2_{stamp}"
    source_candidate = LOCAL_SOURCE.read_bytes()
    source_hash = sha(source_candidate)
    event = {
        "startedAt": datetime.now(timezone.utc).isoformat(), "result": "FAILED",
        "sourceCandidateHash": source_hash, "remoteSource": REMOTE_SOURCE,
        "remoteBinaries": REMOTE_BINARIES, "backup": backup, "stage": stage,
        "productionFileWrites": 0, "playerWrites": 0,
    }
    client = connect()
    restarted: list[str] = []
    swapped = False
    try:
        event["preProcesses"] = process_snapshot(client)
        game = {row["name"]: row for row in event["preProcesses"] if row["name"] in {n for n, _ in NODES}}
        if len(game) != len(NODES) or any(row["status"] != "online" for row in game.values()): raise RuntimeError("PROCESS_BASELINE")
        event["preReady"] = {str(port): readiness(client, port) for _, port in NODES}
        source_before = remote_hash(client, REMOTE_SOURCE)
        event["sourceBeforeHash"] = source_before
        if source_before == source_hash: raise RuntimeError("SOURCE_ALREADY_DEPLOYED")
        run(client, f"install -d -m 700 -- {q(backup)} {q(stage)}")
        stage_source = f"{stage}/petPackageUnlimited.js"
        with client.open_sftp() as sftp:
            with sftp.open(stage_source, "wb") as handle: handle.write(source_candidate)
        run(client, f"chmod 640 -- {q(stage_source)} && node --check {q(stage_source)}", 30)
        if remote_hash(client, stage_source) != source_hash: raise RuntimeError("SOURCE_STAGE_HASH")
        patch_path = f"{stage}/patch_package_limits.js"
        with client.open_sftp() as sftp:
            with sftp.open(patch_path, "wb") as handle: handle.write(REMOTE_PATCHER.encode())
        run(client, f"chmod 700 -- {q(patch_path)}")
        env = (
            f"PACKAGE_SOURCE={q(REMOTE_SOURCE)} PACKAGE_SOURCE_STAGE={q(stage_source)} "
            f"PACKAGE_SOURCE_HASH={q(source_before)} PACKAGE_BACKUP={q(backup)} PACKAGE_STAGE={q(stage)} "
            f"PACKAGE_BINARIES={q(json.dumps(REMOTE_BINARIES))}"
        )
        output = run(client, f"{env} node {q(patch_path)}", 180)
        marker = [line for line in output.splitlines() if line.startswith("RECEIPT:")]
        if not marker: raise RuntimeError(f"PATCH_NO_RECEIPT:{output[-2000:]}")
        receipt = json.loads(marker[-1][len("RECEIPT:"):])
        event["binaryReceipt"] = receipt
        event["productionFileWrites"] = 5
        swapped = True
        for name, port in NODES:
            run(client, f"pm2 restart {q(name)} --update-env", 120)
            readiness(client, port)
            restarted.append(name)
            event["restarts"] = restarted[:]
        event["runtimeConfig"] = runtime_readback(client)
        event["postReady"] = {str(port): readiness(client, port) for _, port in NODES}
        event["postProcesses"] = process_snapshot(client)
        event["sourceAfterHash"] = remote_hash(client, REMOTE_SOURCE)
        event["binaryAfterHashes"] = {path: remote_hash(client, path) for path in REMOTE_BINARIES}
        if event["sourceAfterHash"] != source_hash: raise RuntimeError("SOURCE_FINAL_HASH")
        if any(remote_hash(client, path) != receipt["after"][path] for path in REMOTE_BINARIES): raise RuntimeError("BINARY_FINAL_HASH")
        event["result"] = "PASS"; event["completedAt"] = datetime.now(timezone.utc).isoformat()
        print(json.dumps(event, ensure_ascii=False, indent=2))
    except Exception as exc:
        event["error"] = str(exc)
        # The remote patcher rolls back pre-restart failures. If a restart gate
        # fails, restore the exact source/binary backups and restart only nodes
        # already touched, then leave the receipt for audit.
        if swapped and event.get("binaryReceipt"):
            try:
                restore = " && ".join([
                    f"cp -- {q(backup + '/petPackageUnlimited.js')} {q(REMOTE_SOURCE + '.rollback.tmp')} && mv -f -- {q(REMOTE_SOURCE + '.rollback.tmp')} {q(REMOTE_SOURCE)}",
                    *[f"cp -- {q(backup + f'/binary_{i}.bin')} {q(path + '.rollback.tmp')} && mv -f -- {q(path + '.rollback.tmp')} {q(path)}" for i, path in enumerate(REMOTE_BINARIES)],
                ])
                run(client, restore, 120); event["rollback"] = "RESTORED"
                for name, port in NODES:
                    if name in restarted:
                        run(client, f"pm2 restart {q(name)} --update-env", 120); readiness(client, port)
            except Exception as rollback_error:
                event["rollback"] = "FAILED"; event["rollbackError"] = str(rollback_error)
        print(json.dumps(event, ensure_ascii=False, indent=2))
        raise
    finally:
        try: run(client, f"rm -rf -- {q(stage)}", 30)
        except Exception: pass
        client.close()
        (OUT / "deployment_v2.json").write_text(json.dumps(event, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__": main()
