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

  // Let's examine how each Client Model calculates its attrs:
  // 1. MountModel.getAttrs():
  // How does MountModel calculate getAttrs?
  // Let's inspect the code of MountModel in main.min_drop100.js!
  const fs = require('fs');
  const clientJs = fs.readFileSync('/linhhoasu/webgame/game/js/main.min_drop100.js', 'utf8');

  function findMethod(className, methodName) {
    const pattern = `${methodName}=function`;
    let pos = 0;
    while ((pos = clientJs.indexOf(pattern, pos)) !== -1) {
      const slice = clientJs.slice(Math.max(0, pos - 100), pos + 300);
      if (slice.includes(className)) {
        return slice;
      }
      pos += pattern.length;
    }
    return null;
  }

  // Check MountModel.getAttrs
  let idx = clientJs.indexOf('MountModel');
  // Find where MountModel is defined
  let mDef = '';
  pos = 0;
  while ((pos = clientJs.indexOf('.MountModel=', pos)) !== -1) {
    console.log('MountModel instance:\n', clientJs.slice(pos, pos + 200));
    pos += 12;
  }

  // Check FormationModel getAttrs
  pos = 0;
  while ((pos = clientJs.indexOf('.FormationModel=', pos)) !== -1) {
    console.log('FormationModel instance:\n', clientJs.slice(pos, pos + 200));
    pos += 16;
  }

  // Check SpiritModel getAttrs
  pos = 0;
  while ((pos = clientJs.indexOf('.SpiritModel=', pos)) !== -1) {
    console.log('SpiritModel instance:\n', clientJs.slice(pos, pos + 200));
    pos += 13;
  }

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
