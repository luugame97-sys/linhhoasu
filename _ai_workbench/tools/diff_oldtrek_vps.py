import sys
from pathlib import Path
sys.path.append(str(Path(__file__).resolve().parent))
from snapshot_web_multiserver_20260906 import connect, run

def main():
    ssh = connect()
    try:
        cmd = "diff -u /linhhoasu/_ai_workbench/backups/oldtrek_pass_fix_20260920_pre/src/handlers/old-trek.js /linhhoasu/lhs/newServer/src/handlers/old-trek.js || true"
        print("DIFF OLD-TREK.JS:")
        print(run(ssh, cmd))
    finally:
        ssh.close()

if __name__ == '__main__':
    main()
