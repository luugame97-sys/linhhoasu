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
const getAttrsIdx = clientJs.indexOf('m.getAttrs=function', idx);
if (getAttrsIdx !== -1 && getAttrsIdx - idx < 5000) {
  console.log('MountModel m.getAttrs:\n', clientJs.slice(getAttrsIdx, getAttrsIdx + 1200));
} else {
  console.log('getAttrs not near BGe.prototype');
}
'''
        cmd = f"node -e {shlex.quote(remote_script)}"
        out = run(ssh, cmd).strip()
        print(out)
    finally:
        ssh.close()

if __name__ == '__main__':
    main()
