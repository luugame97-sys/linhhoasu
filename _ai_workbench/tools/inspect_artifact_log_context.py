import getpass, time, paramiko, re
HOST="103.116.105.154"
def main():
    password=getpass.getpass("VPS password (not logged): ")
    c=paramiko.SSHClient(); c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    last=None
    for i in range(3):
        try:
            c.connect(HOST, username="root", password=password, look_for_keys=False, allow_agent=False, timeout=30, banner_timeout=30, auth_timeout=30); break
        except Exception as e:
            last=e
            if i<2: time.sleep(3)
    else: raise last
    try:
        cmd=r"line=$(grep -n '发送 tag=3500' /root/.pm2/logs/lhs-s1001-out.log | tail -n 1 | cut -d: -f1); start=$((line-14)); end=$((line+14)); sed -n \"${start},${end}p\" /root/.pm2/logs/lhs-s1001-out.log"
        _,o,e=c.exec_command(cmd)
        out=o.read().decode('utf-8','replace'); out=re.sub(r'\x1b\[[0-9;?]*[A-Za-z]','',out); print(out); print(e.read().decode('utf-8','replace'))
    finally: c.close()
if __name__ == '__main__': main()
