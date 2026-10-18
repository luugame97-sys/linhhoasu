import getpass

import paramiko


HOST = "103.116.105.154"


def run(ssh, command, timeout=120):
    _stdin, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    output = stdout.read().decode("utf-8", "replace")
    error = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError(error[-3000:] or output[-3000:])
    return output


def main():
    password = getpass.getpass("VPS password (not logged): ")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False, allow_agent=False, timeout=15)
    contract = "/linhhoasu/_ai_workbench/temp/verify_auto_delegate_contract.js"
    client_contract = "/linhhoasu/_ai_workbench/temp/verify_auto_delegate_client.js"
    local_contract = r"I:\Linhhoasu\server\server\_ai_workbench\tools\test_auto_delegate_contract.js"
    local_client_contract = r"I:\Linhhoasu\server\server\_ai_workbench\tools\test_client_auto_delegate_bundle.js"
    try:
        sftp = ssh.open_sftp()
        try:
            sftp.put(local_contract, contract)
            sftp.put(local_client_contract, client_contract)
        finally:
            sftp.close()
        print(run(ssh, f"APP_ROOT=/linhhoasu/lhs/newServer node {contract}").strip())
        print(run(ssh, f"node {client_contract} /linhhoasu/webgame/game/js/main.min_a6195824.js").strip())
        print(run(ssh, "node --check /linhhoasu/lhs/newServer/src/services/EquipService.js; node --check /linhhoasu/lhs/newServer/src/handlers/item.js; node --check /linhhoasu/webgame/game/js/main.min_a6195824.js; echo SYNTAX=PASS").strip())
        print(run(ssh, "cd /linhhoasu/lhs/newServer && npm run test:core-contract", timeout=120).strip())
        print("READY_HTTP=" + run(ssh, "curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/ready").strip())
        print("WS_9200=" + run(ssh, "ss -lnt | grep -q ':9200 ' && echo listening").strip())
        print(run(ssh, "pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{for(const p of JSON.parse(s)){if([\"lhs-s1001\",\"lhs-real-bots\",\"lhs-dist\",\"lhs-admin\"].includes(p.name))console.log(p.name+\"=\"+p.pm2_env.status+\",pid=\"+p.pid+\",restarts=\"+p.pm2_env.restart_time)}})' ").strip())
        print("MARKERS=" + run(ssh, "grep -o 'autoDelegateEquip=function\\|Tự mặc đồ mạnh, bán đồ yếu\\|autoDelegate:!!(U9.isOpen&&U9.autoConfig.enoughPower)' /linhhoasu/webgame/game/js/main.min_a6195824.js | sort -u | tr '\\n' ' '").strip())
        print("POST_RESTART_ERRORS=" + run(ssh, "tail -n 80 /root/.pm2/logs/lhs-s1001-error.log 2>/dev/null | grep -E 'SyntaxError|ReferenceError|TypeError|AutoDelegate' | tail -n 20 || true").strip())
        print("AUTO_DELEGATE_RUNTIME=" + run(ssh, "grep '\\[AutoDelegate\\]' /root/.pm2/logs/lhs-s1001-out.log 2>/dev/null | tail -n 20 || true").strip())
    finally:
        try:
            run(ssh, f"rm -f -- {contract} {client_contract}")
        except Exception:
            pass
        ssh.close()


if __name__ == "__main__":
    main()
