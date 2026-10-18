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

const idx = clientJs.indexOf('.prototype).initNetMsg=function(){this.regNetMsg(500,this.onPlayerInfo)');
if (idx !== -1) {
  console.log(clientJs.slice(idx, idx + 1500));
} else {
  // Find m.onPlayerInfo
  const idx2 = clientJs.indexOf('m.onPlayerInfo=function');
  if (idx2 !== -1) console.log(clientJs.slice(idx2, idx2 + 1500));
}
'''
        cmd = f"node -e {shlex.quote(remote_script)}"
        out = run(ssh, cmd).strip()
        print(out)
    finally:
        ssh.close()

if __name__ == '__main__':
    main()
