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

const idx = clientJs.indexOf('klt.Instance.ShowGame()');
if (idx !== -1) {
  console.log('After ShowGame():\n', clientJs.slice(idx, idx + 800));
}

// Check what happens inside RoleModel.initData
const rInitIdx = clientJs.indexOf('.initData=function(t){this._roleInfo=t');
if (rInitIdx !== -1) {
  console.log('RoleModel.initData implementation:\n', clientJs.slice(rInitIdx, rInitIdx + 600));
} else {
  // search
  let pos = 0;
  while ((pos = clientJs.indexOf('_roleInfo=t', pos)) !== -1) {
    console.log('RoleModel _roleInfo=t:\n', clientJs.slice(Math.max(0, pos - 50), pos + 300));
    pos += 11;
  }
}
'''
        cmd = f"node -e {shlex.quote(remote_script)}"
        out = run(ssh, cmd).strip()
        print(out)
    finally:
        ssh.close()

if __name__ == '__main__':
    main()
