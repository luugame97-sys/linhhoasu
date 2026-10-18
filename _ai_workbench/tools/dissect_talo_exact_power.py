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
      if (cfg && cfg.power) {
        sum += Number(v) * cfg.power;
      }
    }
    return Math.ceil(sum);
  }

  const m = new MongoClient('mongodb://127.0.0.1:27017');
  await m.connect();
  const col = m.db('lhs_s1001').collection('players');
  const p = await col.findOne({ name: 'Talo' });
  await m.close();

  if (!p) return;

  // Let us test calcPlayerPower with ONLY ONE component active at a time!
  // This will tell us the exact power contribution of EVERY single system!
  
  const systems = [
    'stage', 'equips', 'equipInfo', 'swordInfo', 'petInfo', 'gemInfo', 
    'formationInfo', 'spiritInfo', 'artifactInfo', 'fashionInfo', 
    'other_attr_info.valhallaInfo', 'other_attr_info.bloodlineInfo',
    'other_attr_info.elfInfo', 'other_attr_info.curiosInfo',
    'fateInfo', 'fishInfo', 'homelandInfo', 'other_attr_info.record'
  ];

  const results = {};

  // Base empty player
  function getEmptyPlayer() {
    return {
      level: p.level,
      stage: p.stage,
      other_attr_info: {}
    };
  }

  // 1. Stage only
  {
    const temp = getEmptyPlayer();
    const attrs = BattleService.calcPlayerPower(temp);
    results['Base_Stage_Level'] = nativePower(attrs);
  }

  // 2. Equips only
  {
    const temp = getEmptyPlayer();
    temp.equipInfo = JSON.parse(JSON.stringify(p.equipInfo || {}));
    const attrs = BattleService.calcPlayerPower(temp);
    results['Equips'] = nativePower(attrs) - results['Base_Stage_Level'];
  }

  // 3. Mount (Sword) only
  {
    const temp = getEmptyPlayer();
    temp.swordInfo = JSON.parse(JSON.stringify(p.swordInfo || {}));
    const attrs = BattleService.calcPlayerPower(temp);
    results['Mount_Sword'] = nativePower(attrs) - results['Base_Stage_Level'];
  }

  // 4. Pet only
  {
    const temp = getEmptyPlayer();
    temp.petInfo = JSON.parse(JSON.stringify(p.petInfo || {}));
    const attrs = BattleService.calcPlayerPower(temp);
    results['Pet'] = nativePower(attrs) - results['Base_Stage_Level'];
  }

  // 5. Gem only
  {
    const temp = getEmptyPlayer();
    temp.gemInfo = JSON.parse(JSON.stringify(p.gemInfo || {}));
    if (p.other_attr_info && p.other_attr_info.gemInfo) {
      temp.other_attr_info.gemInfo = JSON.parse(JSON.stringify(p.other_attr_info.gemInfo));
    }
    const attrs = BattleService.calcPlayerPower(temp);
    results['Gem_HonNgoc'] = nativePower(attrs) - results['Base_Stage_Level'];
  }

  // 6. Formation only
  {
    const temp = getEmptyPlayer();
    temp.formationInfo = JSON.parse(JSON.stringify(p.formationInfo || {}));
    const attrs = BattleService.calcPlayerPower(temp);
    results['Formation_TranPhap'] = nativePower(attrs) - results['Base_Stage_Level'];
  }

  // 7. Spirit only
  {
    const temp = getEmptyPlayer();
    temp.spiritInfo = JSON.parse(JSON.stringify(p.spiritInfo || {}));
    const attrs = BattleService.calcPlayerPower(temp);
    results['Spirit_TinhLinh'] = nativePower(attrs) - results['Base_Stage_Level'];
  }

  // 8. Artifact only
  {
    const temp = getEmptyPlayer();
    temp.artifactInfo = JSON.parse(JSON.stringify(p.artifactInfo || {}));
    const attrs = BattleService.calcPlayerPower(temp);
    results['Artifact_ThanBinh'] = nativePower(attrs) - results['Base_Stage_Level'];
  }

  // 9. Fashion only
  {
    const temp = getEmptyPlayer();
    temp.fashionInfo = JSON.parse(JSON.stringify(p.fashionInfo || {}));
    const attrs = BattleService.calcPlayerPower(temp);
    results['Fashion_ThoiTrang'] = nativePower(attrs) - results['Base_Stage_Level'];
  }

  // 10. Valhalla (Anh Linh) only
  {
    const temp = getEmptyPlayer();
    if (p.other_attr_info && p.other_attr_info.valhallaInfo) {
      temp.other_attr_info.valhallaInfo = JSON.parse(JSON.stringify(p.other_attr_info.valhallaInfo));
    }
    const attrs = BattleService.calcPlayerPower(temp);
    results['Valhalla_AnhLinh'] = nativePower(attrs) - results['Base_Stage_Level'];
  }

  // 11. Bloodline (Huyet Thong) only
  {
    const temp = getEmptyPlayer();
    if (p.other_attr_info && p.other_attr_info.bloodlineInfo) {
      temp.other_attr_info.bloodlineInfo = JSON.parse(JSON.stringify(p.other_attr_info.bloodlineInfo));
    }
    const attrs = BattleService.calcPlayerPower(temp);
    results['Bloodline_HuyetThong'] = nativePower(attrs) - results['Base_Stage_Level'];
  }

  // 12. Elf (Tieu Tinh Linh) only
  {
    const temp = getEmptyPlayer();
    if (p.other_attr_info && p.other_attr_info.elfInfo) {
      temp.other_attr_info.elfInfo = JSON.parse(JSON.stringify(p.other_attr_info.elfInfo));
    }
    const attrs = BattleService.calcPlayerPower(temp);
    results['Elf'] = nativePower(attrs) - results['Base_Stage_Level'];
  }

  // 13. Curios (Co Vat) only
  {
    const temp = getEmptyPlayer();
    if (p.other_attr_info && p.other_attr_info.curiosInfo) {
      temp.other_attr_info.curiosInfo = JSON.parse(JSON.stringify(p.other_attr_info.curiosInfo));
    }
    const attrs = BattleService.calcPlayerPower(temp);
    results['Curios_CoVat'] = nativePower(attrs) - results['Base_Stage_Level'];
  }

  // 14. Fate (Menh Cach) only
  {
    const temp = getEmptyPlayer();
    temp.fateInfo = JSON.parse(JSON.stringify(p.fateInfo || {}));
    const attrs = BattleService.calcPlayerPower(temp);
    results['Fate_MenhCach'] = nativePower(attrs) - results['Base_Stage_Level'];
  }

  // 15. Fishing (Cau Ca) only
  {
    const temp = getEmptyPlayer();
    temp.fishInfo = JSON.parse(JSON.stringify(p.fishInfo || {}));
    const attrs = BattleService.calcPlayerPower(temp);
    results['Fishing_CauCa'] = nativePower(attrs) - results['Base_Stage_Level'];
  }

  // 16. Homeland (Gia Vien) only
  {
    const temp = getEmptyPlayer();
    temp.homelandInfo = JSON.parse(JSON.stringify(p.homelandInfo || {}));
    const attrs = BattleService.calcPlayerPower(temp);
    results['Homeland_GiaVien'] = nativePower(attrs) - results['Base_Stage_Level'];
  }

  console.log('=== EXACT POWER BY EACH SYSTEM ===');
  for (const [k, v] of Object.entries(results)) {
    console.log(`${k.padEnd(25)}: ${v.toLocaleString('en-US')}`);
  }

  const allAttrs = BattleService.calcPlayerPower(p);
  const totalNative = nativePower(allAttrs);
  console.log('-----------------------------------');
  console.log('Actual Total Combined Power:', totalNative.toLocaleString('en-US'));

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
