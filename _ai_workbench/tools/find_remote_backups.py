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
        # Check remote backups for mongo or player Talo
        cmd = "find /linhhoasu -name '*talo*' -o -name '*mongo*' -o -name '*backup*' 2>/dev/null | grep -E '(bak|json|dump|archive|gz)' | head -n 40"
        out = run(ssh, cmd).strip()
        print("Remote backup files found:\n", out)
    finally:
        ssh.close()

if __name__ == '__main__':
    main()
