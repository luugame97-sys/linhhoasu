from __future__ import annotations

import datetime as dt
import hashlib
import json
import re
import shlex
from pathlib import Path

import paramiko

from rollback_role_lian_manifest_20260930 import ssh_config


ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "_ai_workbench" / "temp" / "gem10_stop_shop_release_20261002" / "postcheck.json"
RECEIPT = ROOT / "_ai_workbench" / "temp" / "gem10_stop_shop_release_20261002" / "deployment.json"
INDEX = "/linhhoasu/webgame/game/index.html"
ADDON = "/linhhoasu/webgame/game/js/lhs-gem10-box-v1.js"
SERVER = "/linhhoasu/lhs/newServer/src/config/gemLevel10Choice.js"
EXPECTED = json.loads(RECEIPT.read_text(encoding="utf-8"))
EXPECTED_INDEX = EXPECTED["files"][INDEX]["after"]
EXPECTED_ADDON = EXPECTED["files"][ADDON]["after"]
EXPECTED_SERVER = EXPECTED["files"][SERVER]["after"]
TOKEN = "20261002_gem10_selectable_box_v2"


def sha_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def q(value: str) -> str:
    return shlex.quote(value)


CONFIG = r'''
const C = require('/linhhoasu/lhs/newServer/src/services/ConfigService');
const shop = C.get('ShopConfig') || {};
const assets = C.get('AssetsConfig') || {};
const use = C.get('AssetsUseConfig') || {};
const base = C.get('GemBaseConfig') || {};
const levels = C.get('GemLevelConfig') || {};
const other = Object.values(shop).filter(row => Number(row && row.id) !== 10000007).sort((a,b) => Number(a.id)-Number(b.id));
const gemShops = Object.values(shop).filter(row => Array.isArray(row && row.rewards) && row.rewards.some(x => [100091,100093,100095].includes(Number(x.id)))).sort((a,b)=>Number(a.id)-Number(b.id));
const digest = value => require('node:crypto').createHash('sha256').update(JSON.stringify(value)).digest('hex');
process.stdout.write(JSON.stringify({
  target: shop[10000007] || shop['10000007'] || null,
  shopCount: Object.keys(shop).length,
  otherShopHash: digest(other),
  gemShopHash: digest(gemShops),
  bag: assets[100097] || assets['100097'] || null,
  use: use[100097] || use['100097'] || null,
  fieldMax: base.fieldMax,
  maxQuickLevel: base.maxQuickLevel,
  gemMaxLevel: Object.values(levels).reduce((n,row)=>Math.max(n,Number(row&&row.level)||0),0)
}));
'''


def main() -> None:
    args, kwargs = ssh_config()
    assert args[0] == "103.116.104.165"
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(*args, **kwargs)
    sftp = client.open_sftp()

    def run(command: str, timeout: int = 40) -> bytes:
        _, stdout, stderr = client.exec_command(command, timeout=timeout)
        output = stdout.read()
        error = stderr.read()
        code = stdout.channel.recv_exit_status()
        if code:
            raise RuntimeError(f"COMMAND_FAILED:{code}:{error.decode('utf-8', 'replace')[-900:]}")
        return output

    def remote_hash(path: str) -> str:
        with sftp.open(path, "rb") as handle:
            return sha_bytes(handle.read())

    def config() -> dict:
        raw = run(f"cd /linhhoasu/lhs/newServer && node -e {q(CONFIG)}", 50).decode("utf-8", "replace")
        line = next((line for line in reversed(raw.splitlines()) if line.strip().startswith("{")), "")
        return json.loads(line)

    def ready(port: int) -> dict:
        return json.loads(run(f"curl --max-time 10 -fsS http://127.0.0.1:{port}/ready", 15).decode("utf-8"))

    def served(base: str) -> dict:
        index = run(f"curl --compressed --connect-timeout 5 --max-time 25 -fsS {q(base + '/index.html?v=' + TOKEN)}", 30)
        index = re.sub(rb'<script type="module" src="https://static\.cloudflareinsights\.com/beacon\.min\.js/.*?</script>\r?\n', b"", index, count=1, flags=re.S)
        addon = run(f"curl --compressed --connect-timeout 5 --max-time 25 -fsS {q(base + '/js/lhs-gem10-box-v1.js?v=' + TOKEN)}", 30)
        return {"index": sha_bytes(index), "addon": sha_bytes(addon), "indexHasV2": b"20261002_gem10_selectable_box_v2" in index, "addonHasShopDisabled": b"SHOP_ENABLED = false" in addon}

    cfg = config()
    if cfg["target"] is not None:
        raise RuntimeError("SHOP_TARGET_PRESENT")
    if cfg["bag"] is None or cfg["use"] is None:
        raise RuntimeError("BAG_ROUTE_MISSING")
    if cfg["fieldMax"] != 1200 or cfg["maxQuickLevel"] != 100 or cfg["gemMaxLevel"] != 100:
        raise RuntimeError(f"GEM_CONFIG_DRIFT:{cfg}")
    if cfg["otherShopHash"] != EXPECTED["postConfig"]["shopWithoutTargetHash"]:
        raise RuntimeError("OTHER_SHOPS_CHANGED")
    if cfg["gemShopHash"] != EXPECTED["postConfig"]["gemShopHash"]:
        raise RuntimeError("EXISTING_GEM_SHOPS_CHANGED")

    ready_rows = {name: ready(port) for name, port in {"S1": 8080, "S2": 8083, "S3": 8084, "S4": 8085, "S5": 8086, "S6": 8087}.items()}
    live_hashes = {SERVER: remote_hash(SERVER), INDEX: remote_hash(INDEX), ADDON: remote_hash(ADDON)}
    if live_hashes != {SERVER: EXPECTED_SERVER, INDEX: EXPECTED_INDEX, ADDON: EXPECTED_ADDON}:
        raise RuntimeError(f"LIVE_HASH_DRIFT:{live_hashes}")
    served_rows = {name: served(base) for name, base in (("loopback", "http://127.0.0.1:81"), ("public", "https://linhhoasu.lol"))}
    for name, row in served_rows.items():
        if row["index"] != EXPECTED_INDEX or row["addon"] != EXPECTED_ADDON or not row["indexHasV2"] or not row["addonHasShopDisabled"]:
            raise RuntimeError(f"SERVED_DRIFT:{name}:{row}")

    result = {
        "at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "readOnly": True,
        "directPlayerWrites": 0,
        "config": cfg,
        "liveHashes": live_hashes,
        "ready": ready_rows,
        "served": served_rows,
        "result": "PASS",
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    sftp.close()
    client.close()
    print(json.dumps(result, ensure_ascii=False, indent=2), flush=True)


if __name__ == "__main__":
    main()
