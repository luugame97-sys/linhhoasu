import sys
from pathlib import Path
sys.path.append(str(Path(__file__).resolve().parent))
from snapshot_web_multiserver_20260906 import connect, run

def main():
    ssh = connect()
    try:
        print("=== Non-bot log lines on s1001 ===")
        out = run(ssh, "grep -v 'lhs_real_bot' /root/.pm2/logs/lhs-s1001-out.log | tail -n 60")
        print(out)
        print("=== s1001 error log ===")
        err = run(ssh, "tail -n 40 /root/.pm2/logs/lhs-s1001-error.log")
        print(err)
    finally:
        ssh.close()

if __name__ == '__main__':
    main()
