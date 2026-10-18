import getpass
import paramiko

HOST = '103.116.105.154'


def run(ssh, command, timeout=60):
    _, out, err = ssh.exec_command(command, timeout=timeout)
    return out.read().decode('utf-8', 'replace'), err.read().decode('utf-8', 'replace')


def main():
    password = getpass.getpass('VPS password (not logged): ')
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username='root', password=password, look_for_keys=False,
                allow_agent=False, timeout=20, banner_timeout=20, auth_timeout=20)
    try:
        commands = [
            "for f in /linhhoasu/lhs/newServer/src/config/alchemyMaterialDrops.json /linhhoasu/lhs/newServer/src/services/AlchemyMaterialDropService.js /linhhoasu/lhs/newServer/src/handlers/box.js; do sha256sum -- \"$f\"; done",
            "printf 'policy='; cat /linhhoasu/lhs/newServer/src/config/alchemyMaterialDrops.json",
            "for p in 8080 8083 8084; do printf 'ready-%s=' \"$p\"; curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:$p/ready; printf '\\n'; done",
            "pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{for(const p of JSON.parse(s)){if(/^lhs-(s100[123]|real-bots)/.test(p.name)) console.log(p.name+\"|\"+p.pm2_env.status+\"|pid=\"+p.pid+\"|restart=\"+p.pm2_env.restart_time)}})'",
        ]
        for command in commands:
            out, err = run(ssh, command)
            print(out, end='')
            if err.strip():
                print(err, end='')
    finally:
        ssh.close()


if __name__ == '__main__':
    main()
