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
OUT = ROOT / "_ai_workbench" / "temp" / "gem10_release_20261002" / "special_batch_postcheck.json"
TOKEN = "20261002_gem_quick100_v3"
REMOTE_FILES = {
    "ConfigService": "/linhhoasu/lhs/newServer/src/services/ConfigService.js",
    "gem.js": "/linhhoasu/lhs/newServer/src/handlers/gem.js",
    "gemLevel10Choice": "/linhhoasu/lhs/newServer/src/config/gemLevel10Choice.js",
    "index": "/linhhoasu/webgame/game/index.html",
    "quickaddon": "/linhhoasu/webgame/game/js/lhs-gem-quick100-v1.js",
}
EXPECTED_INDEX = hashlib.sha256(
    (ROOT / "_ai_workbench" / "temp" / "gem10_candidate_20261002" / "client" / "index.html").read_bytes()
).hexdigest()
EXPECTED_QUICK = hashlib.sha256(
    (ROOT / "_ai_workbench" / "temp" / "gem10_candidate_20261002" / "client" / "lhs-gem-quick100-v1.js").read_bytes()
).hexdigest()


def sha_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def q(value: str) -> str:
    return shlex.quote(value)


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
            raise RuntimeError(f"COMMAND_FAILED:{code}:{error.decode('utf-8', 'replace')[-700:]}")
        return output

    def remote_hash(path: str) -> str:
        with sftp.open(path, "rb") as handle:
            return sha_bytes(handle.read())

    hashes = {name: remote_hash(path) for name, path in REMOTE_FILES.items()}
    node_code = r'''
const C = require('/linhhoasu/lhs/newServer/src/services/ConfigService');
const pick = (table, id) => {
  const value = C.get(table) || {};
  return value[id] || value[String(id)] || null;
};
const assets = pick('AssetsConfig', 100097);
const use = pick('AssetsUseConfig', 100097);
const shop = pick('ShopConfig', 10000007);
const base = C.get('GemBaseConfig') || {};
const levels = C.get('GemLevelConfig') || {};
const maxLevel = Object.values(levels).reduce((n, row) => Math.max(n, Number(row && row.level) || 0), 0);
process.stdout.write(JSON.stringify({
  assets: assets && {id: assets.id, type: assets.type, quality: assets.quality, icon: assets.icon, useType: assets.useType},
  use: use && {id: use.id, type: use.type, rewards: use.rewards},
  shop: shop && {id: shop.id, tab: shop.tab, rewards: shop.rewards, cost: shop.cost, preId: shop.preId},
  gemBase: {initialField: base.initialField, initialFieldShow: base.initialFieldShow, fieldMax: base.fieldMax, maxQuickLevel: base.maxQuickLevel},
  gemLevelRows: Object.keys(levels).length,
  gemMaxLevel: maxLevel
}));
'''
    config_raw = run(f"node -e {q(node_code)}").decode("utf-8")
    config_line = next((line for line in reversed(config_raw.splitlines()) if line.strip().startswith("{")), "")
    config = json.loads(config_line)

    ready = {}
    for name, port in (("S1", 8080), ("S2", 8083), ("S3", 8084), ("S4", 8085), ("S5", 8086), ("S6", 8087)):
        raw = run(f"curl --max-time 10 -fsS http://127.0.0.1:{port}/ready", 15)
        ready[name] = json.loads(raw.decode("utf-8"))

    served = {}
    for name, base in (("loopback", "http://127.0.0.1:81"), ("public", "https://linhhoasu.lol")):
        try:
            index = run(f"curl --compressed --connect-timeout 5 --max-time 20 -fsS {q(base + '/index.html?v=' + TOKEN)}")
            # Cloudflare appends its beacon to public HTML. Strip only that
            # known telemetry tag before comparing the origin bytes.
            index = re.sub(
                rb'<script type="module" src="https://static\.cloudflareinsights\.com/beacon\.min\.js/.*?</script>\r?\n',
                b"",
                index,
                count=1,
                flags=re.S,
            )
            quick = run(f"curl --compressed --connect-timeout 5 --max-time 20 -fsS {q(base + '/js/lhs-gem-quick100-v1.js?v=' + TOKEN)}")
            served[name] = {"index": sha_bytes(index), "quickaddon": sha_bytes(quick)}
        except Exception as exc:
            served[name] = {"error": str(exc)}

    if served.get("public", {}).get("index") != EXPECTED_INDEX:
        raise RuntimeError(f"PUBLIC_INDEX_MISMATCH:{served.get('public')}:{EXPECTED_INDEX}")
    if served.get("public", {}).get("quickaddon") != EXPECTED_QUICK:
        raise RuntimeError(f"PUBLIC_QUICK_MISMATCH:{served.get('public')}:{EXPECTED_QUICK}")

    receipt = {
        "at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "readOnly": True,
        "directPlayerWrites": 0,
        "hashes": hashes,
        "config": config,
        "ready": ready,
        "served": served,
        "expectedServed": {"index": EXPECTED_INDEX, "quickaddon": EXPECTED_QUICK},
        "result": "PASS",
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    sftp.close()
    client.close()
    print(json.dumps(receipt, ensure_ascii=False, indent=2), flush=True)


if __name__ == "__main__":
    main()
