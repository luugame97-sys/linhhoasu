import hashlib
import json
import shutil
import sys
from pathlib import Path

if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

ROOT = Path("i:/Linhhoasu/server/server")
SRC_BIN = ROOT / "linhhoasu/webgame/game/update/resource/assets/excel/config_fashion_20260909.bin"

DEST_BINS = [
    ROOT / "linhhoasu/lhs/update/resource/assets/excel/config_fashion_20260909.bin",
    ROOT / "linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin",
    ROOT / "linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin",
]

def sha256(data):
    return hashlib.sha256(data).hexdigest()

print(f">>> 1. Verifying source binary: {SRC_BIN}")
src_bytes = SRC_BIN.read_bytes()
src_sha = sha256(src_bytes)
print(f"  Source size: {len(src_bytes)} bytes, SHA-256: {src_sha}")

# Check with Node.js decodeTables
check_script = f"""
const fs = require('fs');
const path = require('path');
const {{ decodeTables }} = require(path.resolve('{ROOT.as_posix()}/linhhoasu/lhs/newServer/src/services/ConfigService'));

const buf = fs.readFileSync('{SRC_BIN.as_posix()}');
const tables = decodeTables(buf);

console.log('Tables count:', Object.keys(tables).length);

// 1. SwordLevelConfig
const sword = tables.SwordLevelConfig;
if (!sword) throw new Error('MISSING SwordLevelConfig');
for (const q of ['2', '3', '4', '6', '7']) {{
  const maxL = Math.max(...Object.keys(sword[q] || {{}}).map(Number));
  if (maxL !== 1000) throw new Error(`Quality ${{q}} max level is ${{maxL}}, expected 1000`);
}}
console.log('CHECK 1: SwordLevelConfig quality 2,3,4,6,7 all max level == 1000 -> PASS');

// 2. GemLevelConfig
const gem = tables.GemLevelConfig;
if (!gem) throw new Error('MISSING GemLevelConfig');
const gemRows = Object.keys(gem).length;
const gemMaxLevel = Math.max(...Object.values(gem).map(x => Number(x.level) || 0));
if (gemMaxLevel !== 100 || gemRows !== 588) {{
  throw new Error(`GemLevelConfig max level is ${{gemMaxLevel}} (expected 100), rows=${{gemRows}} (expected 588)`);
}}
console.log(`CHECK 2: GemLevelConfig max level == 100, total rows == ${{gemRows}} -> PASS`);

// 3. TopCombat & Arena rewards
const topCombat = tables.TopCombatDayRankRewardConfig;
const top1Gem = topCombat[1].rewards.find(r => r.id === 90078);
if (!top1Gem || top1Gem.count !== 10) throw new Error('TopCombat missing 90078 x10');
console.log('CHECK 3: TopCombatDayRankRewardConfig top 1 has item 90078 x10 -> PASS');

const arena = tables.ArenaDayRankRewardConfig;
const arena1Gem = arena[1].rewards.find(r => r.id === 90077);
if (!arena1Gem || arena1Gem.count !== 10) throw new Error('Arena missing 90077 x10');
console.log('CHECK 4: ArenaDayRankRewardConfig top 1 has item 90077 x10 -> PASS');

// Export dumps
const dumpDir = path.resolve('{ROOT.as_posix()}/linhhoasu/lhs/newServer/scripts/_tables_dump');
for (const name of ['SwordLevelConfig', 'GemLevelConfig', 'GemComposeConfig', 'GemShapeConfig']) {{
  const dumpFile = path.join(dumpDir, name + '.json');
  if (fs.existsSync(dumpFile)) {{
    const current = JSON.parse(fs.readFileSync(dumpFile, 'utf8'));
    current.data = tables[name];
    fs.writeFileSync(dumpFile, JSON.stringify(current, null, 2), 'utf8');
    console.log(`Updated dump: ${{name}}.json`);
  }}
}}
"""

check_js_path = ROOT / "_ai_workbench/tools/_temp_check_source.js"
check_js_path.write_text(check_script, encoding='utf-8')

import subprocess
res = subprocess.run(["node", str(check_js_path)], capture_output=True, text=True, encoding='utf-8')
print(res.stdout)
if res.returncode != 0:
    print(res.stderr)
    raise RuntimeError("Verification of source binary failed!")
check_js_path.unlink()

print(">>> 2. Syncing source binary to all targets...")
for dst in DEST_BINS:
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(SRC_BIN, dst)
    dst_sha = sha256(dst.read_bytes())
    if dst_sha != src_sha:
        raise RuntimeError(f"Sync failed for {dst}")
    print(f"  Synced -> {dst.relative_to(ROOT)} (SHA: {dst_sha[:12]}...) OK")

print("\n>>> ALL BINARY FILES SYNCHRONIZED SUCCESSFULLY!")
