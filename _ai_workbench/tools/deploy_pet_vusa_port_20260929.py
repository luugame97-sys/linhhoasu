"""CAS/backup/rolling deployment for the VUSA pet candidate.

Scope is limited to pet handler/config, client manifest/config/language,
client bundle/index and the 31 additive pet resources. Player/DB writes are
not performed by this script.
"""
from __future__ import annotations

import hashlib
import json
import posixpath
import shlex
import time
from datetime import datetime, timezone
from pathlib import Path

from snapshot_web_multiserver_20260906 import connect, run

ROOT = Path(__file__).resolve().parents[2]
RELEASE = ROOT / "_ai_workbench/temp/pet_vusa_port_20260929/release"
REMOTE_ROOT = "/linhhoasu"
REMOTE_APP = f"{REMOTE_ROOT}/lhs/newServer"
REMOTE_GAME = f"{REMOTE_ROOT}/webgame/game"
STAMP = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
BACKUP = f"{REMOTE_ROOT}/_ai_workbench/backups/pet_vusa_port_20260929_{STAMP}"
STAGE = f"{REMOTE_ROOT}/_ai_workbench/temp/pet_vusa_port_20260929_{STAMP}"

FILES = {
    "server/src/handlers/pet.js": f"{REMOTE_APP}/src/handlers/pet.js",
    "server/update/resource/assets/excel/config_e5ac72c2.bin": f"{REMOTE_ROOT}/lhs/update/resource/assets/excel/config_e5ac72c2.bin",
    "client/update/resource/assets/excel/config_e5ac72c2.bin": f"{REMOTE_GAME}/update/resource/assets/excel/config_e5ac72c2.bin",
    "client/update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin": f"{REMOTE_GAME}/update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin",
    "client/update/resource/default.res_main_c669f2c0_pet_vusa_20260929.bin": f"{REMOTE_GAME}/update/resource/default.res_main_c669f2c0_pet_vusa_20260929.bin",
    "client/update/resource/default.res_cn_main_f70d4753_pet_vusa_20260929.bin": f"{REMOTE_GAME}/update/resource/default.res_cn_main_f70d4753_pet_vusa_20260929.bin",
    "client/index.html": f"{REMOTE_GAME}/index.html",
    "client/js/main.min_drop100.js": f"{REMOTE_GAME}/js/main.min_drop100.js",
}
for asset in (RELEASE / "client/update/resource/assets").rglob("*"):
    if asset.is_file():
        rel = asset.relative_to(RELEASE / "client/update/resource").as_posix()
        FILES[f"client/update/resource/{rel}"] = f"{REMOTE_GAME}/update/resource/{rel}"

EXPECTED_BEFORE = {
    f"{REMOTE_APP}/src/handlers/pet.js": "5518f1601b640def06c1fb89e5dd36672411d90747e20475735c69ed7ec5c32f",
    f"{REMOTE_ROOT}/lhs/update/resource/assets/excel/config_e5ac72c2.bin": "5606cb77752f7330b3a904fab4bec2a2ba65dc2856166e13834654e9824ae787",
    f"{REMOTE_GAME}/update/resource/assets/excel/config_e5ac72c2.bin": "5606cb77752f7330b3a904fab4bec2a2ba65dc2856166e13834654e9824ae787",
    f"{REMOTE_GAME}/update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin": "8d41ea06a4406d7e70ab5790b07c36927f2c42e07c538f9190712764760d154f",
    f"{REMOTE_GAME}/index.html": "25c1dde3681a11c95829fc3aedb1b193fd735a7b230edc4519c9ac60da8e60a1",
    f"{REMOTE_GAME}/js/main.min_drop100.js": "4a6b12eea8863a1b02d9d80b4bef91deb6312ea7678e8d513fab92c4bae40230",
}
EXPECTED_AFTER = {
    f"{REMOTE_APP}/src/handlers/pet.js": "7836217cbe1aa8961101b30faf766f4f09d6561958591694d68fb9a7e2e4dd43",
    f"{REMOTE_ROOT}/lhs/update/resource/assets/excel/config_e5ac72c2.bin": "e1979790fe7b97177ca271fe5b29bc75f7d0407be8312acc48a5b76e21c044da",
    f"{REMOTE_GAME}/update/resource/assets/excel/config_e5ac72c2.bin": "e1979790fe7b97177ca271fe5b29bc75f7d0407be8312acc48a5b76e21c044da",
    f"{REMOTE_GAME}/update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin": "b90f6bc0aa278841eb5618ef29d92df1f1cd1b89af7df0b3885ae5c522ab5a25",
    f"{REMOTE_GAME}/index.html": "c6115328e0f650b045c2f0641ba1afcad7ca5451b26f7d958945ad6abab578ba",
    f"{REMOTE_GAME}/js/main.min_drop100.js": "2ad9c69fcf5f5669a73b87e92111930bf50265a24a62b8877bfbd4a9b9abc742",
    f"{REMOTE_GAME}/update/resource/default.res_main_c669f2c0_pet_vusa_20260929.bin": "c377de920cae08965e560d66003883b616c8c03ed71605d569284a708d8b40a2",
    f"{REMOTE_GAME}/update/resource/default.res_cn_main_f70d4753_pet_vusa_20260929.bin": "13c45ba747ea633269d11fbf0b25452f9717821d2f5fd3dbc717c1ac58d544cf",
}

