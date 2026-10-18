"""Read-only post-deploy verification for fishing scenes 8-10."""

import json
import shlex
from pathlib import Path

from deploy_fishing_scene8_10_20260924 import APP, GAME, connect, pm2, readiness, remote_hashes, run, WORKERS


def main() -> None:
    ssh = connect()
    try:
        targets = [
            "/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin",
            "/linhhoasu/webgame/game/update/resource/assets/excel/config_fashion_20260909.bin",
            f"{APP}/src/handlers/playerPayload.js",
            f"{GAME}/index.html",
        ]
        config_script = (
            "const c=require('/linhhoasu/lhs/newServer/src/services/ConfigService');"
            "const p=require('/linhhoasu/lhs/newServer/src/handlers/playerPayload');"
            "const t=c.loadAllTables();"
            "const x={userId:'scene8-10-verify',playerId:'scene8-10-verify',serverId:1001,level:116,"
            "roleInfo:{kungfuId:4,subJob:0},items:{},currencies:{},taskInfo:{},activityInfo:{datas:[]},"
            "rechargeInfo:{monthCards:{}},systemUnlockInfo:{unlockedSystem:[],settings:{}},"
            "fishInfo:{level:31,scene:8,food:5501,foodBag:[]}};"
            "const out=p.buildPlayer500Data(x);"
            "console.log(JSON.stringify({rows:[8,9,10].map(id=>({id,cond:t.FishSceneConfig[id].cond,"
            "fishes:t.FishSceneConfig[id].fishes.length,relics:t.FishSceneConfig[id].relics.length})),"
            "payloadScene:out.fishInfo.scene,payloadLevel:out.fishInfo.level}));"
        )
        output = run(ssh, "NODE_ENV=test LOG_DIR= node -", config_script).strip()
        evidence = {
            "result": "PASS",
            "version": "fishing_scene8_10_remote_verify_v1",
            "hashes": remote_hashes(ssh, targets),
            "ready": readiness(ssh),
            "pm2": pm2(ssh),
            "configAndPayload": json.loads(output.splitlines()[-1]),
            "servedIndexHasCacheBust": "20260924_fishing_scene8_10_v1" in run(ssh, "curl -fsS --max-time 15 http://127.0.0.1:81/"),
            "productionWrites": 0,
        }
        assert evidence["ready"] == {str(port): 200 for _name, port in WORKERS}
        assert evidence["configAndPayload"]["payloadScene"] == 8
        assert evidence["servedIndexHasCacheBust"]
        out = Path(__file__).resolve().parents[1] / "temp" / "fishing_scene8_10_candidate_20260924" / "deploy" / "verify.json"
        out.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({"result": evidence["result"], "ready": evidence["ready"], "configAndPayload": evidence["configAndPayload"], "servedIndexHasCacheBust": evidence["servedIndexHasCacheBust"]}, ensure_ascii=False))
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
