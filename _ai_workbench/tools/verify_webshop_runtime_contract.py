import getpass
import json

import paramiko


HOST = '103.116.105.154'

password = getpass.getpass('VPS password (not logged): ')
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username='root', password=password, look_for_keys=False, allow_agent=False, timeout=15)


def run(command):
    _, stdout, stderr = ssh.exec_command(command)
    text = stdout.read().decode('utf-8', 'replace')
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError(stderr.read().decode('utf-8', 'replace')[-4000:])
    return text


try:
    output = run('cd /linhhoasu/lhs/newServer && npm run test:core-contract')
    if '"result":"ok"' not in output:
        raise RuntimeError('core contract did not report ok')
    fresh_errors = run("pm2 logs lhs-s1001 --nostream --lines 120 2>/dev/null | grep -E 'Error|TypeError|Unhandled|MAIL_PLAYER_SAVE|RewardGrant' | tail -20 || true").strip()
    ready = run("curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/ready").strip()
    print(json.dumps({'result': 'ok', 'core_contract_tail': output.strip().splitlines()[-1], 'fresh_error_matches': fresh_errors.splitlines(), 'ready': ready}, ensure_ascii=False, indent=2))
finally:
    ssh.close()