NODES = [
    ("lhs-s1006", 8087), ("lhs-s1005", 8086), ("lhs-s1004", 8085),
    ("lhs-s1003", 8084), ("lhs-s1002", 8083), ("lhs-s1001", 8080),
]


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def run_checked(ssh, command: str) -> str:
    return run(ssh, command)


def local_payloads():
    payloads = {}
    for rel, remote in FILES.items():
        local = RELEASE / rel
        if not local.is_file():
            raise RuntimeError(f"CANDIDATE_MISSING:{local}")
        payloads[remote] = {"local": local, "data": local.read_bytes(), "sha256": sha(local.read_bytes()), "bytes": local.stat().st_size}
    for remote, expected in EXPECTED_AFTER.items():
        if remote in payloads and payloads[remote]["sha256"] != expected:
            raise RuntimeError(f"LOCAL_HASH_MISMATCH:{remote}:{payloads[remote]['sha256']}:{expected}")
    return payloads


def shell_hashes(paths):
    quoted = " ".join(shlex.quote(p) for p in paths)
    out = run_checked(SSH, "sha256sum -- " + quoted)
    result = {}
    for line in out.splitlines():
        parts = line.split()
        if len(parts) >= 2:
            result[parts[1]] = parts[0]
    return result


SSH = None


def main():
    raise RuntimeError('RELEASE_BLOCKED: use reviewed release workflow after all QA gates')
    global SSH
    payloads = local_payloads()
    report = {
        "result": "STARTED", "at": datetime.now(timezone.utc).isoformat(),
        "backup": BACKUP, "stage": STAGE, "productionWrites": 0,
        "playerWrites": 0, "files": {}, "restarts": [],
    }
    SSH = connect()
    swapped = []
    restarted = []
    try:
        with SSH.open_sftp() as sf:
            before = {}
            attrs = {}
            for remote in payloads:
                try:
                    data = sf.open(remote, "rb").read()
                    before[remote] = data
                    attrs[remote] = sf.stat(remote)
                except FileNotFoundError:
                    before[remote] = None
                    attrs[remote] = None
                expected = EXPECTED_BEFORE.get(remote)
                if expected is not None:
                    if before[remote] is None or sha(before[remote]) != expected:
                        raise RuntimeError(f"REMOTE_CAS_DRIFT:{remote}:{None if before[remote] is None else sha(before[remote])}")
                elif before[remote] is not None:
                    # New manifest/assets must not silently overwrite a file.
                    raise RuntimeError(f"REMOTE_NEW_PATH_EXISTS:{remote}:{sha(before[remote])}")
            run_checked(SSH, "install -d -m 700 " + shlex.quote(BACKUP) + " " + shlex.quote(STAGE))
            for remote, data in before.items():
                if data is None:
                    continue
                backup_path = BACKUP + remote
                run_checked(SSH, "install -d -m 700 " + shlex.quote(posixpath.dirname(backup_path)))
                with sf.open(backup_path, "wb") as handle:
                    handle.write(data)
                sf.chmod(backup_path, 0o600)
                if sha(sf.open(backup_path, "rb").read()) != sha(data):
                    raise RuntimeError(f"BACKUP_HASH_MISMATCH:{remote}")
            for remote, item in payloads.items():
                stage_path = STAGE + remote
                run_checked(SSH, "install -d -m 700 " + shlex.quote(posixpath.dirname(stage_path)))
                with sf.open(stage_path, "wb") as handle:
                    handle.write(item["data"])
                sf.chmod(stage_path, 0o644)
            stage_paths = [STAGE + remote for remote in payloads]
            stage_hashes = shell_hashes(stage_paths)
            for remote, item in payloads.items():
                if stage_hashes.get(STAGE + remote) != item["sha256"]:
                    raise RuntimeError(f"STAGE_HASH_MISMATCH:{remote}")
            run_checked(SSH, "node --check " + shlex.quote(STAGE + f"/server/src/handlers/pet.js"))
            run_checked(SSH, "node --check " + shlex.quote(STAGE + f"/client/js/main.min_drop100.js"))
            # Re-read every existing live file immediately before swapping.
            live_hashes = shell_hashes([remote for remote, data in before.items() if data is not None])
            for remote, data in before.items():
                if data is not None and live_hashes.get(remote) != sha(data):
                    raise RuntimeError(f"PRE_SWAP_CAS_DRIFT:{remote}")
            for remote in payloads:
                target_stage = STAGE + remote
                run_checked(SSH, "install -d -m 755 " + shlex.quote(posixpath.dirname(remote)))
                run_checked(SSH, "mv -f -- " + shlex.quote(target_stage) + " " + shlex.quote(remote))
                swapped.append(remote)
        # Verify static files before restarting processes.
        after_hashes = shell_hashes(list(payloads))
        for remote, item in payloads.items():
            if after_hashes.get(remote) != item["sha256"]:
                raise RuntimeError(f"LIVE_HASH_MISMATCH:{remote}")
        for name, port in NODES:
            run_checked(SSH, "pm2 restart " + shlex.quote(name) + " --update-env")
            restarted.append(name)
            report["restarts"].append(name)
            code = ""
            for _ in range(30):
                code = run_checked(SSH, f"curl -sS -o /dev/null -w '%{{http_code}}' --max-time 3 http://127.0.0.1:{port}/ready || true").strip()
                if code == "200":
                    break
                time.sleep(2)
            report.setdefault("readiness", {})[str(port)] = code
            if code != "200":
                raise RuntimeError(f"READY_FAILED:{name}:{code}")
        probe = "const c=require('/linhhoasu/lhs/newServer/src/services/ConfigService');const t=c.loadAllTables('/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin');console.log(JSON.stringify({pets:Object.keys(t.PetConfig||{}).length,q9:t.PetQualityConfig&&t.PetQualityConfig[9]&&t.PetQualityConfig[9].composeSuccessRate,q10:t.PetQualityConfig&&t.PetQualityConfig[10]&&t.PetQualityConfig[10].passiveSkillCount,ids:[810101,810201,810301,810401,810501].map(id=>({id,pet:!!t.PetConfig[id],skill:!!t.PetSkillConfig[id],asset:!!t.AssetsConfig[id],appearance:!!t.AppearanceConfig[id]}))}));"
        report["configProbe"] = json.loads(run_checked(SSH, "cd " + shlex.quote(REMOTE_APP) + " && node -e " + shlex.quote(probe)).strip().splitlines()[-1])
        if report["configProbe"].get("pets") != 46 or report["configProbe"].get("q9") != 10 or report["configProbe"].get("q10") != 7 or not all(row.get("pet") and row.get("skill") and row.get("asset") and row.get("appearance") for row in report["configProbe"].get("ids", [])):
            raise RuntimeError("EFFECTIVE_CONFIG_PROBE_FAILED")
        report["served"] = json.loads(run_checked(SSH, "node -e " + shlex.quote("const fs=require('fs');const p='/linhhoasu/webgame/game/index.html';const s=fs.readFileSync(p,'utf8');console.log(JSON.stringify({marker:s.includes('20260929_pet_vusa_port_v1'),main:s.includes('default.res_main_c669f2c0_pet_vusa_20260929.bin'),cn:s.includes('default.res_cn_main_f70d4753_pet_vusa_20260929.bin')}));")).strip().splitlines()[-1])
        if not all(report["served"].values()):
            raise RuntimeError("INDEX_MARKER_PROBE_FAILED")
        asset_paths = [remote for remote in payloads if "/update/resource/assets/" in remote and remote.endswith(('.png', '.json', '.atlas'))]
        checks = " ".join(shlex.quote('/' + p.split('/linhhoasu/', 1)[1]) for p in asset_paths)
        asset_probe = run_checked(SSH, "for p in " + checks + "; do c=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:81$p || true); [ \"$c\" = 200 ] || { echo \"ASSET_HTTP_$c:$p\"; exit 1; }; done; echo ASSETS_HTTP_PASS").strip()
        if asset_probe != "ASSETS_HTTP_PASS":
            raise RuntimeError("ASSET_HTTP_PROBE_FAILED:" + asset_probe)
        report["assetHttp"] = {"count": len(asset_paths), "result": asset_probe}
        report["processes"] = json.loads(run_checked(SSH, "pm2 jlist | node -e " + shlex.quote("let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.stringify(JSON.parse(s).filter(p=>/^lhs-s100[1-6]$/.test(p.name)).map(p=>({name:p.name,status:p.pm2_env.status,pid:p.pid,restarts:p.pm2_env.restart_time})))))")).strip())
        if any(row.get("status") != "online" for row in report["processes"]):
            raise RuntimeError("NODE_NOT_ONLINE")
        report["result"] = "DEPLOYED"
    except Exception as error:
        report["result"] = "FAILED"
        report["error"] = str(error)
        if swapped:
            try:
                for remote, data in before.items():
                    if data is None:
                        run_checked(SSH, "rm -f -- " + shlex.quote(remote))
                    else:
                        backup_path = BACKUP + remote
                        run_checked(SSH, "install -d -m 755 " + shlex.quote(posixpath.dirname(remote)))
                        run_checked(SSH, "cp -p -- " + shlex.quote(backup_path) + " " + shlex.quote(remote))
                for name in restarted:
                    try:
                        run_checked(SSH, "pm2 restart " + shlex.quote(name) + " --update-env")
                    except Exception:
                        pass
                report["rollback"] = "restored_and_restarted"
            except Exception as rollback_error:
                report["rollbackError"] = str(rollback_error)
        raise
    finally:
        if SSH is not None:
            try:
                run_checked(SSH, "rm -rf -- " + shlex.quote(STAGE))
            except Exception:
                pass
            SSH.close()
        out = ROOT / "_ai_workbench/temp/pet_vusa_port_20260929/release.json"
        out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(report, ensure_ascii=False, indent=2), flush=True)


if __name__ == "__main__":
    main()
