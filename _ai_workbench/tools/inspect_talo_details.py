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
const ConfigService = require('./src/services/ConfigService');
const BattleService = require('./src/services/BattleService');

(async () => {
  const m = new MongoClient('mongodb://127.0.0.1:27017');
  await m.connect();
  const col = m.db('lhs_s1001').collection('players');
  const p = await col.findOne({ name: 'Talo' });
  if (!p) { console.log('NOT_FOUND'); await m.close(); return; }

  // Inspect each sub-module contribution
  const tables = ConfigService.loadAllTables();
  const AttrConfig = tables.AttrConfig;

  function calcScore(attrs) {
    if (!attrs) return 0;
    let s = 0;
    for (const [k, v] of Object.entries(attrs)) {
      const cfg = AttrConfig[k];
      if (cfg && cfg.power) s += Number(v) * cfg.power;
    }
    return Math.ceil(s);
  }

  // Check what is in p.other_attr_info
  const oai = p.other_attr_info || {};
  console.log('other_attr_info keys:', Object.keys(oai));
  console.log('p keys:', Object.keys(p));

  // Let's check stage
  console.log('roleInfo:', p.roleInfo);
  console.log('stageId in roleInfo:', p.roleInfo?.stageId, p.roleInfo?.stage);

  // Let's check equips
  const equipInfo = p.equipInfo || {};
  console.log('equipInfo curIndex:', equipInfo.curIndex);
  const equipSetMap = equipInfo.equipSetMap || {};
  console.log('equipSetMap keys:', Object.keys(equipSetMap));
  const curEquips = equipSetMap[String(equipInfo.curIndex || 0)] || {};
  console.log('curEquips slots:', Object.keys(curEquips));
  
  // Calculate power of just curEquips
  const equipAttrs = {};
  for (const eq of Object.values(curEquips)) {
    if (eq && eq.attrs) {
      for (const [k, v] of Object.entries(eq.attrs)) {
        equipAttrs[k] = (equipAttrs[k] || 0) + Number(v);
      }
    }
  }
  console.log('equipAttrs:', equipAttrs);
  console.log('equip native power:', calcScore(equipAttrs));

  const stageCfg = tables.RoleStageConfig[16];
  console.log('stage 16 attr:', stageCfg?.attr);
  console.log('stage 16 power:', calcScore(stageCfg?.attr));

  // Check where 247274 could come from:
  // Check if box level or stage or level or something gives 247274!
  // Let's inspect all sub-objects of p:
  for (const k of Object.keys(p)) {
    const val = p[k];
    if (val && typeof val === 'object') {
      const s = JSON.stringify(val);
      if (s.includes('247274') || s.includes('983118')) {
        console.log('FOUND MATCH IN KEY:', k);
      }
    }
  }

  // Also check what attrs are sent in basic/playerPayload
  const basicAttrs = {};
  // Let's check player level 174 base attrs
  const roleLevelCfg = tables.RoleLevelConfig || tables.RoleLevelBaseConfig;
  console.log('level 174 cfg:', roleLevelCfg ? roleLevelCfg[174] : null);

  await m.close();
  process.exit(0);
})();
'''
        out = run(ssh, 'cd /linhhoasu/lhs/newServer && node', remote_script)
        print(out)
    finally:
        ssh.close()

if __name__ == '__main__':
    main()
