import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

import datetime
import hashlib
import json
import os
import time
import paramiko

HOST = '103.116.105.154'
USER = 'root'
PASS = 'anhduc11'

LOCAL_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
LOCAL_PET = os.path.join(LOCAL_DIR, 'linhhoasu', 'lhs', 'newServer', 'src', 'handlers', 'pet.js')
LOCAL_BATTLE = os.path.join(LOCAL_DIR, 'linhhoasu', 'lhs', 'newServer', 'src', 'services', 'BattleService.js')

REMOTE_BASE = '/linhhoasu/lhs/newServer'
REMOTE_PET = f'{REMOTE_BASE}/src/handlers/pet.js'
REMOTE_BATTLE = f'{REMOTE_BASE}/src/services/BattleService.js'

def sha256_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()

def sha256_bytes(b):
    return hashlib.sha256(b).hexdigest()

def run():
    print(f"[{datetime.datetime.now()}] Connecting to {HOST}...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASS, timeout=15)
    sftp = ssh.open_sftp()

    # 1. Local file hashes
    local_pet_hash = sha256_file(LOCAL_PET)
    local_battle_hash = sha256_file(LOCAL_BATTLE)
    print(f"Local pet.js SHA:           {local_pet_hash}")
    print(f"Local BattleService.js SHA: {local_battle_hash}")

    # 2. Backup remote files
    timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
    backup_dir = f"/linhhoasu/_ai_workbench/backups/pet_wash_upgrade_{timestamp}"
    ssh.exec_command(f"mkdir -p {backup_dir}")
    print(f"Created remote backup dir: {backup_dir}")

    for rpath, fname in [(REMOTE_PET, 'pet.js'), (REMOTE_BATTLE, 'BattleService.js')]:
        bpath = f"{backup_dir}/{fname}"
        cmd = f"cp {rpath} {bpath}"
        stdin, stdout, stderr = ssh.exec_command(cmd)
        exit_code = stdout.channel.recv_exit_status()
        if exit_code != 0:
            print(f"Failed to backup {rpath}: {stderr.read().decode('utf-8', errors='replace')}")
            sys.exit(1)
        print(f"Backed up {rpath} -> {bpath}")

    # 3. Upload new files via SFTP
    print("Uploading local pet.js...")
    sftp.put(LOCAL_PET, REMOTE_PET)
    print("Uploading local BattleService.js...")
    sftp.put(LOCAL_BATTLE, REMOTE_BATTLE)

    # 4. Verify remote hashes
    with sftp.open(REMOTE_PET, 'rb') as f:
        remote_pet_hash = sha256_bytes(f.read())
    with sftp.open(REMOTE_BATTLE, 'rb') as f:
        remote_battle_hash = sha256_bytes(f.read())

    print(f"Remote pet.js SHA:           {remote_pet_hash}")
    print(f"Remote BattleService.js SHA: {remote_battle_hash}")

    if remote_pet_hash != local_pet_hash:
        print("ERROR: pet.js hash mismatch!")
        sys.exit(1)
    if remote_battle_hash != local_battle_hash:
        print("ERROR: BattleService.js hash mismatch!")
        sys.exit(1)
    print("Hashes verified successfully!")

    # 5. Remote syntax check
    print("Checking remote syntax...")
    for f in [REMOTE_PET, REMOTE_BATTLE]:
        cmd = f"node -c {f}"
        stdin, stdout, stderr = ssh.exec_command(cmd)
        exit_code = stdout.channel.recv_exit_status()
        if exit_code != 0:
            err = stderr.read().decode('utf-8', errors='replace')
            print(f"Syntax error in {f}: {err}")
            sys.exit(1)
    print("Remote syntax checks PASS!")

    # 6. Upload and run remote test suites
    print("Uploading and running remote test suites...")
    ssh.exec_command("mkdir -p /linhhoasu/_ai_workbench/temp")

    local_test_wash = os.path.join(LOCAL_DIR, '_ai_workbench', 'temp', 'test_pet_wash_upgrade_complete.js')
    local_test_combat = os.path.join(LOCAL_DIR, '_ai_workbench', 'temp', 'test_pet_combat_skills.js')
    local_test_replay = os.path.join(LOCAL_DIR, '_ai_workbench', 'temp', 'test_raid_replay_contract.js')

    remote_test_wash = "/linhhoasu/_ai_workbench/temp/test_pet_wash_upgrade_complete.js"
    remote_test_combat = "/linhhoasu/_ai_workbench/temp/test_pet_combat_skills.js"
    remote_test_replay = "/linhhoasu/_ai_workbench/temp/test_raid_replay_contract.js"

    sftp.put(local_test_wash, remote_test_wash)
    sftp.put(local_test_combat, remote_test_combat)
    sftp.put(local_test_replay, remote_test_replay)

    for script in [
        f"{REMOTE_BASE}/scripts/test-core-gameplay-contract.js",
        remote_test_wash,
        remote_test_combat,
        remote_test_replay,
    ]:
        stdin, stdout, stderr = ssh.exec_command(f"node {script}")
        out = stdout.read().decode('utf-8', errors='replace').strip()
        err = stderr.read().decode('utf-8', errors='replace').strip()
        exit_code = stdout.channel.recv_exit_status()
        print(f"Remote {os.path.basename(script)} (exit {exit_code}):\n  {out}")
        if exit_code != 0:
            print(f"Error: {err}")
            sys.exit(1)

    # 7. Rolling reload PM2 instances lhs-s1006 down to lhs-s1001
    print("Performing rolling reload of PM2 servers s1006 -> s1001...")
    services = ['lhs-s1006', 'lhs-s1005', 'lhs-s1004', 'lhs-s1003', 'lhs-s1002', 'lhs-s1001']
    for svc in services:
        stdin, stdout, stderr = ssh.exec_command(f"pm2 reload {svc}")
        exit_code = stdout.channel.recv_exit_status()
        out = stdout.read().decode('ascii', errors='replace')
        print(f"Reloaded {svc} (exit {exit_code})")
        time.sleep(1)

    # 8. Check PM2 status
    stdin, stdout, stderr = ssh.exec_command("pm2 jlist")
    jlist = json.loads(stdout.read().decode('utf-8'))
    print("\n--- PM2 Service Health ---")
    all_online = True
    for p in jlist:
        name = p.get('name')
        status = p.get('pm2_env', {}).get('status')
        restarts = p.get('pm2_env', {}).get('restart_time')
        print(f"  {name:12}: status={status} restarts={restarts}")
        if status != 'online':
            all_online = False

    sftp.close()
    ssh.close()

    if all_online:
        print("\nAll PM2 services are ONLINE and healthy!")
    else:
        print("\nWARNING: Some PM2 services are NOT online!")

if __name__ == '__main__':
    run()
