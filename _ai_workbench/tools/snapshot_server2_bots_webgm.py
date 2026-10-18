"""Snapshot read-only bot capacity and WebGM production source without secrets."""
from __future__ import annotations

import hashlib
import json
import os
import stat
from datetime import datetime, timezone
from pathlib import Path

import paramiko


HOST = "103.116.105.154"
ROOT = Path(__file__).resolve().parents[1]
WEBGM_ROOT = "/linhhoasu/webgame/gm"
WEBGM_FILES = [
    "config.php",
    "index.php",
    "login.php",
    "api/user_api.php",
    "api/sepay_webhook.php",
    "admin/admin_api.php",
    "admin/index.php",
    "assets/js/index.js",
    "assets/js/login.js",
    "assets/js/admin.js",
]


def run(ssh: paramiko.SSHClient, command: str, timeout: int = 120) -> tuple[int, str, str]:
    _, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    output = stdout.read().decode("utf-8", "replace")
    error = stderr.read().decode("utf-8", "replace")
    return stdout.channel.recv_exit_status(), output, error


def main() -> None:
    lines = [line.strip() for line in Path(os.environ["LHS_PROD_CREDENTIAL_FILE"]).read_text(encoding="utf-8-sig").splitlines() if line.strip()]
    if len(lines) != 3 or lines[0] != HOST or lines[1] != "root":
        raise RuntimeError("CREDENTIAL_FILE_TARGET_MISMATCH")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    out_dir = ROOT / "temp" / f"server2_bots_webgm_snapshot_{stamp}"
    out_dir.mkdir(parents=True, exist_ok=False)

    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
    ssh.connect(HOST, username="root", password=lines[2], look_for_keys=False, allow_agent=False, timeout=20)
    try:
        manifest = []
        sftp = ssh.open_sftp()
        try:
            for rel in WEBGM_FILES:
                remote = f"{WEBGM_ROOT}/{rel}"
                try:
                    remote_stat = sftp.stat(remote)
                except FileNotFoundError:
                    manifest.append({"remote": remote, "missing": True})
                    continue
                if not stat.S_ISREG(remote_stat.st_mode):
                    continue
                local = out_dir / "webgm" / rel
                local.parent.mkdir(parents=True, exist_ok=True)
                sftp.get(remote, str(local))
                manifest.append({
                    "remote": remote,
                    "local": str(local),
                    "bytes": local.stat().st_size,
                    "sha256": hashlib.sha256(local.read_bytes()).hexdigest(),
                })
        finally:
            sftp.close()

        command = r"""
date '+TIME=%F %T %z'
echo LOAD
uptime
free -m
df -h / | tail -1
echo PM2_RESOURCES
pm2 jlist | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const p of JSON.parse(s)){if(["lhs-s1001","lhs-s1002","lhs-real-bots","lhs-real-bots-s2","lhs-dist","lhs-admin"].includes(p.name)){const e=p.pm2_env||{},m=p.monit||{};console.log(JSON.stringify({name:p.name,pid:p.pid,status:e.status,restarts:e.restart_time,cpu:m.cpu,memory:m.memory}))}}})'
echo S1_HEALTH
curl -sS --max-time 10 http://127.0.0.1:9200/health | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const x=JSON.parse(s),r=x.runtime||{},b=r.bots||{},real=b.real||{},m=r.mapMonsters||{};console.log(JSON.stringify({status:x.status,clients:r.clients,botsEnabled:b.enabled,virtualBots:b.botCount,realBots:real.count,invalid:m.invalid,claims:m.claims,completed:m.completed}))})'
echo S2_HEALTH
curl -sS --max-time 10 http://127.0.0.1:9201/health | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const x=JSON.parse(s),r=x.runtime||{},b=r.bots||{},real=b.real||{},m=r.mapMonsters||{};console.log(JSON.stringify({status:x.status,clients:r.clients,botsEnabled:b.enabled,virtualBots:b.botCount||0,realBots:real.count||0,invalid:m.invalid||0,claims:m.claims||0,completed:m.completed||0}))})'
echo S2_COUNTS
mongosh --quiet mongodb://127.0.0.1:27017/lhs_s1002 --eval 'JSON.stringify({accounts:db.accounts.countDocuments({}),players:db.players.countDocuments({}),bots:db.players.countDocuments({isBot:true}),humans:db.players.countDocuments({isBot:{$ne:true}}),unflaggedBotPrefix:db.players.countDocuments({isBot:{$ne:true},userId:/^lhs_real_bot_/}),gateProbe:db.players.countDocuments({userId:/^gate_probe_only/}),otherHumans:db.players.countDocuments({isBot:{$ne:true},userId:{$not:/^(lhs_real_bot_|gate_probe_only)/}})})'
echo S2_IDENTITY_ROLES
mongosh --quiet mongodb://127.0.0.1:27017/lhs_s1001 --eval 'JSON.stringify({accountsWithS2Roles:db.accounts.countDocuments({"roles.serverId":1002}),s2RoleCount:db.accounts.aggregate([{$unwind:"$roles"},{$match:{"roles.serverId":1002}},{$count:"n"}]).toArray()})'
echo WEBGM_ENV_FLAGS
cd /linhhoasu/webgame/gm && php -r '$p=".env";$a=[];foreach(file($p,FILE_IGNORE_NEW_LINES|FILE_SKIP_EMPTY_LINES)?:[] as $line){$line=trim($line);if($line===""||$line[0]==="#"||strpos($line,"=")===false)continue;[$k,$v]=array_map("trim",explode("=",$line,2));if(preg_match("/(SERVER|API|GAME|LHS)/i",$k))$a[$k]=($v!=="");}ksort($a);echo json_encode($a,JSON_UNESCAPED_UNICODE),PHP_EOL;'
echo WEBGM_HTTP
curl -sS -o /dev/null -w 'login=%{http_code}\n' http://127.0.0.1:88/login.php
curl -sS -o /dev/null -w 'index=%{http_code}\n' http://127.0.0.1:88/index.php
echo S2_BOT_FARM_LOG
tail -2000 /root/.pm2/logs/lhs-real-bots-s2-out.log 2>/dev/null | grep -E 'map-farm (open|claim)' | tail -20 | sed -E 's/id=[^ ]+/id=[REDACTED]/g' || true
echo S2_BOT_ERRORS
tail -500 /root/.pm2/logs/lhs-real-bots-s2-out.log 2>/dev/null | grep -Ei 'error|timeout|failed|denied' | tail -20 | sed -E 's/id=[^ :]+/id=[REDACTED]/g' || true
"""
        code, runtime, error = run(ssh, command)
        if code:
            raise RuntimeError(error or runtime)
        (out_dir / "runtime.txt").write_text(runtime, encoding="utf-8")
        (out_dir / "manifest.json").write_text(
            json.dumps({"host": HOST, "generatedAt": datetime.now(timezone.utc).isoformat(), "files": manifest}, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        print(json.dumps({"result": "PASS", "snapshot": str(out_dir), "files": len(manifest)}, ensure_ascii=False))
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
