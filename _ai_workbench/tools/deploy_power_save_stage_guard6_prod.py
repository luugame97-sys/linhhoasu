"""Deploy PowerSaving stage-capture touch exit on top of served guard5."""
from __future__ import annotations
import getpass, hashlib, os, posixpath, time
from datetime import datetime
import paramiko

HOST='103.116.105.154'; LOCAL_ROOT=r'I:\Linhhoasu\server\server'; REMOTE_ROOT='/linhhoasu'
STAMP=datetime.now().strftime('%Y%m%d_%H%M%S'); BACKUP=f'{REMOTE_ROOT}/_ai_workbench/backups/power_save_stage_guard6_pre_{STAMP}'
TOKEN='20260831_power_save_stage_guard6'
FILES={
 'webgame/game/js/main.min_a6195824.js':'9ca9ac2b16ff46d4bc0443db126e0e9d9eb56141adc4e5fc8be9b7342ed9e734',
 'webgame/game/index.html':'a67ad1ee9ffe6f2fb8f26ccd750367ba7cac4b5ced7b81448592bc0a88dcad54',
}
def local_path(rel): return os.path.join(LOCAL_ROOT,'linhhoasu',*rel.split('/'))
def digest(data): return hashlib.sha256(data).hexdigest()
def run(ssh,cmd,timeout=120):
    _i,o,e=ssh.exec_command(cmd,timeout=timeout); out=o.read().decode('utf-8','replace'); err=e.read().decode('utf-8','replace'); code=o.channel.recv_exit_status()
    if code: raise RuntimeError(err[-5000:] or out[-5000:])
    return out
def connect(password):
    ssh=paramiko.SSHClient();ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy());last=None
    for i in range(3):
        try: ssh.connect(HOST,username='root',password=password,look_for_keys=False,allow_agent=False,timeout=30,banner_timeout=30,auth_timeout=30);return ssh
        except Exception as e:
            last=e
            if i<2:time.sleep(3)
    raise last
def main():
    ssh=connect(getpass.getpass('VPS password (not logged): ')); stages=[]; installed=False
    try:
        sftp=ssh.open_sftp()
        try:
            originals={}
            for rel,expected in FILES.items():
                remote=f'{REMOTE_ROOT}/{rel}'
                with sftp.open(remote,'rb') as stream: payload=stream.read()
                actual=digest(payload)
                if actual!=expected: raise RuntimeError(f'precondition failed {rel}: remote={actual} expected={expected}')
                originals[rel]=payload
            run(ssh,f'mkdir -p -- {BACKUP}')
            for rel,payload in originals.items():
                with sftp.open(posixpath.join(BACKUP,rel.replace('/','__')),'wb') as stream:stream.write(payload)
            for rel in FILES:
                remote=f'{REMOTE_ROOT}/{rel}';suffix='.js' if rel.endswith('.js') else '.html';stage=f'{remote}.deploy-{STAMP}{suffix}'
                sftp.put(local_path(rel),stage);stages.append((rel,remote,stage))
        finally:sftp.close()
        main_stage=next(s for rel,_r,s in stages if rel.endswith('.js'));index_stage=next(s for rel,_r,s in stages if rel.endswith('.html'))
        run(ssh,f'node --check {main_stage}');run(ssh,f"grep -q '_lhsPowerSaveClose' {main_stage}");run(ssh,f"grep -q 'this.stage&&this.stage.addEventListener' {main_stage}");run(ssh,f"grep -q '{TOKEN}' {index_stage}")
        for _rel,remote,stage in stages:run(ssh,f'mv -- {stage} {remote}; chmod 644 {remote}')
        installed=True
        served=run(ssh,f"curl -fsS 'http://127.0.0.1:81/index.html?v={TOKEN}'")
        if TOKEN not in served:raise RuntimeError('served index token mismatch')
        expected_main=digest(open(local_path('webgame/game/js/main.min_a6195824.js'),'rb').read())
        served_main=run(ssh,f"curl -fsS 'http://127.0.0.1:81/js/main.min_a6195824.js?v={TOKEN}' | sha256sum | awk '{{print $1}}'").strip()
        if served_main!=expected_main:raise RuntimeError(f'served main mismatch {served_main} != {expected_main}')
        print('BACKUP='+BACKUP);print('SERVED_TOKEN='+TOKEN);print('SERVED_MAIN_SHA256='+served_main);print('PM2_RESTART=none')
        print('REMOTE_HASHES_BEGIN');print(run(ssh,'sha256sum '+' '.join(f'{REMOTE_ROOT}/{rel}' for rel in FILES)).strip());print('REMOTE_HASHES_END')
    except Exception:
        if installed:
            for rel in FILES:run(ssh,f"cp -p -- {BACKUP}/{rel.replace('/', '__')} {REMOTE_ROOT}/{rel}")
            print('ROLLBACK=restored static files')
        raise
    finally:
        for _rel,_remote,stage in stages:
            try:run(ssh,f'rm -f -- {stage}')
            except Exception:pass
        ssh.close()
if __name__=='__main__':main()
