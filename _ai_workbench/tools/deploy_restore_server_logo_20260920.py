import paramiko
import hashlib
import shutil
import os

def sha256_file(p):
    h = hashlib.sha256()
    with open(p, 'rb') as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()

def main():
    base = r'i:\Linhhoasu\server\server'
    
    # Sources
    src_spine_logo = os.path.join(base, r'linhhoasu\webgame\game\update\resource\assets\spine\ui\loading_dzz\lang_cn\loading_dzz_1_ec107ed3_logo.png')
    src_login_logo = os.path.join(base, r'_ai_workbench\temp\backup_login_ld_logo.png')
    
    assert os.path.exists(src_spine_logo), f'Missing {src_spine_logo}'
    assert os.path.exists(src_login_logo), f'Missing {src_login_logo}'

    print('[1] Copying logo files locally...')
    # 1. Update loading_dzz_1_ec107ed3.png locally
    dst_spine_targets = [
        os.path.join(base, r'linhhoasu\webgame\game\update\resource\assets\spine\ui\loading_dzz\lang_cn\loading_dzz_1_ec107ed3.png'),
        os.path.join(base, r'linhhoasu\lhs\update\resource\assets\spine\ui\loading_dzz\lang_cn\loading_dzz_1_ec107ed3.png'),
        r'i:\Linhhoasu\server\resource\assets\spine\ui\loading_dzz\lang_cn\loading_dzz_1_ec107ed3.png'
    ]
    for dst in dst_spine_targets:
        if os.path.exists(os.path.dirname(dst)):
            shutil.copyfile(src_spine_logo, dst)
            print(f'  Copied to {dst}')

    # 2. Update login_ld_logo_1f2b15a1.png locally
    dst_login_targets = [
        os.path.join(base, r'linhhoasu\webgame\game\update\resource\assets\atlas_ui\9_login\liandong\lang_cn\login_ld_logo_1f2b15a1.png'),
        os.path.join(base, r'linhhoasu\lhs\update\resource\assets\atlas_ui\9_login\liandong\lang_cn\login_ld_logo_1f2b15a1.png'),
        r'i:\Linhhoasu\server\resource\assets\atlas_ui\9_login\liandong\lang_cn\login_ld_logo_1f2b15a1.png'
    ]
    for dst in dst_login_targets:
        if os.path.exists(os.path.dirname(dst)):
            shutil.copyfile(src_login_logo, dst)
            print(f'  Copied to {dst}')

    # 3. Update index.html locally with cache busting for logo
    index_path = os.path.join(base, r'linhhoasu\webgame\game\index.html')
    with open(index_path, 'r', encoding='utf-8') as f:
        html = f.read()

    new_version = "translationVersion = '20260920_lhs_logo_v1';"
    # Update translationVersion
    import re
    html = re.sub(r"translationVersion\s*=\s*['\"][^'\"]+['\"];", new_version, html, count=1)

    # Update regex to bust cache on logo files
    old_regex = r"(?:config_lang_c2fa8585|config_e5ac72c2|config_fashion_20260909|gameEui_18e11b8e|code_bdbbacd8)\.bin$"
    new_regex = r"(?:config_lang_c2fa8585|config_e5ac72c2|config_fashion_20260909|gameEui_18e11b8e|code_bdbbacd8)\.bin$|(?:login_ld_logo|loading_dzz_1)"
    if old_regex in html:
        html = html.replace(old_regex, new_regex, 1)
        print('  Updated cache busting regex in index.html')

    with open(index_path, 'w', encoding='utf-8') as f:
        f.write(html)
    print('  Updated index.html locally')

    # Connect to VPS
    print('[2] Deploying to VPS (103.116.105.154)...')
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect('103.116.105.154', port=22, username='root', password='anhduc11')

    sftp = ssh.open_sftp()
    
    # Upload loading_dzz_1_ec107ed3.png
    remote_spine = '/linhhoasu/webgame/game/update/resource/assets/spine/ui/loading_dzz/lang_cn/loading_dzz_1_ec107ed3.png'
    remote_spine_lhs = '/linhhoasu/lhs/update/resource/assets/spine/ui/loading_dzz/lang_cn/loading_dzz_1_ec107ed3.png'
    sftp.put(src_spine_logo, remote_spine)
    sftp.put(src_spine_logo, remote_spine_lhs)
    print(f'  Uploaded {remote_spine}')

    # Upload login_ld_logo_1f2b15a1.png
    remote_login = '/linhhoasu/webgame/game/update/resource/assets/atlas_ui/9_login/liandong/lang_cn/login_ld_logo_1f2b15a1.png'
    remote_login_lhs = '/linhhoasu/lhs/update/resource/assets/atlas_ui/9_login/liandong/lang_cn/login_ld_logo_1f2b15a1.png'
    sftp.put(src_login_logo, remote_login)
    sftp.put(src_login_logo, remote_login_lhs)
    print(f'  Uploaded {remote_login}')

    # Upload index.html
    remote_index = '/linhhoasu/webgame/game/index.html'
    sftp.put(index_path, remote_index)
    print(f'  Uploaded {remote_index}')

    # Restore backup KTX files
    restore_ktx_cmd = '''
    cp -f /tmp/backup_logo_inspect/linhhoasu/webgame/game/update/resource/assets/atlas_ui/9_login/liandong/lang_cn/login_ld_logo_astc_ffdc8dc4.ktx /linhhoasu/webgame/game/update/resource/assets/atlas_ui/9_login/liandong/lang_cn/
    cp -f /tmp/backup_logo_inspect/linhhoasu/webgame/game/update/resource/assets/atlas_ui/9_login/liandong/lang_cn/login_ld_logo_astc_ffdc8dc4.ktx /linhhoasu/lhs/update/resource/assets/atlas_ui/9_login/liandong/lang_cn/
    cp -f /tmp/backup_logo_inspect/linhhoasu/webgame/game/update/resource/assets/spine/ui/loading_dzz/lang_cn/loading_dzz_1_astc_9b0f8b8b.ktx /linhhoasu/webgame/game/update/resource/assets/spine/ui/loading_dzz/lang_cn/
    cp -f /tmp/backup_logo_inspect/linhhoasu/webgame/game/update/resource/assets/spine/ui/loading_dzz/lang_cn/loading_dzz_1_astc_9b0f8b8b.ktx /linhhoasu/lhs/update/resource/assets/spine/ui/loading_dzz/lang_cn/
    chown -R www:www /linhhoasu/webgame/game/update/resource/assets/spine/ui/loading_dzz/lang_cn/ /linhhoasu/webgame/game/update/resource/assets/atlas_ui/9_login/liandong/lang_cn/ /linhhoasu/webgame/game/index.html
    chmod -R 755 /linhhoasu/webgame/game/update/resource/assets/spine/ui/loading_dzz/lang_cn/ /linhhoasu/webgame/game/update/resource/assets/atlas_ui/9_login/liandong/lang_cn/ /linhhoasu/webgame/game/index.html
    '''
    stdin, stdout, stderr = ssh.exec_command(restore_ktx_cmd)
    exit_code = stdout.channel.recv_exit_status()
    err = stderr.read().decode()
    if exit_code != 0:
        print(f'Warning/Error restoring KTX: {err}')
    else:
        print('  Restored KTX and fixed permissions')

    # Verify remote sha256
    remote_ktx1 = '/linhhoasu/webgame/game/update/resource/assets/atlas_ui/9_login/liandong/lang_cn/login_ld_logo_astc_ffdc8dc4.ktx'
    remote_ktx2 = '/linhhoasu/webgame/game/update/resource/assets/spine/ui/loading_dzz/lang_cn/loading_dzz_1_astc_9b0f8b8b.ktx'
    stdin, stdout, stderr = ssh.exec_command(f'sha256sum {remote_spine} {remote_login} {remote_index} {remote_ktx1} {remote_ktx2}')
    res = stdout.read().decode()
    print('[3] Remote verification:\n' + res)

    spine_sha = sha256_file(src_spine_logo)
    login_sha = sha256_file(src_login_logo)
    index_sha = sha256_file(index_path)

    assert spine_sha in res, 'Spine SHA mismatch'
    assert login_sha in res, 'Login logo SHA mismatch'
    assert index_sha in res, 'Index SHA mismatch'
    assert '2f1e1483' in res, 'Login KTX SHA mismatch'
    assert '0a096e72' in res, 'Spine KTX SHA mismatch'
    print('ALL HASHES MATCH 100%!')

    # Cleanup temp folder on VPS
    ssh.exec_command('rm -rf /tmp/backup_logo_inspect')
    print('  Cleaned up /tmp/backup_logo_inspect on VPS')

    sftp.close()
    ssh.close()

if __name__ == '__main__':
    main()
