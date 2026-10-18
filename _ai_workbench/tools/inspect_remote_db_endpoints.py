from __future__ import annotations

import getpass
import paramiko


def main() -> None:
    password = getpass.getpass("VPS password (not logged): ")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect("103.116.105.154", username="root", password=password,
                look_for_keys=False, allow_agent=False, timeout=20)
    command = r"""
set -u
echo '===LISTENERS==='; ss -lntp | grep -E ':(27017|27018|27027|6379|8080|9200)\b' || true
echo '===MONGO_PROCESSES==='; ps -eo pid,ppid,user,stat,etime,args | grep -E '[m]ongod|[m]ongos' || true
echo '===CONFIG_URIS==='; for f in /linhhoasu/lhs/newServer/ecosystem.config.js /linhhoasu/lhs/newServer/.env /linhhoasu/lhs/newServer/src/db/mongo.js; do if [ -f "$f" ]; then echo "---$f"; grep -E 'MONGO_URI|MONGODB|mongo' "$f" | sed -E 's#(mongodb(\+srv)?://)[^/@]+@#\1[REDACTED]@#g'; fi; done
echo '===PM2_ENV_NONSECRET==='; pm2 jlist | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const p of JSON.parse(s)){if(p.name==="lhs-s1001"){const e=p.pm2_env&&p.pm2_env.env||{};const keys=["MONGO_URI","SERVER_ID","SERVER_NAME","REDIS_URL","NODE_ENV"];console.log(JSON.stringify(Object.fromEntries(keys.map(k=>[k,k==="MONGO_URI"?String(e[k]||"").replace(/(mongodb(?:\\+srv)?:\\/\\/)[^/@]+@/i,"$1[REDACTED]@"):e[k]]))))}}})'
echo '===CLIENTS==='; for port in 27017 27018 27027; do printf 'port=%s ' "$port"; (timeout 2 bash -c "</dev/tcp/127.0.0.1/$port" >/dev/null 2>&1 && echo open || echo closed); done
echo '===MONGO_BIN==='; command -v mongosh || true; command -v mongo || true
"""
    try:
        _, stdout, stderr = ssh.exec_command(command, timeout=60)
        print(stdout.read().decode("utf-8", "replace"), end="")
        error = stderr.read().decode("utf-8", "replace")
        if error:
            print("STDERR=" + error)
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
