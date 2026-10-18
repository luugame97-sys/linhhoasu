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

function printPrototypeMethod(protoName, methodName) {
  const target = `(${protoName}.prototype).${methodName}=function`;
  const idx = clientJs.indexOf(target);
  if (idx !== -1) {
    console.log(`=== ${protoName}.${methodName} ===`);
    console.log(clientJs.slice(idx, idx + 600));
  } else {
    // Try alternate
    const target2 = `.${methodName}=function`;
    let pos = 0;
    while ((pos = clientJs.indexOf(target2, pos)) !== -1) {
      const slice = clientJs.slice(Math.max(0, pos - 50), pos + 250);
      if (slice.includes(protoName)) {
        console.log(`=== Alt ${protoName}.${methodName} ===`);
        console.log(slice);
        return;
      }
      pos += target2.length;
      if (pos > 5000000) break;
    }
  }
}

printPrototypeMethod('r5', 'getAttrs');
printPrototypeMethod('KV', 'getAttrs');
printPrototypeMethod('S5', 'getAttrs');
printPrototypeMethod('QV', 'getAttrs');
printPrototypeMethod('x5', 'getAttrs');
'''
        cmd = f"node -e {shlex.quote(remote_script)}"
        out = run(ssh, cmd).strip()
        print(out)
    finally:
        ssh.close()

if __name__ == '__main__':
    main()
