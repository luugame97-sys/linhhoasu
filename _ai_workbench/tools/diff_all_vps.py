import sys
from pathlib import Path
sys.path.append(str(Path(__file__).resolve().parent))
from snapshot_web_multiserver_20260906 import connect, run

FILES = [
    'src/services/RechargeRewardResolver.js',
    'src/services/RechargeBenefitService.js',
    'src/handlers/compat.js',
    'src/handlers/recharge.js',
]

def main():
    ssh = connect()
    try:
        for f in FILES:
            cmd = f"diff -u /linhhoasu/_ai_workbench/backups/oldtrek_pass_fix_20260920_pre/{f} /linhhoasu/lhs/newServer/{f} || true"
            print(f"=== DIFF {f} ===")
            print(run(ssh, cmd))
    finally:
        ssh.close()

if __name__ == '__main__':
    main()
