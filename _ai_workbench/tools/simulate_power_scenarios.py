import json
import shlex
import sys
from pathlib import Path

TOOLS_DIR = Path(__file__).resolve().parent
sys.path.append(str(TOOLS_DIR))
try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

from snapshot_web_multiserver_20260906 import connect, run

def main():
    ssh = connect()
    try:
        remote_script = r'''
const { MongoClient } = require('mongodb');
const ConfigService = require('./src/services/ConfigService');
const BattleService = require('./src/services/BattleService');

(async () => {
  const tables = ConfigService.loadAllTables();
  const AttrConfig = tables.AttrConfig || {};

  function nativePower(attrs) {
    if (!attrs) return 0;
    let sum = 0;
    for (const [k, v] of Object.entries(attrs)) {
      const cfg = AttrConfig[k];
      if (cfg && cfg.power) sum += Number(v) * cfg.power;
    }
    return Math.ceil(sum);
  }

  const m = new MongoClient('mongodb://127.0.0.1:27017');
  await m.connect();
  const col = m.db('lhs_s1001').collection('players');
  const p = await col.findOne({ name: 'Talo' });
  await m.close();

  if (!p) return;

  console.log('--- SCENARIO 1: CURRENT LIVE TALO ---');
  const liveAttrs = BattleService.calcPlayerPower(p);
  console.log('Current Power:', nativePower(liveAttrs).toLocaleString('en-US'));
  console.log('Current HP:', liveAttrs[1], 'ATK:', liveAttrs[2], 'DEF:', liveAttrs[3]);

  // SCENARIO 2: What if Slot 3, 6, 11 were Drop46 (ID 200049103, 200049106, 200049111)?
  console.log('\n--- SCENARIO 2: FULL 12 DROP46 EQUIPS ---');
  const pDrop46 = JSON.parse(JSON.stringify(p));
  const plan = pDrop46.equipInfo.equipSetMap['0'];
  // Replace slot 3, 6, 11 with Drop46 template stats (Lv 170, Quality 49)
  plan['3'] = { id: 200049103, quailty: 49, lv: 170, attrs: { 1: 70000, 2: 22500, 3: 8000, 4: 5300, 104: 11500 } };
  plan['6'] = { id: 200049106, quailty: 49, lv: 170, attrs: { 1: 70000, 2: 22500, 3: 8000, 4: 5300, 101: 11500 } };
  plan['11'] = { id: 200049111, quailty: 49, lv: 170, attrs: { 1: 70000, 2: 22500, 3: 8000, 4: 5300, 103: 11500 } };
  const drop46Attrs = BattleService.calcPlayerPower(pDrop46);
  console.log('Full Drop46 Power:', nativePower(drop46Attrs).toLocaleString('en-US'));
  console.log('Full Drop46 HP:', drop46Attrs[1], 'ATK:', drop46Attrs[2], 'DEF:', drop46Attrs[3]);

  // SCENARIO 3: What if Mount Lv was 1000?
  console.log('\n--- SCENARIO 3: IF MOUNT WAS LEVEL 1000 ---');
  const pMount1000 = JSON.parse(JSON.stringify(p));
  const s = pMount1000.swordInfo.data.find(x => x.uid === pMount1000.swordInfo.equippedUid);
  if (s) s.level = 1000;
  const mount1000Attrs = BattleService.calcPlayerPower(pMount1000);
  console.log('Mount Lv 1000 Power:', nativePower(mount1000Attrs).toLocaleString('en-US'));
  console.log('Mount Lv 1000 HP:', mount1000Attrs[1], 'ATK:', mount1000Attrs[2], 'DEF:', mount1000Attrs[3]);

  // SCENARIO 4: What if both Full Drop46 AND Mount Lv 1000?
  console.log('\n--- SCENARIO 4: BOTH FULL DROP46 + MOUNT 1000 ---');
  const pBoth = JSON.parse(JSON.stringify(pDrop46));
  const sBoth = pBoth.swordInfo.data.find(x => x.uid === pBoth.swordInfo.equippedUid);
  if (sBoth) sBoth.level = 1000;
  const bothAttrs = BattleService.calcPlayerPower(pBoth);
  console.log('Both Power:', nativePower(bothAttrs).toLocaleString('en-US'));

  // SCENARIO 5: What gives EXACTLY 898,296,095 power?
  // Let us check what extra multiplier or attrs would make live power equal 898,296,095
  const ratio = 898296095 / nativePower(liveAttrs);
  console.log('\nRatio of 898,296,095 / Current Power:', ratio);
  console.log('Target ATK in image:', 19208602, 'Current ATK:', liveAttrs[2], 'Ratio:', 19208602 / liveAttrs[2]);
  console.log('Target DEF in image:', 3815626, 'Current DEF:', liveAttrs[3], 'Ratio:', 3815626 / liveAttrs[3]);

})().catch(e => {
  console.error(e);
  process.exit(1);
});
'''
        cmd = f"cd /linhhoasu/lhs/newServer && node -e {shlex.quote(remote_script)}"
        out = run(ssh, cmd).strip()
        print(out)
    finally:
        ssh.close()

if __name__ == '__main__':
    main()
