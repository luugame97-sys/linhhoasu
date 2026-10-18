import paramiko
import hashlib
import os

def sha256_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()

def main():
    local_js = r'i:\Linhhoasu\server\server\linhhoasu\webgame\game\js\lhs-login-clean-v1.js'
    local_index = r'i:\Linhhoasu\server\server\linhhoasu\webgame\game\index.html'

    assert os.path.exists(local_js), f'{local_js} missing'
    assert os.path.exists(local_index), f'{local_index} missing'

    local_js_sha = sha256_file(local_js)
    local_index_sha = sha256_file(local_index)

    print(f'[LOCAL] lhs-login-clean-v1.js SHA256: {local_js_sha}')
    print(f'[LOCAL] index.html SHA256: {local_index_sha}')

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect('103.116.105.154', port=22, username='root', password='anhduc11')

    # 1. Create remote backup directory
    backup_dir = '/linhhoasu/_ai_workbench/backups/login_clean_pre_20260920'
    ssh.exec_command(f'mkdir -p {backup_dir}')
    ssh.exec_command(f'cp /linhhoasu/webgame/game/index.html {backup_dir}/index.html.bak')
    print(f'[BACKUP] Remote backup created at {backup_dir}/index.html.bak')

    # 2. Upload files via SFTP
    sftp = ssh.open_sftp()
    remote_js = '/linhhoasu/webgame/game/js/lhs-login-clean-v1.js'
    remote_index = '/linhhoasu/webgame/game/index.html'

    print(f'[UPLOAD] Uploading {remote_js}...')
    sftp.put(local_js, remote_js)
    print(f'[UPLOAD] Uploading {remote_index}...')
    sftp.put(local_index, remote_index)
    sftp.close()

    # 3. Set permissions
    ssh.exec_command(f'chown www:www {remote_js} {remote_index} && chmod 755 {remote_js} {remote_index}')

    # 4. Verify remote hashes
    _, stdout, _ = ssh.exec_command(f'sha256sum {remote_js} {remote_index}')
    remote_sums = stdout.read().decode()
    print('[REMOTE SHA256]:\n' + remote_sums)

    assert local_js_sha in remote_sums, 'JS SHA256 mismatch!'
    assert local_index_sha in remote_sums, 'Index SHA256 mismatch!'
    print('[VERIFY] SHA256 matches 100%!')

    ssh.close()

if __name__ == '__main__':
    main()
