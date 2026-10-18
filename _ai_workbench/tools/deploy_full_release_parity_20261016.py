from __future__ import annotations

import hashlib
import json
import shlex
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from skin_incident_remote import connect  # noqa: E402


ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "_ai_workbench" / "temp" / "full_release_parity_20261016"
REMOTE = {
    "auction_service": "/linhhoasu/lhs/newServer/src/services/AuctionService.js",
    "auction_catalog": "/linhhoasu/lhs/newServer/src/config/auctionCatalog.v1.json",
    "ecosystem": "/linhhoasu/lhs/newServer/ecosystem.config.js",
}
SERVICE_OLD = b"function allowedServer(serverId) { return array(getCatalog().scope.serverIds).includes(serverId); }"
SERVICE_NEW = (
    b"function allowedServer(serverId) {\n"
    b"  const scope = getCatalog().scope || {};\n"
    b"  if (array(scope.serverIds).includes(serverId)) return true;\n"
    b"  const pool = scope.serverPool || {};\n"
    b"  if (pool.autoInclude !== true || pool.mode !== 'page') return false;\n"
    b"  const pageId = Math.max(1, integer(pool.pageId) || 1);\n"
    b"  const min = Math.max(pageId * 1000 + 1, integer(pool.minServerId) || (pageId * 1000 + 1));\n"
    b"  const max = Math.min(pageId * 1000 + 999, integer(pool.maxServerId) || (pageId * 1000 + 999));\n"
    b"  return serverId >= min && serverId <= max;\n"
    b"}"
)
CATALOG_OLD = (
    b"    \"serverIds\": [\n"
    b"      1001,\n      1002,\n      1003,\n      1004,\n"
    b"      1005,\n      1006,\n      1007,\n      1008\n"
    b"    ],\n    \"area\": 1,"
)
CATALOG_NEW = (
    b"    \"serverIds\": [\n"
    b"      1001,\n      1002,\n      1003,\n      1004,\n"
    b"      1005,\n      1006,\n      1007,\n      1008\n"
    b"    ],\n"
    b"    \"serverPool\": {\n"
    b"      \"autoInclude\": true,\n"
    b"      \"mode\": \"page\",\n"
    b"      \"pageId\": 1,\n"
    b"      \"minServerId\": 1001,\n"
    b"      \"maxServerId\": 1099\n"
    b"    },\n    \"area\": 1,"
)
ECOSYSTEM_OLD = (
    b"// SERVER_PARITY_RELEASE_20261016_V1\n"
    b"// Apply the current equipment-drop release after every S<N> template is\n"
    b"// created, so PM2 restart/resurrect cannot silently drop the feature flag.\n"
    b"for (const app of module.exports.apps.filter(app => app.script === 'src/app.js' && /^lhs-s\\d+$/.test(app.name))) {\n"
    b"  app.env.DROP_LEVEL_100_ENABLED = '1';\n"
    b"}\n"
)
ECOSYSTEM_NEW = (
    b"// SERVER_PARITY_RELEASE_20261016_V1\n"
    b"// Apply shared release flags after every S<N> template is created.\n"
    b"// Opening, settlement and reward policy remains server-specific.\n"
    b"for (const app of module.exports.apps.filter(app => app.script === 'src/app.js' && /^lhs-s\\d+$/.test(app.name))) {\n"
    b"  app.env.DROP_LEVEL_100_ENABLED = '1';\n"
    b"  app.env.ROLE_LEVEL_2000_ENABLED = '1';\n"
    b"  app.env.OLD_TREK_EVENT_ENGINE_ENABLED = '1';\n"
    b"  app.env.OLD_TREK_SETTLEMENT_ENABLED = '1';\n"
    b"  app.env.CUSTOM_PVP_FORMULA_ENABLED = '1';\n"
    b"  app.env.CROSS_EVENT_ENABLED = '1';\n"
    b"  app.env.AUCTION_SHARED_ENABLED = '1';\n"
    b"  app.env.AUCTION_SHARED_APPROVED = '1';\n"
    b"  app.env.AUCTION_CATALOG_PATH = '/linhhoasu/lhs/newServer/src/config/auctionCatalog.v1.json';\n"
    b"}\n"
)
PORTS = {
    "lhs-s1001": 8080,
    "lhs-s1002": 8083,
    "lhs-s1003": 8084,
    "lhs-s1004": 8085,
    "lhs-s1005": 8086,
    "lhs-s1006": 8087,
    "lhs-s1007": 8088,
    "lhs-s1008": 8089,
    "lhs-s1009": 8090,
}


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def replace_once(data: bytes, old: bytes, new: bytes) -> bytes:
    if data.count(old) == 1:
        return data.replace(old, new)
    old_crlf = old.replace(b"\n", b"\r\n")
    new_crlf = new.replace(b"\n", b"\r\n")
    if data.count(old_crlf) == 1:
        return data.replace(old_crlf, new_crlf)
    if data.count(new) == 1 or data.count(new_crlf) == 1:
        return data
    raise RuntimeError(f"CAS_MARKER_COUNT:{old[:80]!r}")


