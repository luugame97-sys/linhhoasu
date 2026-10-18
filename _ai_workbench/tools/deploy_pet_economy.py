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
LOCAL_CONFIG = os.path.join(LOCAL_DIR, 'linhhoasu', 'lhs', 'newServer', 'src', 'services', 'ConfigService.js')
LOCAL_TEST = os.path.join(LOCAL_DIR, '_ai_workbench', 'temp', 'test_pet_economy_complete.js')

REMOTE_BASE = '/linhhoasu/lhs/newServer'
REMOTE_PET = f'{REMOTE_BASE}/src/handlers/pet.js'
REMOTE_CONFIG = f'{REMOTE_BASE}/src/services/ConfigService.js'
REMOTE_TEST = '/linhhoasu/_ai_workbench/temp/test_pet_economy_complete.js'

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
    local_config_hash = sha256_file(LOCAL_CONFIG)
    print(f"Local pet.js SHA:           {local_pet_hash}")
    print(f"Local ConfigService.js SHA: {local_config_hash}")

    # 2. Backup remote files
    timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
    backup_dir = f"/linhhoasu/_ai_workbench/backups/pet_economy_{timestamp}"
    ssh.exec_command(f"mkdir -p {backup_dir}")
    print(f"Created remote backup dir: {backup_dir}")

    for rpath, fname in [(REMOTE_PET, 'pet.js'), (REMOTE_CONFIG, 'ConfigService.js')]:
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
    print("Uploading local ConfigService.js...")
    sftp.put(LOCAL_CONFIG, REMOTE_CONFIG)
    print("Uploading local test_pet_economy_complete.js...")
    ssh.exec_command("mkdir -p /linhhoasu/_ai_workbench/temp")
    sftp.put(LOCAL_TEST, REMOTE_TEST)

    # 4. Verify remote hashes
    with sftp.open(REMOTE_PET, 'rb') as f:
        remote_pet_hash = sha256_bytes(f.read())
    with sftp.open(REMOTE_CONFIG, 'rb') as f:
        remote_config_hash = sha256_bytes(f.read())

    print(f"Remote pet.js SHA:           {remote_pet_hash}")
    print(f"Remote ConfigService.js SHA: {remote_config_hash}")

    if remote_pet_hash != local_pet_hash:
        print("ERROR: pet.js hash mismatch!")
        sys.exit(1)
    if remote_config_hash != local_config_hash:
        print("ERROR: ConfigService.js hash mismatch!")
        sys.exit(1)
    print("Hashes verified successfully!")

    # 5. Remote syntax check
    print("Checking remote syntax...")
    for f in [REMOTE_PET, REMOTE_CONFIG]:
        cmd = f"node -c {f}"
        stdin, stdout, stderr = ssh.exec_command(cmd)
        exit_code = stdout.channel.recv_exit_status()
        if exit_code != 0:
            err = stderr.read().decode('utf-8', errors='replace')
            print(f"Syntax error in {f}: {err}")
            sys.exit(1)
    print("Remote syntax checks PASS!")

    # 6. Run remote test suite
    print("Running remote test suite on VPS...")
    cmd = f"node {REMOTE_TEST}"
    stdin, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    exit_code = stdout.channel.recv_exit_status()
    print(out)
    if err:
        print("STDERR:", err)
    if exit_code != 0:
        print(f"ERROR: Remote test suite failed with code {exit_code}")
        sys.exit(1)
    print("Remote test suite PASS 100%!")

    # 7. Rolling reload PM2 S1006 -> S1001
    print("Performing rolling reload PM2 (S1006 -> S1001)...")
    for sid in range(1006, 1000, -1):
        proc_name = f"lhs-s{sid}"
        cmd = f"pm2 reload {proc_name} --update-env"
        print(f"Reloading {proc_name}...")
        stdin, stdout, stderr = ssh.exec_command(cmd)
        exit_code = stdout.channel.recv_exit_status()
        if exit_code != 0:
            print(f"Warning/Error reloading {proc_name}: {stderr.read().decode('utf-8', errors='replace')}")
        time.sleep(1.5)

    # 8. Check PM2 status
    print("Checking PM2 status...")
    stdin, stdout, stderr = ssh.exec_command("pm2 jlist")
    jlist_str = stdout.read().decode('utf-8', errors='replace')
    try:
        procs = json.loads(jlist_str)
        print("\n--- PM2 SERVICE STATUS ---")
        for p in procs:
            name = p.get('name')
            if 'lhs-s10' in name:
                status = p.get('pm2_env', {}).get('status')
                restarts = p.get('pm2_env', {}).get('restart_time')
                print(f"  {name:15} | Status: {status:10} | Restarts: {restarts}")
    except Exception as e:
        print(f"Failed to parse pm2 jlist: {e}")

    sftp.close()
    ssh.close()
    print("\nDEPLOYMENT & VERIFICATION COMPLETED SUCCESSFULLY!")

if __name__ == '__main__':
    run()
