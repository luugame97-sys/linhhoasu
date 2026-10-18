"""Read-only verification for the 2x normal-map monster deployment."""

import hashlib
import json
import os
import shlex
from datetime import datetime, timezone
from pathlib import Path

import paramiko


ROOT = Path(__file__).resolve().parents[1]
APP = "/linhhoasu/lhs/newServer"
FILES = [
    APP + "/src/services/MapMonsterService.js",
    "/linhhoasu/webgame/game/js/main.min_a6195824.js",
    "/linhhoasu/webgame/game/index.html",
]
EXPECTED_HASHES = {
    FILES[0]: "e72a6104b07febea7db43519b0b0c1b7510db27c01000269d3d955a080c54df1",
    FILES[1]: "e0dc168341c2883e9c45bb147507e9ab06e52111e325a52b5dbe586aca494513",
    FILES[2]: "a41a73ba2608cbffd5cc2775f424a8a6d31eb5889217114f4a26621ff689bd70",
}
PRESERVED_HASHES = {
    APP + "/src/services/EquipService.js": "6da1b8c26a616c3e933a72b6b80d36ee732dfafbd49a12af9be6be6acc818539",
    APP + "/src/handlers/item.js": "9965c53ad2e797348a9e8bd733db56f8c5ed085070c9cb18dcdf19386dcf7473",
}


def remote_run(client, command, timeout=120):
    _, stdout, stderr = client.exec_command(command, timeout=timeout)
    output = stdout.read().decode("utf-8", "replace")
    error = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError((error + output)[-5000:])
    return output


