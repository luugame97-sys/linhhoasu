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

const idx = clientJs.indexOf('BGe.prototype');
if (idx !== -1) {
  console.log('BGe.prototype:\n', clientJs.slice(idx, idx + 1000));
} else {
  // Find where BGe methods are defined
  const idx2 = clientJs.indexOf('"MountModel"');
  console.log('Near MountModel:\n', clientJs.slice(idx2 - 1000, idx2 + 100));
}
'''
        cmd = f"node -e {shlex.quote(remote_script)}"
        out = run(ssh, cmd).strip()
        print(out)
    finally:
        ssh.close()

if __name__ == '__main__':
    main()
