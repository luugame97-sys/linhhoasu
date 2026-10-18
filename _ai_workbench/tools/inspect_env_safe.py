import sys
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')
sys.dont_write_bytecode = True

WB = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WB / 'tools'))
sys.path.insert(0, str(WB / 'temp/pydeps'))
from snapshot_web_multiserver_20260906 import connect, run

def main():
    ssh = connect()
    try:
        cmd = "cat /linhhoasu/webgame/gm/.env 2>/dev/null || cat /linhhoasu/.env 2>/dev/null || true"
        output = run(ssh, cmd)
        # Hide actual password if any, just print keys
        for line in output.splitlines():
            if '=' in line:
                k, v = line.split('=', 1)
                if 'PASS' in k or 'SECRET' in k or 'KEY' in k:
                    print(k + '=******')
                else:
                    print(line)
            else:
                print(line)
    finally:
        ssh.close()

if __name__ == '__main__':
    main()
