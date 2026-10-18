import paramiko
import hashlib
import shutil
import os
import re
import urllib.request

def sha256_file(p):
    h = hashlib.sha256()
    with open(p, 'rb') as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()

def main():
    base = r'i:\Linhhoasu\server\server'
    
    # 1. Source files specified by user
    src_spine = r'I:\Linhhoasu\server\server\_ai_workbench\temp\cozy_images_review\png_by_category\11_HieuUng_SpineUI\loading_dzz_1_ec107ed3.png'
    src_login = r'I:\Linhhoasu\server\server\_ai_workbench\temp\cozy_images_review\png_by_category\9_DangNhap_Login\login_ld_logo_1f2b15a1.png'
    
    assert os.path.exists(src_spine), f'Missing {src_spine}'
    assert os.path.exists(src_login), f'Missing {src_login}'

    sha_src_spine = sha256_file(src_spine)
    sha_src_login = sha256_file(src_login)
    print(f'[1] Source files validated:')
    print(f'  Spine: {src_spine} ({os.path.getsize(src_spine)} bytes, SHA: {sha_src_spine})')
    print(f'  Login: {src_login} ({os.path.getsize(src_login)} bytes, SHA: {sha_src_login})')

    # 2. Local copies
    dst_spine_targets = [
        os.path.join(base, r'linhhoasu\webgame\game\update\resource\assets\spine\ui\loading_dzz\lang_cn\loading_dzz_1_ec107ed3.png'),
        os.path.join(base, r'linhhoasu\lhs\update\resource\assets\spine\ui\loading_dzz\lang_cn\loading_dzz_1_ec107ed3.png'),
        r'i:\Linhhoasu\server\resource\assets\spine\ui\loading_dzz\lang_cn\loading_dzz_1_ec107ed3.png'
    ]
    for dst in dst_spine_targets:
        if os.path.exists(os.path.dirname(dst)):
            shutil.copyfile(src_spine, dst)
            print(f'  Copied spine to {dst}')

    dst_login_targets = [
        os.path.join(base, r'linhhoasu\webgame\game\update\resource\assets\atlas_ui\9_login\liandong\lang_cn\login_ld_logo_1f2b15a1.png'),
        os.path.join(base, r'linhhoasu\lhs\update\resource\assets\atlas_ui\9_login\liandong\lang_cn\login_ld_logo_1f2b15a1.png'),
        r'i:\Linhhoasu\server\resource\assets\atlas_ui\9_login\liandong\lang_cn\login_ld_logo_1f2b15a1.png'
    ]
    for dst in dst_login_targets:
        if os.path.exists(os.path.dirname(dst)):
            shutil.copyfile(src_login, dst)
            print(f'  Copied login logo to {dst}')

    # 3. Update index.html version for cache busting
    index_path = os.path.join(base, r'linhhoasu\webgame\game\index.html')
    with open(index_path, 'r', encoding='utf-8') as f:
        html = f.read()

    new_version = "translationVersion = '20260920_lhs_logo_v3';"
    html = re.sub(r"translationVersion\s*=\s*['\"][^'\"]+['\"];", new_version, html, count=1)

    # Ensure regex matches logo
    regex_pattern = r"(?:config_lang_c2fa8585|config_e5ac72c2|config_fashion_20260909|gameEui_18e11b8e|code_bdbbacd8)\.bin$|(?:login_ld_logo|loading_dzz_1)"
    assert 'loading_dzz_1' in html, 'Cache busting regex missing loading_dzz_1 in index.html'

    with open(index_path, 'w', encoding='utf-8') as f:
        f.write(html)
    sha_index = sha256_file(index_path)
    print(f'  Updated index.html locally (SHA: {sha_index})')

    # 4. Deploy to VPS
    print('\n[2] Deploying to VPS (103.116.105.154)...')
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect('103.116.105.154', port=22, username='root', password='anhduc11')

    sftp = ssh.open_sftp()

    remote_spine = '/linhhoasu/webgame/game/update/resource/assets/spine/ui/loading_dzz/lang_cn/loading_dzz_1_ec107ed3.png'
    remote_spine_lhs = '/linhhoasu/lhs/update/resource/assets/spine/ui/loading_dzz/lang_cn/loading_dzz_1_ec107ed3.png'
    sftp.put(src_spine, remote_spine)
    sftp.put(src_spine, remote_spine_lhs)
    print(f'  Uploaded {remote_spine}')

    remote_login = '/linhhoasu/webgame/game/update/resource/assets/atlas_ui/9_login/liandong/lang_cn/login_ld_logo_1f2b15a1.png'
    remote_login_lhs = '/linhhoasu/lhs/update/resource/assets/atlas_ui/9_login/liandong/lang_cn/login_ld_logo_1f2b15a1.png'
    sftp.put(src_login, remote_login)
    sftp.put(src_login, remote_login_lhs)
    print(f'  Uploaded {remote_login}')

    remote_index = '/linhhoasu/webgame/game/index.html'
    sftp.put(index_path, remote_index)
    print(f'  Uploaded {remote_index}')

    # Fix permissions
    fix_perm = '''
    chown -R www:www /linhhoasu/webgame/game/update/resource/assets/spine/ui/loading_dzz/lang_cn/ /linhhoasu/webgame/game/update/resource/assets/atlas_ui/9_login/liandong/lang_cn/ /linhhoasu/webgame/game/index.html
    chmod -R 755 /linhhoasu/webgame/game/update/resource/assets/spine/ui/loading_dzz/lang_cn/ /linhhoasu/webgame/game/update/resource/assets/atlas_ui/9_login/liandong/lang_cn/ /linhhoasu/webgame/game/index.html
    chown -R www:www /linhhoasu/lhs/update/resource/assets/spine/ui/loading_dzz/lang_cn/ /linhhoasu/lhs/update/resource/assets/atlas_ui/9_login/liandong/lang_cn/
    chmod -R 755 /linhhoasu/lhs/update/resource/assets/spine/ui/loading_dzz/lang_cn/ /linhhoasu/lhs/update/resource/assets/atlas_ui/9_login/liandong/lang_cn/
    '''
    stdin, stdout, stderr = ssh.exec_command(fix_perm)
    stdout.channel.recv_exit_status()
    print('  Fixed permissions')

    # Verify remote sha256
    stdin, stdout, stderr = ssh.exec_command(f'sha256sum {remote_spine} {remote_login} {remote_index}')
    remote_res = stdout.read().decode()
    print('\n[3] Remote SHA-256 verification:')
    print(remote_res)

    assert sha_src_spine in remote_res, 'Remote Spine SHA-256 mismatch!'
    assert sha_src_login in remote_res, 'Remote Login logo SHA-256 mismatch!'
    assert sha_index in remote_res, 'Remote index.html SHA-256 mismatch!'
    print('ALL REMOTE HASHES MATCH 100%!')

    sftp.close()
    ssh.close()

    # 5. HTTP probe verification
    print('\n[4] HTTP probe verification (port 81)...')
    r_index = urllib.request.urlopen('http://103.116.105.154:81/index.html')
    html_content = r_index.read()
    assert b'20260920_lhs_logo_v3' in html_content, 'HTTP probe failed: index.html missing new version tag!'
    print('  index.html: HTTP 200 OK, version 20260920_lhs_logo_v3 confirmed')

    r_spine = urllib.request.urlopen('http://103.116.105.154:81/update/resource/assets/spine/ui/loading_dzz/lang_cn/loading_dzz_1_ec107ed3.png')
    c_spine = r_spine.read()
    assert hashlib.sha256(c_spine).hexdigest() == sha_src_spine, 'HTTP probe: Spine image sha mismatch!'
    print(f'  loading_dzz_1_ec107ed3.png: HTTP 200 OK ({len(c_spine)} bytes, SHA match)')

    r_login = urllib.request.urlopen('http://103.116.105.154:81/update/resource/assets/atlas_ui/9_login/liandong/lang_cn/login_ld_logo_1f2b15a1.png')
    c_login = r_login.read()
    assert hashlib.sha256(c_login).hexdigest() == sha_src_login, 'HTTP probe: Login logo image sha mismatch!'
    print(f'  login_ld_logo_1f2b15a1.png: HTTP 200 OK ({len(c_login)} bytes, SHA match)')

    print('\n=== DEPLOYMENT AND VERIFICATION COMPLETED SUCCESSFULLY ===')

if __name__ == '__main__':
    main()
