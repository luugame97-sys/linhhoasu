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

const idx = clientJs.indexOf('.initPower=function');
if (idx !== -1) {
  console.log(clientJs.slice(idx, idx + 500));
} else {
  let pos = 0;
  while ((pos = clientJs.indexOf('initPower', pos)) !== -1) {
    console.log(clientJs.slice(Math.max(0, pos - 50), pos + 150));
    pos += 10;
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
