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
  const db = m.db('lhs_s1001');

  // Check collections in lhs_s1001
  const cols = await db.listCollections().toArray();
  console.log('Collections:', cols.map(c => c.name).join(', '));

  // Check ranking collections if any
  for (const cName of ['rankings', 'ranks', 'arena', 'cross_arena', 'settlement']) {
    if (cols.find(c => c.name === cName)) {
      const docs = await db.collection(cName).find({}).limit(5).toArray();
      console.log(`Sample from ${cName}:`, JSON.stringify(docs));
    }
  }

  // Find Top 10 players on S1 by calculating their battle power
  const players = await db.collection('players').find({}).toArray();
  console.log('Total players on S1:', players.length);

  const playerPowers = players.map(p => {
    const attrs = BattleService.calcPlayerPower(p);
    const power = nativePower(attrs);
    return {
      name: p.name,
      accountId: p.accountId,
      level: p.level,
      stage: p.stage,
      power: power,
      swordsCount: (p.swordInfo && p.swordInfo.data || []).length,
      topSwordLv: Math.max(0, ...(p.swordInfo && p.swordInfo.data || []).map(s => Number(s.level || 0))),
      spiritGrade: p.spiritInfo && p.spiritInfo.grade,
      spiritLv: p.spiritInfo && p.spiritInfo.level,
      equipsCount: (p.equipInfo && p.equipInfo.equipList || []).length
    };
  });

  playerPowers.sort((a, b) => b.power - a.power);

  console.log('=== TOP 10 PLAYERS BY POWER ON S1 ===');
  playerPowers.slice(0, 10).forEach((p, idx) => {
    console.log(`${idx + 1}. [${p.name}] (Acc: ${p.accountId}) - Power: ${p.power.toLocaleString('en-US')} | MountLv: ${p.topSwordLv} | SpiritG/L: ${p.spiritGrade}/${p.spiritLv} | Equips: ${p.equipsCount}`);
  });

  // Find specifically Talo rank
  const taloRank = playerPowers.findIndex(p => p.name === 'Talo') + 1;
  console.log(`Talo Rank: #${taloRank} of ${playerPowers.length}`);

  await m.close();
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
