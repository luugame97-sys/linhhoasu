import json
import shlex
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parent))
from snapshot_web_multiserver_20260906 import connect, run

APP = '/linhhoasu/lhs/newServer'
PORTS = [8080, 8083, 8084, 8085, 8086]

def main():
    ssh = connect()
    try:
        # Check ready status
        ready = {}
        for port in PORTS:
            try:
                code = run(ssh, f"curl -s --max-time 3 -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{port}/ready || true").strip()
                ready[str(port)] = code
            except Exception as e:
                ready[str(port)] = 'ERR'
        print("Ready status:", json.dumps(ready))

        # Check PM2 status
        pm2_status = run(
            ssh,
            "pm2 jlist | node -e "
            + shlex.quote(
                "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.stringify(JSON.parse(s).filter(p=>/^lhs-s100[1-5]$/.test(p.name)).map(p=>({name:p.name,status:p.pm2_env.status,restarts:p.pm2_env.restart_time,uptime:Math.round((Date.now()-p.pm2_env.pm_uptime)/1000)})))));"
            ),
        ).strip()
        print("PM2 nodes:", pm2_status)

        # Run probe
        probe_cmd = (
            f"cd {shlex.quote(APP)} && node -e "
            + shlex.quote(
                "const rrr = require('./src/services/RechargeRewardResolver');"
                + "const rbs = require('./src/services/RechargeBenefitService');"
                + "const assert = require('assert');"
                + "assert.strictEqual(rrr.isOldTrekPassPayId(11121), true);"
                + "assert.strictEqual(rrr.isOldTrekPassPayId(11122), true);"
                + "const p = { playerId: 'vps_probe', other_attr_info: {} };"
                + "const r1 = rrr.resolveRechargeRewards(p, { payId: 11121, multi: 1 });"
                + "assert.strictEqual(r1.ok, true);"
                + "const b1 = rbs.applyRechargeBenefits(p, { payId: 11121 });"
                + "assert.strictEqual(b1.oldTrekPassUpdate.passRecord.buyRecord, 3);"
                + "const r2 = rrr.resolveRechargeRewards(p, { payId: 11122, multi: 1 });"
                + "assert.strictEqual(r2.ok, true);"
                + "const b2 = rbs.applyRechargeBenefits(p, { payId: 11122 });"
                + "assert.strictEqual(b2.oldTrekPassUpdate.passRecord.buyRecord, 7);"
                + "console.log(JSON.stringify({ vps_probe_success: true, dest1_fund_reward_rows: r1.rows.length, dest1_advanced_reward_rows: r2.rows.length, final_buyRecord: b2.oldTrekPassUpdate.passRecord.buyRecord, sailors_granted: p.other_attr_info.oldTrekInfo.sailorList.map(s => s.id) }));"
            )
        )
        probe_output = run(ssh, probe_cmd).strip()
        last_line = probe_output.splitlines()[-1]
        print("Probe result:", last_line)

    finally:
        ssh.close()

if __name__ == '__main__':
    main()
