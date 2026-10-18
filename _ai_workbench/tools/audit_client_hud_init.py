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
const fs = require('fs');
const clientJs = fs.readFileSync('/linhhoasu/webgame/game/js/main.min_drop100.js', 'utf8');

// Let's find where eO.attrAddition is defined and what it does
let idx = clientJs.indexOf('attrAddition=function');
if (idx !== -1) {
  console.log('attrAddition definition:\n', clientJs.slice(idx, idx + 400));
}

// Let's find what happens in RoleModel.initData
idx = clientJs.indexOf('m.initData=function');
// Search inside RoleModel
let pos = 0;
while ((pos = clientJs.indexOf('RoleModel', pos)) !== -1) {
  const slice = clientJs.slice(pos, pos + 300);
  if (slice.includes('initData')) {
    console.log('RoleModel initData context:\n', slice);
  }
  pos += 9;
  if (pos > 100000) break;
}

// Let's find how HUD initializes and displays power on start
idx = clientJs.indexOf('MainTopGroup');
if (idx === -1) idx = clientJs.indexOf('topGroup');
console.log('Searching powerCell initialization in Main view:');
pos = 0;
while ((pos = clientJs.indexOf('.powerCell.data=', pos)) !== -1) {
  console.log('--- powerCell.data= ---');
  console.log(clientJs.slice(Math.max(0, pos - 100), pos + 150));
  pos += 16;
}
'''
        cmd = f"node -e {shlex.quote(remote_script)}"
        out = run(ssh, cmd).strip()
        print(out)
    finally:
        ssh.close()

if __name__ == '__main__':
    main()
