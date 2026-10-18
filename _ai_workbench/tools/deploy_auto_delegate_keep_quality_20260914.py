"""Deploy keep-quality checkbox and silent sell-all delegation flow."""
from __future__ import annotations

import hashlib
import json
import shlex
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

from snapshot_web_multiserver_20260906 import connect, run

WB = Path(__file__).resolve().parents[1]
ROOT = WB.parent
APP = "/linhhoasu/lhs/newServer"
WEB = "/linhhoasu/webgame/game"
FILES = {
    "src/handlers/box.js": WB / "temp/auto_delegate_sell_all_20260914/candidate/box.js",
    "src/services/EquipService.js": WB / "temp/auto_delegate_sell_all_20260914/candidate/EquipService.js",
    "js/main.min_a6195824.js": WB / "temp/auto_delegate_sell_all_20260914/candidate/main.js",
    "index.html": WB / "temp/auto_delegate_sell_all_20260914/candidate/index.html",
}
REMOTES = {
    "src/handlers/box.js": APP + "/src/handlers/box.js",
    "src/services/EquipService.js": APP + "/src/services/EquipService.js",
    "js/main.min_a6195824.js": WEB + "/js/main.min_a6195824.js",
    "index.html": WEB + "/index.html",
}
EXPECTED = {
    "src/handlers/box.js": "8e3977ed28f881247b7fa2b8624a49d8d0ad098623cb8d4653ae2e764c455a85",
    "src/services/EquipService.js": "6da1b8c26a616c3e933a72b6b80d36ee732dfafbd49a12af9be6be6acc818539",
    "js/main.min_a6195824.js": "c2331bae5f420d4e4197c1cb496cf8b07011f38002bad539b337e7efa6c4c2e7",
    "index.html": "f2a19f7f14352e3d8a655194717f4fc0be9e61c2c0cf25ad9949bf2d3507a42d",
}
PROCS = ["lhs-s1001", "lhs-s1002", "lhs-s1003"]


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def wait_ready(ssh):
    last = {}
    for _ in range(20):
        last = {}
        for port in (8080, 8083, 8084):
            try:
                last[str(port)] = run(ssh, f"curl -fsS --max-time 6 -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{port}/ready").strip()
            except RuntimeError:
                last[str(port)] = "000"
        if set(last.values()) == {"200"}:
            return last
        time.sleep(2)
    return last


def pm2(ssh):
    raw = run(ssh, "pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{for(const p of JSON.parse(s)){if(%s.includes(p.name)){const e=p.pm2_env||{};console.log(JSON.stringify({name:p.name,status:e.status,pid:p.pid,restarts:e.restart_time}))}}})'" % json.dumps(PROCS))
    return [json.loads(x) for x in raw.splitlines() if x.strip().startswith("{")]


def main():
    subprocess.run(["node", str(WB / "tools/test_auto_delegate_keep_quality_contract.js"), str(FILES["js/main.min_a6195824.js"]), str(FILES["index.html"])], cwd=ROOT, check=True, timeout=120)
    subprocess.run(["node", str(WB / "tools/test_auto_delegate_contract.js")], cwd=ROOT, env={**__import__('os').environ, "EQUIP_SERVICE_PATH": str(FILES["src/services/EquipService.js"])}, check=True, timeout=120)
    candidates = {rel: sha(path) for rel, path in FILES.items()}
    ssh = connect()
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    stage = f"/linhhoasu/_ai_workbench/temp/auto_delegate_keep_quality_{stamp}"
    backup = f"/linhhoasu/_ai_workbench/backups/auto_delegate_keep_quality_pre_{stamp}"
    swapped = False
    try:
        raw = run(ssh, "sha256sum -- " + " ".join(shlex.quote(REMOTES[x]) for x in FILES))
        current = {next((rel for rel, remote in REMOTES.items() if remote == line.split()[-1]), line.split()[-1]): line.split()[0] for line in raw.splitlines() if len(line.split()) >= 2}
        for rel, expected in EXPECTED.items():
            if current.get(rel) != expected:
                raise RuntimeError(f"BASELINE_MISMATCH:{rel}:{current.get(rel)}")
        run(ssh, f"mkdir -p -- {shlex.quote(stage)} {shlex.quote(backup)}")
        run(ssh, f"pm2 jlist > {shlex.quote(backup + '/pm2-before.json')}")
        with ssh.open_sftp() as sftp:
            for rel, path in FILES.items():
                staged = stage + "/" + rel
                run(ssh, f"mkdir -p -- {shlex.quote(staged.rsplit('/', 1)[0])} {shlex.quote((backup + '/' + rel).rsplit('/', 1)[0])}")
                sftp.put(str(path), staged)
                run(ssh, f"cp -p -- {shlex.quote(REMOTES[rel])} {shlex.quote(backup + '/' + rel)}")
                if rel.endswith('.js'): run(ssh, f"node --check {shlex.quote(staged)}")
                if run(ssh, f"sha256sum -- {shlex.quote(staged)} | awk '{{print $1}}'").strip() != candidates[rel]: raise RuntimeError(f"STAGE_HASH_MISMATCH:{rel}")
        before = pm2(ssh)
        for rel in FILES:
            remote = REMOTES[rel]; staged = stage + "/" + rel; tmp = remote + ".auto-delegate-stage"
            run(ssh, f"cp -- {shlex.quote(staged)} {shlex.quote(tmp)} && mv -- {shlex.quote(tmp)} {shlex.quote(remote)}")
        swapped = True
        for proc in PROCS: run(ssh, f"pm2 reload {proc} --update-env")
        health = wait_ready(ssh); after = pm2(ssh)
        if set(health.values()) != {"200"} or len(after) != 3 or any(x.get('status') != 'online' for x in after): raise RuntimeError('POST_DEPLOY_HEALTH_FAILED')
        run(ssh, "pm2 save")
        result={"result":"DEPLOY_VERIFIED","deployedAt":datetime.now(timezone.utc).isoformat(),"timezone":"Asia/Ho_Chi_Minh (UTC+7)","backup":backup,"stage":stage,"candidateHashes":candidates,"remoteBeforeHashes":current,"health":health,"pm2Before":before,"pm2After":after,"playerDataMutation":False,"compensation":False}
        out=WB/'temp/auto_delegate_keep_quality_20260914';out.mkdir(parents=True,exist_ok=True);(out/f'deploy_{stamp}.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps(result,ensure_ascii=True,indent=2))
    except Exception:
        if swapped:
            try:
                for rel in FILES:
                    remote=REMOTES[rel];tmp=remote+'.auto-delegate-rollback';run(ssh,f"cp -- {shlex.quote(backup+'/'+rel)} {shlex.quote(tmp)} && mv -- {shlex.quote(tmp)} {shlex.quote(remote)}")
                for proc in PROCS: run(ssh,f"pm2 reload {proc} --update-env")
                wait_ready(ssh)
            except Exception as rollback_error: raise RuntimeError(f'ROLLBACK_FAILED:{rollback_error}') from rollback_error
        raise
    finally: ssh.close()


if __name__ == '__main__': main()
