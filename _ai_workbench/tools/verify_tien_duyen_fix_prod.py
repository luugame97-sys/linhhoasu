"""Read-only post-deploy verification for the Tiên duyên Activity 9 fix."""
from __future__ import annotations

import getpass
import json
import shlex
from pathlib import Path

import paramiko


HOST = "103.116.105.154"


def q(value: str) -> str:
    return shlex.quote(value)


def run(ssh: paramiko.SSHClient, command: str, timeout: int = 90) -> tuple[int, str, str]:
    _stdin, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    return stdout.channel.recv_exit_status(), out, err


def main() -> None:
    password = getpass.getpass("VPS password (not logged): ")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(
        HOST,
        username="root",
        password=password,
        look_for_keys=False,
        allow_agent=False,
        timeout=20,
        banner_timeout=20,
        auth_timeout=20,
    )
    try:
        checks: dict[str, object] = {}

        code, out, err = run(ssh, "curl -sS -w '\\nHTTP_CODE=%{http_code}' http://127.0.0.1:8080/ready")
        checks["ready"] = {"exit": code, "output": out.strip(), "stderr": err.strip()}

        code, out, err = run(
            ssh,
            "pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{for(const p of JSON.parse(s)){if([\"lhs-s1001\",\"lhs-dist\",\"lhs-admin\",\"lhs-real-bots\"].includes(p.name)){const e=p.pm2_env||{};console.log(JSON.stringify({name:p.name,pid:p.pid,status:e.status,restarts:e.restart_time,uptime:e.pm_uptime}))}}})'",
        )
        checks["pm2"] = {"exit": code, "output": out.strip(), "stderr": err.strip()}

        code, out, err = run(ssh, "ss -lnt | grep -E ':(81|8080|9200|3001|9097)\\b' || true")
        checks["listeners"] = {"exit": code, "output": out.strip(), "stderr": err.strip()}

        config_probe = (
            "const c=require('/linhhoasu/lhs/newServer/src/services/ConfigService');"
            "const t=c.loadAllTables();const p=t.PayConfig||{};"
            "console.log(JSON.stringify({tables:Object.keys(t).length,pay10501:p[10501],pay10502:p[10502]}));"
            "if(Object.keys(t).length!==714||Number(p[10501]?.priceR)!==68||Number(p[10502]?.priceR)!==68)process.exit(2);"
        )
        code, out, err = run(
            ssh,
            f"CONFIG_BIN_PATH=/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin node -e {q(config_probe)}",
            timeout=120,
        )
        checks["server_config"] = {"exit": code, "output": out.strip(), "stderr": err.strip()}

        # Verify which config candidate the running app would select by
        # default.  This is read-only and intentionally reports paths/hashes,
        # never config contents beyond the two target prices.
        default_config_probe = (
            "const fs=require('fs'),path=require('path');"
            "const a=['/linhhoasu/lhs/LHS-re/update/resource/assets/excel/config_e5ac72c2.bin',"
            "'/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin'];"
            "const chosen=a.find(fs.existsSync)||null;"
            "console.log(JSON.stringify({configEnv:process.env.CONFIG_BIN_PATH||null,chosen,exists:a.map(p=>({path:p,exists:fs.existsSync(p)}))}));"
        )
        code, out, err = run(ssh, f"cd /linhhoasu/lhs/newServer && node -e {q(default_config_probe)}")
        checks["default_config_candidate"] = {"exit": code, "output": out.strip(), "stderr": err.strip()}

        require_probe = (
            "require('/linhhoasu/lhs/newServer/src/services/Activity9Service');"
            "require('/linhhoasu/lhs/newServer/src/services/RechargeBenefitService');"
            "require('/linhhoasu/lhs/newServer/src/handlers/activity');"
            "require('/linhhoasu/lhs/newServer/src/handlers/compat');"
            "require('/linhhoasu/lhs/newServer/src/handlers/recharge');"
            "require('/linhhoasu/lhs/newServer/src/handlers/account');"
            "console.log('MODULES_OK');"
        )
        code, out, err = run(ssh, f"node -e {q(require_probe)}", timeout=120)
        checks["modules"] = {"exit": code, "output": out.strip(), "stderr": err.strip()}

        pm2_env_probe = (
            "pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{"
            "for(const p of JSON.parse(s)){if(p.name===\"lhs-s1001\"){const e=(p.pm2_env&&p.pm2_env.env)||{};"
            "console.log(JSON.stringify({CONFIG_BIN_PATH:e.CONFIG_BIN_PATH||null,NODE_ENV:e.NODE_ENV||null,SERVER_ID:e.SERVER_ID||null}))}}})'"
        )
        code, out, err = run(ssh, pm2_env_probe)
        checks["pm2_runtime_config_env"] = {"exit": code, "output": out.strip(), "stderr": err.strip()}

        served_probe = (
            "set -eu; "
            "for u in / /js/main.min_a6195824.js /update/resource/assets/excel/config_e5ac72c2.bin; do "
            "f=/tmp/tien_duyen_verify.$$; "
            "code=$(curl -sS -o \"$f\" -w '%{http_code}' --max-time 20 \"http://127.0.0.1:81$u\"); "
            "printf '%s|%s|' \"$u\" \"$code\"; sha256sum \"$f\" | awk '{print $1}'; rm -f -- \"$f\"; "
            "done"
        )
        code, out, err = run(ssh, served_probe, timeout=90)
        checks["served"] = {"exit": code, "output": out.strip(), "stderr": err.strip()}

        # Only inspect recent error lines; do not print full logs or secrets.
        log_probe = (
            "for f in /root/.pm2/logs/lhs-s1001-error.log /root/.pm2/logs/lhs-s1001-out.log; do "
            "if [ -f \"$f\" ]; then echo ---$f; tail -n 160 \"$f\" | "
            "grep -E 'Activity9|activity9|SyntaxError|ReferenceError|TypeError|Unhandled|ECONN|FATAL' | tail -n 40 || true; fi; done"
        )
        code, out, err = run(ssh, log_probe, timeout=60)
        checks["relevant_log_lines"] = {"exit": code, "output": out.strip(), "stderr": err.strip()}

        # Anonymous, aggregate-only persistence proof after a real browser
        # login.  Do not print account, role, player IDs, or document samples.
        mongo_probe = r'''mongosh --quiet 'mongodb://127.0.0.1:27017/lhs_s1001' --eval '
const p=db.getSiblingDB("lhs_s1001").players;
const ids=[9001,9002,9004,9005,9051,9052,9101];
const rows=p.aggregate([
  {$unwind:"$activityInfo.datas"},
  {$match:{"activityInfo.datas.id":{$in:ids}}},
  {$group:{
    _id:"$activityInfo.datas.id",
    players:{$sum:1},
    minScore:{$min:"$activityInfo.datas.score"},
    maxScore:{$max:"$activityInfo.datas.score"},
    minStartTime:{$min:"$activityInfo.datas.startTime"},
    maxEndTime:{$max:"$activityInfo.datas.endTime"},
    purchased:{$sum:{$cond:[
      {$gt:[{$size:{$setIntersection:[{$ifNull:["$activityInfo.datas.recordList",[]]},[10501,10502]]}},0]},
      1,
      0
    ]}}
  }},
  {$sort:{_id:1}}
]).toArray();
const recharge=p.aggregate([
  {$unwind:"$rechargeInfo.records"},
  {$match:{"rechargeInfo.records.id":{$in:[10501,10502]}}},
  {$group:{_id:"$rechargeInfo.records.id",players:{$sum:1},totalCount:{$sum:"$rechargeInfo.records.count"}}},
  {$sort:{_id:1}}
]).toArray();
print(JSON.stringify({activity9:rows,recharge:recharge}));
' '''
        code, out, err = run(ssh, mongo_probe, timeout=120)
        checks["activity9_persistence_aggregate"] = {
            "exit": code,
            "output": out.strip(),
            "stderr": err.strip(),
        }

        # Detect leftover staged files without deleting them.
        code, out, err = run(
            ssh,
            "find /linhhoasu/lhs /linhhoasu/webgame/game -type f -name '*tien-duyen-*' -print 2>/dev/null | sort",
        )
        checks["leftover_staging"] = {"exit": code, "output": out.strip(), "stderr": err.strip()}

        print(json.dumps(checks, ensure_ascii=False, indent=2))
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
