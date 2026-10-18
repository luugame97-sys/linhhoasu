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

let pos = 0;
while ((pos = clientJs.indexOf('initPower', pos)) !== -1) {
  const slice = clientJs.slice(Math.max(0, pos - 30), pos + 120);
  if (slice.includes('=function') || slice.includes('prototype')) {
    console.log('Definition match:\n', slice);
  }
  pos += 9;
}
'''
        cmd = f"node -e {shlex.quote(remote_script)}"
        out = run(ssh, cmd).strip()
        print(out)
    finally:
        ssh.close()

if __name__ == '__main__':
    main()