def main():
    credential_path = Path(os.environ["LHS_PROD_CREDENTIAL_FILE"])
    credentials = credential_path.read_text(encoding="utf-8-sig").splitlines()
    client = paramiko.SSHClient()
    client.load_system_host_keys()
    client.set_missing_host_key_policy(paramiko.RejectPolicy())
    client.connect(
        credentials[0].strip(),
        username="root",
        password=credentials[2],
        look_for_keys=False,
        allow_agent=False,
        timeout=20,
    )
    try:
        pm2_script = (
            'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>'
            'console.log(JSON.stringify(JSON.parse(s).filter(p=>['
            '"lhs-s1001","lhs-s1002","lhs-real-bots","lhs-real-bots-s2",'
            '"lhs-dist","lhs-admin"].includes(p.name)).map(p=>({name:p.name,'
            'pid:p.pid,status:p.pm2_env.status,restarts:p.pm2_env.restart_time})))))'
        )
        pm2 = json.loads(
            remote_run(client, "pm2 jlist | node -e " + shlex.quote(pm2_script))
        )
        health_script = (
            'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{'
            'let x=JSON.parse(s),r=x.runtime||{},b=r.bots||{},m=r.mapMonsters||{};'
            'console.log(JSON.stringify({status:x.status,real:Number((b.real||{}).count)||0,'
            'virtual:Number(b.botCount)||0,totalSlots:Number(m.totalSlots)||0,'
            'originalSlots:Number(m.originalSlots)||0,multiplier:Number(m.densityMultiplier)||0,'
            'invalid:Number(m.invalid)||0,claims:Number(m.claims)||0,'
            'completed:Number(m.completed)||0}))})'
        )
        health = []
        for server, port in (("S1", 9200), ("S2", 9201)):
            value = json.loads(
                remote_run(
                    client,
                    "curl -fsS http://127.0.0.1:{}/health | node -e {}".format(
                        port, shlex.quote(health_script)
                    ),
                )
            )
            value["server"] = server
            health.append(value)

        ready = {}
        for server, port in (("S1", 8080), ("S2", 8083)):
            ready[server] = int(
                remote_run(
                    client,
                    "curl -sS -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{}/ready".format(port),
                ).strip()
            )

        hashes = {}
        for remote_path in FILES:
            hashes[remote_path] = remote_run(
                client, "sha256sum " + shlex.quote(remote_path)
            ).split()[0]
        preserved_hashes = {}
        for remote_path in PRESERVED_HASHES:
            preserved_hashes[remote_path] = remote_run(
                client, "sha256sum " + shlex.quote(remote_path)
            ).split()[0]
        served_hash = remote_run(
            client,
            "curl -fsS http://127.0.0.1:81/js/main.min_a6195824.js | sha256sum",
        ).split()[0]
        markers = {
            "servedClientDensity": remote_run(
                client,
                "curl -fsS http://127.0.0.1:81/js/main.min_a6195824.js | "
                "grep -Fq 'Fq.animBorns._lhsDensity2=!0' && echo true || echo false",
            ).strip()
            == "true",
            "servedIndexCache": remote_run(
                client,
                "curl -fsS http://127.0.0.1:81/ | "
                "grep -Fq '20260904_double_monsters1' && echo true || echo false",
            ).strip()
            == "true",
        }

        clone_script = (
            "const fs=require('fs'),m=require('" + APP + "/src/services/MapMonsterService');"
            "let rows=[];for(const n of ['lhs-real-bots','lhs-real-bots-s2']){"
            "let f='/root/.pm2/logs/'+n+'-out.log',l=fs.readFileSync(f,'utf8').split(/\\n/).slice(-3000);"
            "for(const x of l){let q=x.match(/map-farm open ok .* map=(\\d+).* index=(\\d+)/);"
            "if(q){let slots=m.getSlots(Number(q[1]));if(Number(q[2])>=slots.length/2)"
            "rows.push({worker:n,map:Number(q[1]),index:Number(q[2]),originalSlots:slots.length/2})}}}"
            "console.log('CLONE_HITS='+JSON.stringify(rows.slice(-20)))"
        )
        clone_output = remote_run(
            client, "cd " + APP + " && node -e " + shlex.quote(clone_script)
        )
        clone_hits = json.loads(clone_output.split("CLONE_HITS=", 1)[1].splitlines()[0])

        errors_text = remote_run(
            client,
            "for f in /root/.pm2/logs/lhs-s1001-error.log "
            "/root/.pm2/logs/lhs-s1002-error.log "
            "/root/.pm2/logs/lhs-real-bots-error.log "
            "/root/.pm2/logs/lhs-real-bots-s2-error.log; do "
            "tail -120 \"$f\" | grep -Ei "
            "'uncaught|unhandled|SyntaxError|TypeError|ReferenceError|invalid_target' | tail -10 || true; done",
        ).strip()

        checks = {
            "pm2Online": len(pm2) == 6 and all(item["status"] == "online" for item in pm2),
            "ready200": ready == {"S1": 200, "S2": 200},
            "health2x": all(
                item["status"] == "ok"
                and item["real"] == 580
                and item["virtual"] == 580
                and item["totalSlots"] == 2466
                and item["originalSlots"] == 1233
                and item["multiplier"] == 2
                and item["invalid"] == 0
                for item in health
            ),
            "remoteHashes": hashes == EXPECTED_HASHES,
            "preservedAutoEquipHashes": preserved_hashes == PRESERVED_HASHES,
            "servedHash": served_hash == EXPECTED_HASHES[FILES[1]],
            "servedMarkers": all(markers.values()),
            "cloneHits": len(clone_hits) > 0,
            "recentErrorsEmpty": errors_text == "",
        }
        payload = {
            "result": "PASS" if all(checks.values()) else "FAIL",
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "checks": checks,
            "pm2": pm2,
            "ready": ready,
            "health": health,
            "hashes": hashes,
            "preservedHashes": preserved_hashes,
            "servedHash": served_hash,
            "markers": markers,
            "cloneTargetHits": clone_hits,
            "recentErrors": errors_text,
        }
        output_path = ROOT / "temp" / "double_monsters_postdeploy_20260904.json"
        output_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
        digest = hashlib.sha256(output_path.read_bytes()).hexdigest()
        print(json.dumps({"result": payload["result"], "evidence": str(output_path), "sha256": digest, "checks": checks}))
        if payload["result"] != "PASS":
            raise SystemExit(1)
    finally:
        client.close()


if __name__ == "__main__":
    main()
