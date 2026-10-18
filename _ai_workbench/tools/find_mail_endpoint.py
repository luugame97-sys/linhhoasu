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
        cmd = "grep -rn 'function lhs_internal_mail_send' /linhhoasu/webgame/gm/ 2>/dev/null || grep -rn '/api/internal/mail' /linhhoasu/ 2>/dev/null || true"
        print(run(ssh, cmd))
    finally:
        ssh.close()

if __name__ == '__main__':
    main()
