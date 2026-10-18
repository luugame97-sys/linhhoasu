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
        cmd = """
        mysql -uroot -e "SHOW DATABASES;" 2>/dev/null || mysql -e "SHOW DATABASES;" 2>/dev/null || echo "NO_DIRECT_MYSQL"
        """
        print(run(ssh, cmd))
        
        # Check gm php database config
        cmd2 = "grep -rn 'password' /linhhoasu/webgame/gm/*.php /linhhoasu/webgame/gm/includes/*.php 2>/dev/null | head -10 || true"
        print(run(ssh, cmd2))
    finally:
        ssh.close()

if __name__ == '__main__':
    main()
