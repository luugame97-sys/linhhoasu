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
const ConfigService = require('./src/services/ConfigService');
const tables = ConfigService.loadAllTables();

console.log('Tables matching suit/equip:');
Object.keys(tables).filter(t => /suit|equip/i.test(t)).forEach(t => console.log('  ', t));

const suitCfg = tables.EquipSuitConfig || tables.SuitConfig || tables.EquipSuitAttrConfig || {};
console.log('SuitConfig sample:', JSON.stringify(Object.values(suitCfg).slice(0, 5)));

// Check how BattleService calculates equips and suits
const fs = require('fs');
const battleSrc = fs.readFileSync('./src/services/BattleService.js', 'utf8');
const lines = battleSrc.split('\n');
lines.forEach((l, idx) => {
  if (/suit|equipSet|equipSuit|setMap/i.test(l)) {
    console.log(`L${idx+1}: ${l.trim().slice(0, 100)}`);
  }
});

'''
        cmd = f"cd /linhhoasu/lhs/newServer && node -e {shlex.quote(remote_script)}"
        out = run(ssh, cmd).strip()
        print(out)
    finally:
        ssh.close()

if __name__ == '__main__':
    main()
