import sys
from pathlib import Path
sys.path.append(str(Path(__file__).resolve().parent))
from snapshot_web_multiserver_20260906 import connect, run

def main():
    ssh = connect()
    try:
        cmd = "grep 'u_Wk_1001_770460_1788525948362' /root/.pm2/logs/lhs-s1001-out.log | grep -E 'tag=70' || true"
        out = run(ssh, cmd)
        print("=== Tag 70xx logs ===")
        print(out if out.strip() else "(No tag 70xx found in logs)")
    finally:
        ssh.close()

if __name__ == '__main__':
    main()
