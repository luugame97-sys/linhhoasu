import re
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
const fs = require('fs');
const clientJs = fs.readFileSync('/linhhoasu/webgame/game/js/main.min_drop100.js', 'utf8');

// Search for calAllPower definition or references
let idx = 0;
const matches = [];
while ((idx = clientJs.indexOf('calAllPower', idx)) !== -1) {
  const start = Math.max(0, idx - 100);
  const end = Math.min(clientJs.length, idx + 200);
  matches.push(clientJs.slice(start, end));
  idx += 'calAllPower'.length;
  if (matches.length > 5) break;
}

console.log(`Found ${matches.length} matches for calAllPower:`);
matches.forEach((m, i) => console.log(`--- Match ${i+1} ---\n${m}\n`));

// Check calPowerByAttr
idx = 0;
const matches2 = [];
while ((idx = clientJs.indexOf('calPowerByAttr', idx)) !== -1) {
  const start = Math.max(0, idx - 100);
  const end = Math.min(clientJs.length, idx + 200);
  matches2.push(clientJs.slice(start, end));
  idx += 'calPowerByAttr'.length;
  if (matches2.length > 5) break;
}
console.log(`Found ${matches2.length} matches for calPowerByAttr:`);
matches2.forEach((m, i) => console.log(`--- Match ${i+1} ---\n${m}\n`));
'''
        cmd = f"node -e {shlex.quote(remote_script)}"
        out = run(ssh, cmd).strip()
        print(out)
    finally:
        ssh.close()

if __name__ == '__main__':
    main()
