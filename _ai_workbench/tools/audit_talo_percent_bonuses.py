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

(async () => {
  const tables = ConfigService.loadAllTables();
  const m = new MongoClient('mongodb://127.0.0.1:27017');
  await m.connect();
  const col = m.db('lhs_s1001').collection('players');
  const p = await col.findOne({ name: 'Talo' });
  await m.close();

  if (!p) return;

  console.log('=== TALO DETAILS ===');
  console.log('Title:', p.title, 'ShowInfo:', JSON.stringify(p.roleInfo && p.roleInfo.showInfo));
  
  // Titles possessed
  const titleCfg = tables.TitleConfig || {};
  console.log('Owned titles / showInfo:', JSON.stringify(p.showInfo || p.titles || {}));
  if (p.roleInfo && p.roleInfo.showInfo && p.roleInfo.showInfo.title) {
    const tId = p.roleInfo.showInfo.title;
    console.log('Equipped title id:', tId, 'Config:', JSON.stringify(titleCfg[tId] || {}));
  }

  // Guild info
  console.log('GuildId:', p.guildId, 'GuildInfo:', JSON.stringify(p.guildInfo || {}));

  // Mounts detail
  const swordCfg = tables.SwordConfig || {};
  (p.swordInfo && p.swordInfo.data || []).forEach(s => {
    const cfg = swordCfg[s.id] || {};
    console.log(`Mount UID=${s.uid}, ID=${s.id} (${cfg.name}), Lv=${s.level}, Star=${s.star}, Quality=${s.quality}, equipped=${s.uid === p.swordInfo.equippedUid}`);
  });

  // Pets detail
  const petCfg = tables.PetConfig || {};
  (p.petInfo && p.petInfo.pets || []).forEach(pet => {
    const cfg = petCfg[pet.id] || {};
    console.log(`Pet UID=${pet.uid}, ID=${pet.id} (${cfg.name}), Lv=${pet.level}, Slot=${pet.slot}`);
  });

  // Artifacts detail
  console.log('Artifacts:', JSON.stringify(p.artifactInfo || {}));

  // Curios detail
  console.log('Curios:', JSON.stringify(p.other_attr_info && p.other_attr_info.curiosInfo || {}));

  // Check percent bonuses currently calculated in BattleService
  console.log('=== ATTRS FROM ALL CATEGORIES ===');
  const BattleService = require('./src/services/BattleService');
  const fullAttrs = BattleService.calcPlayerPower(p);
  
  // Percent attrs: 201..265
  const percentKeys = Object.keys(fullAttrs).filter(k => Number(k) >= 200 && Number(k) < 300);
  console.log('Percent attribute bonuses:');
  percentKeys.forEach(k => {
    const cfg = tables.AttrConfig && tables.AttrConfig[k];
    console.log(`  Attr ${k} (${cfg ? cfg.name : 'Unknown'}): ${fullAttrs[k] / 100}%`);
  });

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
