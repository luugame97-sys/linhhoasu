import json
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parent))
sys.stdout.reconfigure(encoding='utf-8')
from snapshot_web_multiserver_20260906 import connect, run

def main():
    ssh = connect()
    try:
        remote_script = r'''
const { MongoClient } = require('mongodb');
(async () => {
  const m = new MongoClient('mongodb://127.0.0.1:27017');
  await m.connect();
  const col = m.db('lhs_s1001').collection('players');
  const p = await col.findOne({ name: 'Talo' });
  if (!p) {
    const list = await col.find({}, { projection: { name: 1, playerId: 1, level: 1 } }).limit(5).toArray();
    console.log(JSON.stringify({ notFound: true, sample: list }));
    await m.close();
    return;
  }
  const BattleService = require('./src/services/BattleService');
  let computedPower = null;
  let attrs = null;
  try {
    attrs = BattleService.calcPlayerPower(p);
    computedPower = BattleService.calcPowerScore(attrs);
  } catch (e) {
    computedPower = e.message;
  }
  
  console.log(JSON.stringify({
    name: p.name,
    playerId: p.playerId,
    level: p.level,
    stage: p.stage,
    vipLv: p.vipLv,
    computedPower,
    legacyScore: computedPower,
    attrsPreview: attrs ? { hp: attrs[1], atk: attrs[2], def: attrs[3], spd: attrs[4] } : null,
    attrsFull: attrs,
    other_attr_info_power: p.other_attr_info?.power,
    other_attr_info_attrs: p.other_attr_info?.attrs,
    baseAttrs: p.baseAttrs,
    powerScore: p.powerScore,
    combatPower: p.combatPower,
    playerAttrs: p.playerAttrs,
  }, null, 2));
  await m.close();
})();
'''
        out = run(ssh, 'cd /linhhoasu/lhs/newServer && node', remote_script)
        print(out)
    finally:
        ssh.close()

if __name__ == '__main__':
    main()
