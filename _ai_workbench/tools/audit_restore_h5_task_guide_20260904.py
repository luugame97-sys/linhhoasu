"""Independent read-only audit for the restored H5 task guide."""

import hashlib
import json
import os
import shlex
from datetime import datetime, timezone
from pathlib import Path

import paramiko


ROOT = Path(__file__).resolve().parents[1]
EXPECTED = {
    "/linhhoasu/webgame/game/js/main.min_a6195824.js": "3465c04109b4e9f86bdde981cb26d5fa2c674e42250d8f9bb09657979a7150a6",
    "/linhhoasu/webgame/game/index.html": "039efcbe9102f7006e3354f27241a5e41f3a227745218aa7c06b0d998086cb0e",
    "/linhhoasu/lhs/newServer/src/services/MapMonsterService.js": "e72a6104b07febea7db43519b0b0c1b7510db27c01000269d3d955a080c54df1",
    "/linhhoasu/lhs/newServer/src/services/EquipService.js": "6da1b8c26a616c3e933a72b6b80d36ee732dfafbd49a12af9be6be6acc818539",
    "/linhhoasu/lhs/newServer/src/handlers/item.js": "9965c53ad2e797348a9e8bd733db56f8c5ed085070c9cb18dcdf19386dcf7473",
}


def run(client, command, timeout=120):
    _, stdout, stderr = client.exec_command(command, timeout=timeout)
    output = stdout.read().decode("utf-8", "replace")
    error = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError((error + output)[-5000:])
    return output


def main():
    credentials = Path(os.environ["LHS_PROD_CREDENTIAL_FILE"]).read_text(
        encoding="utf-8-sig"
    ).splitlines()
    client = paramiko.SSHClient()
    client.load_system_host_keys()
    client.set_missing_host_key_policy(paramiko.RejectPolicy())
    client.connect(
        credentials[0].strip(), username="root", password=credentials[2],
        look_for_keys=False, allow_agent=False, timeout=20,
    )
    try:
        hashes = {
            path: run(client, "sha256sum " + shlex.quote(path)).split()[0]
            for path in EXPECTED
        }
        served_hash = run(
            client,
            "curl -fsS http://127.0.0.1:81/js/main.min_a6195824.js | sha256sum",
        ).split()[0]
        served_script = (
            'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{let c=x=>s.split(x).length-1;'
            'console.log(JSON.stringify({explicitStart:c("sOt.Start=function(t){var e;"),'
            'blanketGate:c("sOt.Start=function(t){if(!RuntimeUtil.isRuntime)return;var e;"),'
            'idleGate:c("AppInfo.ckState&&RuntimeUtil.isRuntime&&!this.isDuringGuide()"),'
            'taskCheck:c("m.checkGuide=function(t)"),taskDispatch:c("Y.GuideUtil.Start(e)"),'
            'doubleMonsters:c("Fq.animBorns._lhsDensity2=!0"),autoEquip:c("autoEquipUpgrade"),'
            'silentMode:c("_.onSilentMode=function(){U9.autoConfig.isSilentMode=!U9.autoConfig.isSilentMode}")}))})'
        )
        served_contract = json.loads(
            run(
                client,
                "curl -fsS http://127.0.0.1:81/js/main.min_a6195824.js | node -e "
                + shlex.quote(served_script),
            )
        )
        marker = "20260904_task_guide_restore1" in run(
            client, "curl -fsS http://127.0.0.1:81/"
        )
        pm2_script = (
            'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.stringify('
            'JSON.parse(s).filter(p=>["lhs-s1001","lhs-s1002","lhs-real-bots",'
            '"lhs-real-bots-s2","lhs-dist","lhs-admin"].includes(p.name)).map(p=>'
            '({name:p.name,pid:p.pid,status:p.pm2_env.status,restarts:p.pm2_env.restart_time})))))'
        )
        pm2 = json.loads(run(client, "pm2 jlist | node -e " + shlex.quote(pm2_script)))
        health_script = (
            'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{let x=JSON.parse(s),'
            'r=x.runtime||{},b=r.bots||{},m=r.mapMonsters||{};console.log(JSON.stringify('
            '{status:x.status,real:Number((b.real||{}).count)||0,virtual:Number(b.botCount)||0,'
            'totalSlots:Number(m.totalSlots)||0,multiplier:Number(m.densityMultiplier)||0,'
            'invalid:Number(m.invalid)||0}))})'
        )
        health = []
        for server, port in (("S1", 9200), ("S2", 9201)):
            value = json.loads(
                run(
                    client,
                    "curl -fsS http://127.0.0.1:{}/health | node -e {}".format(
                        port, shlex.quote(health_script)
                    ),
                )
            )
            value["server"] = server
            health.append(value)
        ready = {
            server: int(
                run(
                    client,
                    "curl -sS -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{}/ready".format(port),
                ).strip()
            )
            for server, port in (("S1", 8080), ("S2", 8083))
        }
        checks = {
            "hashes": hashes == EXPECTED,
            "servedHash": served_hash == EXPECTED["/linhhoasu/webgame/game/js/main.min_a6195824.js"],
            "servedMarker": marker,
            "explicitTaskGuide": served_contract["explicitStart"] == 1
            and served_contract["blanketGate"] == 0
            and served_contract["taskCheck"] == 1
            and served_contract["taskDispatch"] >= 1,
            "idleGuideStillGated": served_contract["idleGate"] == 1,
            "preservedFeatures": served_contract["doubleMonsters"] == 1
            and served_contract["autoEquip"] >= 1
            and served_contract["silentMode"] == 1,
            "pm2Online": len(pm2) == 6 and all(x["status"] == "online" for x in pm2),
            "ready200": ready == {"S1": 200, "S2": 200},
            "health": all(
                x["status"] == "ok" and x["real"] == 580 and x["virtual"] == 580
                and x["totalSlots"] == 2466 and x["multiplier"] == 2 and x["invalid"] == 0
                for x in health
            ),
        }
        payload = {
            "result": "PASS" if all(checks.values()) else "FAIL",
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "checks": checks,
            "hashes": hashes,
            "servedHash": served_hash,
            "servedContract": served_contract,
            "pm2": pm2,
            "ready": ready,
            "health": health,
        }
        output = ROOT / "temp" / "task_guide_restore_postdeploy_20260904.json"
        output.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
        evidence_hash = hashlib.sha256(output.read_bytes()).hexdigest()
        print(json.dumps({"result": payload["result"], "evidence": str(output), "sha256": evidence_hash, "checks": checks}))
        if payload["result"] != "PASS":
            raise SystemExit(1)
    finally:
        client.close()


if __name__ == "__main__":
    main()
