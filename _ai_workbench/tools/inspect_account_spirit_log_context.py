import getpass
import re
import time
import paramiko

HOST = "103.116.105.154"
USER_ID = "u_Wk_1001_038564_1788003398152"

def run(ssh, cmd):
    _i,o,e=ssh.exec_command(cmd,timeout=60);out=o.read().decode('utf-8','replace');err=e.read().decode('utf-8','replace');code=o.channel.recv_exit_status()
    if code:raise RuntimeError(err or out)
    return re.sub(r'\x1b\[[0-9;?]*[A-Za-z]','',out)

def main():
    password=getpass.getpass("VPS password (not logged): ")
    ssh=paramiko.SSHClient();ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy());last=None
    for i in range(3):
        try:ssh.connect(HOST,username='root',password=password,look_for_keys=False,allow_agent=False,timeout=30,banner_timeout=30,auth_timeout=30);break
        except Exception as exc:
            last=exc
            if i<2:time.sleep(3)
    else:raise last
    try:
        log='/root/.pm2/logs/lhs-s1001-out.log'
        cmd=f'''line=$(grep -n '\\[Spirit3600\\] user={USER_ID}' {log} | tail -n 1 | cut -d: -f1); if [ -n "$line" ]; then start=$((line-20)); end=$((line+45)); sed -n "${{start}},${{end}}p" {log}; fi'''
        print(run(ssh,cmd))
        print('=== LATEST USER EVENTS ===')
        print(run(ssh, f"grep '{USER_ID}' {log} | tail -n 100 || true"))
    finally:ssh.close()
if __name__=='__main__':main()
