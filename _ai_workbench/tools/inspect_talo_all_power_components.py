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
  
  if (!p) {
    console.log('TALO_NOT_FOUND');
    await m.close();
    return;
  }

  console.log('=== TALO GENERAL INFO ===');
  console.log('UserId:', p.userId, 'PlayerId:', p.playerId, 'AccountId:', p.accountId);
  console.log('Level:', p.level, 'Stage:', p.stage, 'VipLv:', p.vipLv);

  // Check Mount (Sword)
  console.log('=== MOUNT / SWORD INFO ===');
  const swordInfo = p.swordInfo || {};
  console.log('Sword equippedUid:', swordInfo.equippedUid);
  const swords = swordInfo.data || [];
  console.log('Total swords count:', swords.length);
  swords.forEach(s => {
    console.log(`  Sword UID=${s.uid}, ID=${s.id}, Level=${s.level}, Star=${s.star}, Quality=${s.quality}`);
  });

  // Check Gem (Hồn ngọc)
  console.log('=== GEM INFO ===');
  const gemInfo = p.gemInfo || (p.other_attr_info && p.other_attr_info.gemInfo) || {};
  const gems = Array.isArray(gemInfo.gems) ? gemInfo.gems : [];
  const gemPositions = (gemInfo.plan && gemInfo.plan.positions) || [];
  console.log('Total gems in inventory:', gems.length);
  console.log('Total gems placed in plan:', gemPositions.length);
  gemPositions.forEach(pos => {
    const g = gems.find(x => x.uid === pos.uid);
    console.log(`  Placed slot (${pos.x},${pos.y}): UID=${pos.uid}, ID=${g ? g.id : 'N/A'}, Shape=${pos.shapeId}`);
  });

  // Check Formation (Trận pháp)
  console.log('=== FORMATION INFO ===');
  const fInfo = p.formationInfo || {};
  console.log('Formation equippedId:', fInfo.equippedId || fInfo.id);
  console.log('Formation map keys:', Object.keys(fInfo.map || {}));

  // Check Spirit (Tinh linh)
  console.log('=== SPIRIT INFO ===');
  const spInfo = p.spiritInfo || {};
  console.log('Spirit id:', spInfo.id, 'equippedId:', spInfo.equippedId, 'grade:', spInfo.grade, 'level:', spInfo.level);

  // Check Fashion (Thời trang)
  console.log('=== FASHION INFO ===');
  const fshInfo = p.fashionInfo || {};
  console.log('CurFashion:', JSON.stringify(fshInfo.curFashion));
  console.log('Fashions count:', Object.keys(fshInfo.fashions || {}).length);

  // Check Artifact (Thần binh / Pháp bảo)
  console.log('=== ARTIFACT INFO ===');
  const artInfo = p.artifactInfo || {};
  console.log('Artifact equipMap:', JSON.stringify(artInfo.equipMap));
  console.log('Artifact count:', Object.keys(artInfo.artifacts || {}).length);

  // Check Dan duoc / itemUseRecords
  console.log('=== ITEM USE RECORDS (Đan dược) ===');
  const itemRecords = p.itemUseRecords || (p.other_attr_info && p.other_attr_info.record) || {};
  console.log('Item use records count:', Object.keys(itemRecords).length);
  const samplePills = Object.keys(itemRecords).slice(0, 10).map(k => `${k}:${itemRecords[k]}`).join(', ');
  console.log('Sample pills:', samplePills);

  // Check BattleService power breakdown by category!
  console.log('=== POWER BREAKDOWN BY CATEGORY ===');
  // Let us run individual modules to see how much power each module gives
  const breakdown = {};
  
  // 1. Stage
  const stageCfg = (tables.RoleStageConfig || {})[p.stage];
  if (stageCfg && stageCfg.attr) {
    breakdown.stage = { power: nativePower(stageCfg.attr), raw: stageCfg.attr };
  }

  // 2. Equips
  const curIdx = String(p.equipInfo && p.equipInfo.curIndex || 0);
  const equipMap = (p.equipInfo && p.equipInfo.equipSetMap && p.equipInfo.equipSetMap[curIdx]) || {};
  let equipAttrs = {};
  Object.values(equipMap).forEach(eq => {
    if (eq && eq.attrs) {
      for (const [k, v] of Object.entries(eq.attrs)) {
        equipAttrs[k] = (equipAttrs[k] || 0) + Number(v);
      }
    }
  });
  breakdown.equips = { count: Object.keys(equipMap).length, power: nativePower(equipAttrs) };

  // 3. Mount power
  let mountAttrs = {};
  if (swords.length > 0) {
    const swordCfg = tables.SwordConfig || {};
    const swordAttrCfg = tables.SwordAttrConfig || {};
    swords.forEach(s => {
      // Base attributes of sword
    });
  }

  // Total server power
  const allAttrs = BattleService.calcPlayerPower(p);
  const totalNativePower = nativePower(allAttrs);
  const score = BattleService.calcPowerScore(allAttrs);
  console.log('Total Attrs Power (Native):', totalNativePower);
  console.log('BattleService calcPowerScore:', score);

  console.log('Breakdown Summary:', JSON.stringify(breakdown, null, 2));

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
