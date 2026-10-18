import getpass, time, paramiko
HOST='103.116.105.154'
def run(s,c):
    _i,o,e=s.exec_command(c,timeout=60);out=o.read().decode('utf-8','replace');err=e.read().decode('utf-8','replace');code=o.channel.recv_exit_status()
    if code:raise RuntimeError(err or out)
    return out
def main():
    p=getpass.getpass('VPS password (not logged): ');s=paramiko.SSHClient();s.set_missing_host_key_policy(paramiko.AutoAddPolicy());last=None
    for i in range(3):
        try:s.connect(HOST,username='root',password=p,look_for_keys=False,allow_agent=False,timeout=30,banner_timeout=30,auth_timeout=30);break
        except Exception as x:
            last=x
            if i<2:time.sleep(3)
    else:raise last
    try:
        print(run(s,"sha256sum /linhhoasu/lhs/newServer/src/handlers/account.js /linhhoasu/lhs/newServer/src/handlers/spirit.js"))
        print(run(s,"curl -fsS http://127.0.0.1:8080/ready; echo; curl -fsS http://127.0.0.1:9200/health; echo"))
        print(run(s,"pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{for(const p of JSON.parse(s)){if([\"lhs-s1001\",\"lhs-real-bots\",\"lhs-dist\",\"lhs-admin\"].includes(p.name))console.log(p.name+\"=\"+p.pm2_env.status+\",pid=\"+p.pid)}})'"))
        print(run(s,"tail -n 300 /root/.pm2/logs/lhs-s1001-error.log | grep -E 'SyntaxError|ReferenceError|TypeError|Unhandled|FATAL|fatal' | tail -n 30 || true"))
    finally:s.close()
if __name__=='__main__':main()
