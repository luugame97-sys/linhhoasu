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
const { buildPlayer500Data } = require('./src/handlers/playerPayload');

(async () => {
  const tables = ConfigService.loadAllTables();
  const AttrConfig = tables.AttrConfig || {};

  const m = new MongoClient('mongodb://127.0.0.1:27017');
  await m.connect();
  const col = m.db('lhs_s1001').collection('players');
  const p = await col.findOne({ name: 'Talo' });
  await m.close();

  if (!p) return;

  // Build the EXACT payload tag 500 sent to client
  const p500 = buildPlayer500Data(p);

  console.log('p500.power sent to client:', p500.power);

  // Now let us implement the EXACT client formula:
  // 1. Client attrModify
  function clientAttrModify(attrs) {
    const t = { ...attrs };
    const n = { ...attrs };
    for (const e in t) {
      const a = Number(e);
      const s = Number(t[a] || 0);
      const o = AttrConfig[a];
      if (o && Array.isArray(o.linkId)) {
        for (let r = 0; r < o.linkId.length; r++) {
          const h = o.linkId[r];
          const d = AttrConfig[a];
          const c = Number(n[h] || 0);
          const u = Number(t[h] || 0);
          if (d.dataType === 1) {
            t[h] = u + s;
          } else if (d.dataType === 2) {
            t[h] = Math.floor(c * (s / 10000)) + u;
          }
        }
      }
    }
    return t;
  }

  // 2. Client calPowerByAttr
  function clientCalPowerByAttr(attrs) {
    let power = 0;
    for (const [k, v] of Object.entries(attrs)) {
      const cfg = AttrConfig[k];
      if (cfg && cfg.power) {
        power += Number(v) * cfg.power;
      }
    }
    return Math.ceil(power);
  }

  // Check what server BattleService does vs what client does!
  const BattleService = require('./src/services/BattleService');
  const serverAttrs = BattleService.calcPlayerPower(p);
  const serverPower = clientCalPowerByAttr(serverAttrs);
  console.log('Server Native Power:', serverPower);

  // If we take server raw attrs BEFORE applyPercentLinkedAttrs and run clientAttrModify:
  // Let us see if there is any difference between server applyPercentLinkedAttrs and client attrModify!
  console.log('Server ATK (2):', serverAttrs[2], 'DEF (3):', serverAttrs[3], 'HP (1):', serverAttrs[1]);

  // Let us check all components in p:
  // Is there any component in p that client calculates but server BattleService DOES NOT?
  // Check OldTrekModel attrs in client:
  // Does BattleService addOldTrekAttrs?
  console.log('OldTrek in p:', JSON.stringify(p.other_attr_info && p.other_attr_info.oldTrekInfo || {}));
  console.log('Curios in p:', JSON.stringify(p.other_attr_info && p.other_attr_info.curiosInfo || {}));
  console.log('SpecSpirit in p:', JSON.stringify(p.other_attr_info && p.other_attr_info.specSpiritInfo || {}));

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
