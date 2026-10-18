import getpass
import os
import paramiko

HOST = '103.116.105.154'
ROOT = '/linhhoasu/lhs/newServer'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(
    HOST,
    username='root',
    password=getpass.getpass('VPS password (not logged): '),
    look_for_keys=False,
    allow_agent=False,
    timeout=15,
)

def run(command):
    _, out, err = ssh.exec_command(command)
    text = out.read().decode('utf-8', 'replace')
    code = out.channel.recv_exit_status()
    if code:
        print('COMMAND_FAILED', code, err.read().decode('utf-8', 'replace')[-2000:])
    return text

try:
    print('REMOTE_WSSERVER_TIMING')
    print(run(
        "grep -n -E 'routeDoneAt|responseDoneAt|taskNormalizeMs|slow tag=|handler enter' "
        f'{ROOT}/src/net/WSServer.js'
    ))
    print('REMOTE_TAG_ROUTER')
    print(run(
        f"grep -RIn -E '2405|2403|2408|3001|1500|2402|2301|1200|2300|1000' "
        f"{ROOT}/src/router* {ROOT}/src/router 2>/dev/null | head -240"
    ))
    print('REMOTE_PROCESS')
    print(run("pm2 jlist | python3 -c \"import json,sys; d=json.load(sys.stdin); print(json.dumps([{k:p.get(k) for k in ('name','pid','monit')} for p in d if p.get('name') in ('lhs-s1001','lhs-dist','lhs-admin')], default=str))\""))
    remote_path = os.path.join(os.path.dirname(__file__), 'WSServer.remote.js')
    sf = ssh.open_sftp()
    try:
        with sf.open(f'{ROOT}/src/net/WSServer.js', 'rb') as src, open(remote_path, 'wb') as dst:
            dst.write(src.read())
    finally:
        sf.close()
    print('REMOTE_WSSERVER_SAVED', remote_path)
    normalized_path = remote_path.replace('.js', '.norm.js')
    with open(remote_path, 'rb') as src, open(normalized_path, 'wb') as dst:
        dst.write(src.read().replace(b'\r', b''))
    print('REMOTE_WSSERVER_NORMALIZED', normalized_path)
    farm_remote = os.path.join(os.path.dirname(__file__), 'farm.remote.js')
    sf = ssh.open_sftp()
    try:
        with sf.open(f'{ROOT}/src/handlers/farm.js', 'rb') as src, open(farm_remote, 'wb') as dst:
            dst.write(src.read())
    finally:
        sf.close()
    print('REMOTE_FARM_SAVED', farm_remote)
finally:
    ssh.close()
