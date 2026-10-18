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
  const m = new MongoClient('mongodb://127.0.0.1:27017');
  await m.connect();
  const col = m.db('lhs_s1001').collection('players');
  const p = await col.findOne({ name: 'Talo' });
  await m.close();

  if (!p) return;

  console.log('=== CHECK EQUIP PLANS & INVENTORY ===');
  const equipInfo = p.equipInfo || {};
  console.log('curIndex:', equipInfo.curIndex);
  console.log('Plans in equipSetMap:', Object.keys(equipInfo.equipSetMap || {}));
  
  for (const planId of Object.keys(equipInfo.equipSetMap || {})) {
    const plan = equipInfo.equipSetMap[planId] || {};
    const slots = Object.keys(plan);
    console.log(`Plan ${planId}: ${slots.length} slots equipped.`);
    slots.forEach(s => {
      const eq = plan[s];
      console.log(`  Plan ${planId} Slot ${s}: ID=${eq.id}, Quality=${eq.quailty}, Lv=${eq.lv}, Attrs=${JSON.stringify(eq.attrs)}`);
    });
  }

  // Check openListMap (các trang bị mở ra đang lưu hoặc trong kho)
  console.log('openListMap keys:', Object.keys(equipInfo.openListMap || {}));
  for (const k of Object.keys(equipInfo.openListMap || {})) {
    const list = equipInfo.openListMap[k] || [];
    console.log(`openListMap[${k}]: ${list.length} items`);
    list.forEach(eq => {
      console.log(`  Open Item: ID=${eq.id}, Pos=${eq.type || eq.pos}, Quality=${eq.quailty}, Attrs=${JSON.stringify(eq.attrs)}`);
    });
  }

  // Check equipList
  const equipList = equipInfo.equipList || [];
  console.log(`equipList total items: ${equipList.length}`);
  equipList.forEach(eq => {
    console.log(`  EquipList Item: ID=${eq.id}, Type=${eq.type}, Quality=${eq.quailty}`);
  });

  // Check bag items (p.items) for any high-tier items
  console.log('=== BAG ITEMS ===');
  const bagItems = p.items || {};
  const highItems = Object.keys(bagItems).filter(id => Number(id) >= 200000000 || Number(id) >= 70000);
  console.log('High tier items in bag:', highItems.map(id => `${id}: ${bagItems[id]}`).join(', '));

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
