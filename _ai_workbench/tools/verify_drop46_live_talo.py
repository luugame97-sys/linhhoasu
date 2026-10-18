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
const EquipService = require('./src/services/EquipService');
const BattleService = require('./src/services/BattleService');

(async () => {
  const tables = ConfigService.loadAllTables();
  const assets = ConfigService.get('AssetsConfig') || {};
  
  const hasDrop46 = !!assets[200049101];
  console.log('Drop46 in AssetsConfig:', hasDrop46);
  if (hasDrop46) {
    console.log('Sample Drop46 asset:', JSON.stringify(assets[200049101]));
  }

  const m = new MongoClient('mongodb://127.0.0.1:27017');
  await m.connect();
  const col = m.db('lhs_s1001').collection('players');
  const p = await col.findOne({ name: 'Talo' });
  await m.close();

  if (!p) {
    console.log('PLAYER_NOT_FOUND');
    return;
  }

  // Clone player to avoid mutating DB
  const playerCopy = JSON.parse(JSON.stringify(p));
  
  const curIdx = String(playerCopy.equipInfo && playerCopy.equipInfo.curIndex || 0);
  console.log('--- Before ensureEquipInfo ---');
  const rawMap = (playerCopy.equipInfo && playerCopy.equipInfo.equipSetMap && playerCopy.equipInfo.equipSetMap[curIdx]) || {};
  console.log('Raw equipSetMap[' + curIdx + '] slots count:', Object.keys(rawMap).length);
  console.log('Raw equipSetMap[' + curIdx + '] slot keys:', Object.keys(rawMap).sort((a,b)=>Number(a)-Number(b)).join(', '));

  EquipService.ensureEquipInfo(playerCopy);

  console.log('--- After ensureEquipInfo (simulates login tag 500) ---');
  const normMap = (playerCopy.equipInfo && playerCopy.equipInfo.equipSetMap && playerCopy.equipInfo.equipSetMap[curIdx]) || {};
  const normKeys = Object.keys(normMap).sort((a,b)=>Number(a)-Number(b));
  console.log('Normalized equipSetMap[' + curIdx + '] slots count:', normKeys.length);
  console.log('Normalized equipSetMap[' + curIdx + '] slot keys:', normKeys.join(', '));

  const items = normKeys.map(k => ({
    slot: k,
    id: normMap[k].id,
    uid: normMap[k].uid,
    quality: normMap[k].quailty,
    type: normMap[k].type,
  }));
  console.log('Normalized items summary:');
  items.forEach(it => {
    console.log(`  Slot ${it.slot}: ID=${it.id} (Quality=${it.quality}, Type=${it.type})`);
  });

  const payload500 = require('./src/handlers/playerPayload').buildPlayer500Data(playerCopy);
  const p500Equips = (payload500.equipInfo && payload500.equipInfo.equipSetMap && payload500.equipInfo.equipSetMap[curIdx]) || {};
  console.log('buildPlayer500Data equipSetMap[' + curIdx + '] count:', Object.keys(p500Equips).length);
  console.log('buildPlayer500Data power:', payload500.power);

  // Calculate battle power
  const battlePower = BattleService.calcPlayerPower(playerCopy);
  console.log('BattleService.calcPlayerPower:', battlePower);

  console.log('VERIFICATION_COMPLETE');
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
