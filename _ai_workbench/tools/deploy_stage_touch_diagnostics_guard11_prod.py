from __future__ import annotations
import getpass, hashlib, os, posixpath, time
from datetime import datetime
import paramiko

HOST = '103.116.105.154'
LOCAL_ROOT = r'I:\Linhhoasu\server\server'
REMOTE_ROOT = '/linhhoasu'
STAMP = datetime.now().strftime('%Y%m%d_%H%M%S')
BACKUP = f'{REMOTE_ROOT}/_ai_workbench/backups/stage_touch_diagnostics_guard11_pre_{STAMP}'
TOKEN = '20260831_stage_touch_diagnostics_guard11'
FILES = {
    'webgame/game/js/main.min_a6195824.js': '638118bdaee3b0d718784d5bed5faa4b9610a3ef316f78beaaf38f576db5d1c4',
    'webgame/game/index.html': '865cc3e6c5cda4aceba97b7d63d1c1c4301b21e0df69f979a2478759643bc6e6',
}
PREVIOUS = {
    'webgame/game/js/main.min_a6195824.js': '40578b29dc23c8abf5c9672de46855f7c54ff76e032250bfb45054ce82d8fc76',
    'webgame/game/index.html': 'bd0e3a31c0f8fed1e1d007d81cad533f2dc59098e6b9bfd01337c85dc4cd65ed',
}

def local_path(rel):
    return os.path.join(LOCAL_ROOT, 'linhhoasu', *rel.split('/'))

def digest(data):
    return hashlib.sha256(data).hexdigest()

def run(ssh, cmd, timeout=120):
    _, out, err = ssh.exec_command(cmd, timeout=timeout)
    text = out.read().decode('utf-8', 'replace')
    error = err.read().decode('utf-8', 'replace')
    code = out.channel.recv_exit_status()
    if code:
        raise RuntimeError(error[-5000:] or text[-5000:])
    return text

def connect(password):
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    last = None
    for attempt in range(3):
        try:
            ssh.connect(HOST, username='root', password=password, look_for_keys=False,
                        allow_agent=False, timeout=30, banner_timeout=30, auth_timeout=30)
            return ssh
        except Exception as exc:
            last = exc
            if attempt < 2:
                time.sleep(3)
    raise last

def main():
    ssh = connect(getpass.getpass('VPS password (not logged): '))
    staged = []
    installed = False
    try:
        sftp = ssh.open_sftp()
        old = {}
        try:
            for rel, expected in PREVIOUS.items():
                remote = f'{REMOTE_ROOT}/{rel}'
                with sftp.open(remote, 'rb') as handle:
                    data = handle.read()
                actual = digest(data)
                if actual != expected:
                    raise RuntimeError(f'precondition failed {rel}: remote={actual} expected={expected}')
                old[rel] = data
            run(ssh, f'mkdir -p -- {BACKUP}')
            for rel, data in old.items():
                with sftp.open(posixpath.join(BACKUP, rel.replace('/', '__')), 'wb') as handle:
                    handle.write(data)
            for rel in FILES:
                remote = f'{REMOTE_ROOT}/{rel}'
                suffix = '.js' if rel.endswith('.js') else '.html'
                stage = f'{remote}.deploy-{STAMP}{suffix}'
                sftp.put(local_path(rel), stage)
                staged.append((rel, remote, stage))
        finally:
            sftp.close()

        main_stage = next(stage for rel, _, stage in staged if rel.endswith('.js'))
        index_stage = next(stage for rel, _, stage in staged if rel.endswith('.html'))
        run(ssh, f'node --check {main_stage}')
        run(ssh, f"grep -q '\[LHS\]\[TouchState\]' {main_stage}")
        run(ssh, f"grep -q 'TOUCH_BEGIN,this.onTouchBegin,this,!0' {main_stage}")
        run(ssh, f"grep -q '{TOKEN}' {index_stage}")
        for _, remote, stage in staged:
            run(ssh, f'mv -- {stage} {remote}; chmod 644 {remote}')
        installed = True
        served = run(ssh, f"curl -fsS 'http://127.0.0.1:81/index.html?v={TOKEN}'")
        if TOKEN not in served:
            raise RuntimeError('served token mismatch')
        served_hash = run(ssh, f"curl -fsS 'http://127.0.0.1:81/js/main.min_a6195824.js?v={TOKEN}' | sha256sum | awk '{{print $1}}'").strip()
        if served_hash != FILES['webgame/game/js/main.min_a6195824.js']:
            raise RuntimeError(f'served hash mismatch {served_hash}')
        print('BACKUP=' + BACKUP)
        print('SERVED_TOKEN=' + TOKEN)
        print('SERVED_MAIN_SHA256=' + served_hash)
        print('PM2_RESTART=none')
        print('REMOTE_HASHES_BEGIN')
        print(run(ssh, 'sha256sum ' + ' '.join(f'{REMOTE_ROOT}/{rel}' for rel in FILES)).strip())
        print('REMOTE_HASHES_END')
    except Exception:
        if installed:
            for rel in FILES:
                run(ssh, f"cp -p -- {BACKUP}/{rel.replace('/', '__')} {REMOTE_ROOT}/{rel}")
            print('ROLLBACK=restored')
        raise
    finally:
        for _, _, stage in staged:
            try:
                run(ssh, f'rm -f -- {stage}')
            except Exception:
                pass
        ssh.close()

if __name__ == '__main__':
    main()
