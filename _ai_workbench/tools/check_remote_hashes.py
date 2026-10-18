import shlex
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).resolve().parent))
from snapshot_web_multiserver_20260906 import connect, run

APP = '/linhhoasu/lhs/newServer'
FILES = [
    'src/handlers/old-trek.js',
    'src/services/RechargeRewardResolver.js',
    'src/services/RechargeBenefitService.js',
    'src/handlers/compat.js',
    'src/handlers/recharge.js',
]

def main():
    ssh = connect()
    try:
        for f in FILES:
            path = APP + '/' + f
            out = run(ssh, f"sha256sum {shlex.quote(path)}").strip()
            print(out)
    finally:
        ssh.close()

if __name__ == '__main__':
    main()