def main() -> None:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup = f"/linhhoasu/_ai_workbench/backups/full_release_parity_{stamp}"
    report: dict = {
        "result": "STARTED",
        "productionWrites": 0,
        "playerWrites": 0,
        "backup": backup,
        "paths": {},
        "restarts": [],
    }
    ssh = connect()
    sftp = ssh.open_sftp()
    swapped: list[tuple[str, str]] = []

    def run(command: str, check: bool = True) -> str:
        _, stdout, stderr = ssh.exec_command(command, timeout=90)
        out = stdout.read().decode("utf-8", "replace")
        err = stderr.read().decode("utf-8", "replace")
        code = stdout.channel.recv_exit_status()
        if check and code:
            raise RuntimeError(f"REMOTE_FAILED:{code}:{err[-1500:]}{out[-1500:]}")
        return out.strip()

    def stage(path: str, data: bytes) -> str:
        staged = f"{path}.full_release_parity_{stamp}.js"
        with sftp.open(staged, "wb") as handle:
            handle.write(data)
        run(f"chmod 644 {shlex.quote(staged)}")
        return staged

    try:
        before: dict[str, bytes] = {}
        for key, path in REMOTE.items():
            with sftp.open(path, "rb") as handle:
                before[key] = handle.read()
            report["paths"][key] = {"path": path, "beforeSha256": sha(before[key]), "beforeBytes": len(before[key])}

        candidate = {
            "auction_service": replace_once(before["auction_service"], SERVICE_OLD, SERVICE_NEW),
            "auction_catalog": replace_once(before["auction_catalog"], CATALOG_OLD, CATALOG_NEW),
            "ecosystem": replace_once(before["ecosystem"], ECOSYSTEM_OLD, ECOSYSTEM_NEW),
        }
        for key, data in candidate.items():
            json.loads(data.decode("utf-8")) if key == "auction_catalog" else None
            report["paths"][key]["candidateSha256"] = sha(data)
            report["paths"][key]["candidateBytes"] = len(data)

        run(f"install -d -m 700 {shlex.quote(backup)}")
        for key, path in REMOTE.items():
            run(f"cp -p -- {shlex.quote(path)} {shlex.quote(backup + '/' + Path(path).name)}")

        staged_service = stage(REMOTE["auction_service"], candidate["auction_service"])
        staged_eco = stage(REMOTE["ecosystem"], candidate["ecosystem"])
        run(f"node --check {shlex.quote(staged_service)}")
        run(f"node --check {shlex.quote(staged_eco)}")

        for key in ("auction_service", "auction_catalog", "ecosystem"):
            path = REMOTE[key]
            with sftp.open(path, "rb") as handle:
                if sha(handle.read()) != report["paths"][key]["beforeSha256"]:
                    raise RuntimeError(f"CAS_CHANGED_BEFORE_SWAP:{key}")
            staged = stage(path, candidate[key])
            run(f"mv -f -- {shlex.quote(staged)} {shlex.quote(path)}")
            swapped.append((key, path))

        for key, path in REMOTE.items():
            with sftp.open(path, "rb") as handle:
                live = handle.read()
            report["paths"][key]["afterSha256"] = sha(live)
            if live != candidate[key]:
                raise RuntimeError(f"READBACK_HASH_MISMATCH:{key}")

        for name, port in PORTS.items():
            if name == "lhs-s1005":
                run(f"pm2 restart {shlex.quote(name)} --update-env")
            else:
                run(f"cd /linhhoasu/lhs/newServer && pm2 startOrRestart ecosystem.config.js --only {shlex.quote(name)} --update-env")
            ready = run(
                f"for i in $(seq 1 30); do code=$(curl -sS -o /dev/null -w '%{{http_code}}' --max-time 2 http://127.0.0.1:{port}/ready || true); "
                f"if [ \"$code\" = \"200\" ]; then echo 200; exit 0; fi; sleep 1; done; echo $code; exit 1"
            )
            report["restarts"].append({"name": name, "port": port, "ready": ready})
        run("pm2 save")

        pm2 = run(
            "pm2 jlist | node -e "
            + shlex.quote(
                "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const ks=['DROP_LEVEL_100_ENABLED','ROLE_LEVEL_2000_ENABLED','OLD_TREK_EVENT_ENGINE_ENABLED','OLD_TREK_SETTLEMENT_ENABLED','CUSTOM_PVP_FORMULA_ENABLED','CROSS_EVENT_ENABLED','AUCTION_SHARED_ENABLED','AUCTION_SHARED_APPROVED'];const a=JSON.parse(s).filter(p=>/^lhs-s\\d+$/.test(p.name)).map(p=>{const e=p.pm2_env.env||{};return {name:p.name,status:p.pm2_env.status,flags:Object.fromEntries(ks.map(k=>[k,e[k]||null]))}});console.log(JSON.stringify(a));});"
            )
        )
        report["pm2"] = json.loads(pm2)
        report["result"] = "DEPLOYED_AND_RESTARTED"
    except Exception as exc:
        report["result"] = "FAILED"
        report["error"] = str(exc)
        try:
            for key, path in reversed(swapped):
                run(f"cp -p -- {shlex.quote(backup + '/' + Path(path).name)} {shlex.quote(path)}")
        except Exception as rollback_error:
            report["rollbackError"] = str(rollback_error)
        raise
    finally:
        OUT.mkdir(parents=True, exist_ok=True)
        (OUT / "deployment.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        for path in REMOTE.values():
            run(f"rm -f -- {shlex.quote(path + '.full_release_parity_' + stamp + '.js')}", check=False)
        sftp.close()
        ssh.close()
        print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
