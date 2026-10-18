import sys
from pathlib import Path
sys.path.append(str(Path(__file__).resolve().parent))
from snapshot_web_multiserver_20260906 import connect, run

def main():
    ssh = connect()
    try:
        raw = run(ssh, "pm2 jlist | node -e \"let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.stringify(JSON.parse(s).map(p=>({name:p.name,pm_id:p.pm_id,status:p.pm2_env.status,port:p.pm2_env.PORT,restarts:p.pm2_env.restart_time})))));\"")
        print(raw)
    finally:
        ssh.close()

if __name__ == '__main__':
    main()
