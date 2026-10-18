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
const fs = require('fs');
const ConfigService = require('./src/services/ConfigService');
const BattleService = require('./src/services/BattleService');

(async () => {
  const m = new MongoClient('mongodb://127.0.0.1:27017');
  await m.connect();
  const col = m.db('lhs_s1001').collection('players');
  const p = await col.findOne({ name: 'Talo' });
  if (!p) { console.log('NOT_FOUND'); await m.close(); return; }

  // Inspect each sub-module attrs in BattleService
  // Let's see what BattleService.calcPlayerPower does step by step
  const breakdown = {};
  
  // 1. Base stage / level
  const roleStageCfg = ConfigService.get('RoleStageConfig') || {};
  const stageCfg = roleStageCfg[p.stage];
  breakdown.stage = { stage: p.stage, attr: stageCfg ? stageCfg.attr : null };

  // 2. Equips
  // Let's check what equips Talo has
  breakdown.equips = p.equips || p.equipInfo;

  // Let's check native formula vs server formula
  const tables = ConfigService.loadAllTables();
  const AttrConfig = tables.AttrConfig;

  function nativePower(attrs) {
    if (!attrs) return 0;
    let sum = 0;
    for (const [k, v] of Object.entries(attrs)) {
      const cfg = AttrConfig[k];
      if (cfg && cfg.power) {
        sum += Number(v) * cfg.power;
      }
    }
    return Math.ceil(sum);
  }

  // Check what attrs give HP = 247274 and Power = 983118!
  console.log(JSON.stringify({
    level: p.level,
    stage: p.stage,
    vipLv: p.vipLv,
    equips_count: (p.equips || []).length,
    stageAttrs: breakdown.stage.attr,
    stageNativePower: nativePower(breakdown.stage.attr),
    has_mount: !!p.mountInfo,
    has_pet: !!p.petInfo,
    has_fashion: !!p.fashionInfo,
    has_gem: !!p.gemInfo,
    has_spirit: !!p.spiritInfo,
    has_artifact: !!p.artifactInfo,
    has_fate: !!p.fateInfo,
    has_fishing: !!p.fishingInfo,
    has_valhalla: !!p.valhallaInfo,
    has_bloodline: !!p.bloodlineInfo,
    has_curios: !!p.curiosInfo,
    has_elf: !!p.elfInfo,
    has_homeland: !!p.homelandInfo,
    has_specSpirit: !!p.specSpiritInfo,
    has_petSoul: !!p.petSoulInfo,
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
