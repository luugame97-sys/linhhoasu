import getpass
import json
import paramiko

HOST = '103.116.105.154'
FILES = [
    '/linhhoasu/lhs/newServer/src/handlers/box.js',
    '/linhhoasu/lhs/newServer/src/handlers/item.js',
    '/linhhoasu/lhs/newServer/src/services/EquipService.js',
    '/linhhoasu/webgame/game/js/main.min_a6195824.js',
    '/linhhoasu/webgame/game/index.html',
]


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
        hashes, err = run(ssh, 'sha256sum -- ' + ' '.join(FILES))
        print(hashes, end='')
        if err.strip():
            print(err, end='')
        for port in (8080, 8083, 8084):
            out, _ = run(ssh, f"curl -sS -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{port}/ready")
            print(f'ready-{port}={out.strip()}')
        out, _ = run(ssh, "grep -oE '202[0-9_a-z-]+|autoEquipUpgrade|isSilentMode|autoDelegateEquip|Tự mặc[^\"<]*' /linhhoasu/webgame/game/js/main.min_a6195824.js | sort | uniq -c")
        print('markers:\n' + out)
        out, _ = run(ssh, "pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{for(const p of JSON.parse(s)){if(/^lhs-(s100[123]|real-bots)/.test(p.name)) console.log(p.name+\"|\"+p.pm2_env.status+\"|pid=\"+p.pid+\"|restart=\"+p.pm2_env.restart_time)}})'")
        print('processes:\n' + out)
    finally:
        ssh.close()


if __name__ == '__main__':
    main()
