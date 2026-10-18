import hashlib, json, shlex
from pathlib import Path
from datetime import datetime, timezone
import paramiko

WB = Path(__file__).resolve().parents[1]
LOCAL = WB / 'temp/login_ui_20260927/assets/css/login.css'
REMOTE = '/linhhoasu/webgame/gm/assets/css/login.css'
EXPECTED_BEFORE = '2bcb25d00bc27171e9f14dab2c09d1c2d2ccfd3b98b27a51e035a09dbc350277'

def sha(path):
    h=hashlib.sha256(); h.update(path.read_bytes()); return h.hexdigest()

def run(ssh, cmd, timeout=30):
    _, out, err = ssh.exec_command(cmd, timeout=timeout)
    text=out.read().decode(errors='replace')
    code=out.channel.recv_exit_status()
    if code:
        raise RuntimeError(f'command failed ({code}): {cmd}: {err.read().decode(errors="replace")[:400]}')
    return text.strip()

def main():
    local_sha=sha(LOCAL)
    cred=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines()
    host=cred[0].strip(); user=cred[1].strip(); password=cred[2]
    stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    backup=f'/linhhoasu/_ai_workbench/backups/login_picker_upward_{stamp}'
    stage=f'/linhhoasu/_ai_workbench/temp/login_picker_upward_{stamp}'
    ssh=paramiko.SSHClient(); ssh.load_system_host_keys(); ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
    ssh.connect(host, port=22, username=user, password=password, look_for_keys=False, allow_agent=False, timeout=20)
    result={'timestamp':datetime.now(timezone.utc).isoformat(),'remote':REMOTE,'backup':backup,'stage':stage,'local_sha256':local_sha,'installed':False}
    try:
        before=run(ssh, 'sha256sum '+shlex.quote(REMOTE)).split()[0]
        result['before_sha256']=before
        if before != EXPECTED_BEFORE:
            raise RuntimeError(f'CAS drift: expected {EXPECTED_BEFORE}, got {before}')
        run(ssh, f'install -d -m 700 {shlex.quote(backup)} {shlex.quote(stage)}')
        run(ssh, f'cp -a {shlex.quote(REMOTE)} {shlex.quote(backup)}/login.css.before')
        sftp=ssh.open_sftp(); sftp.put(str(LOCAL), stage+'/login.css.new'); sftp.close()
        staged=run(ssh, 'sha256sum '+shlex.quote(stage+'/login.css.new')).split()[0]
        if staged != local_sha: raise RuntimeError('staged hash mismatch')
        run(ssh, f'install -o www -g www -m 644 {shlex.quote(stage+"/login.css.new")} {shlex.quote(REMOTE)}')
        after=run(ssh, 'sha256sum '+shlex.quote(REMOTE)).split()[0]
        if after != local_sha: raise RuntimeError(f'installed hash mismatch: {after}')
        result['after_sha256']=after
        result['remote_php_lint']=run(ssh, 'php -l /linhhoasu/webgame/gm/login.php')
        result['http_sha256_direct']=run(ssh, "curl -fsS http://127.0.0.1:88/assets/css/login.css | sha256sum | awk '{print $1}'")
        result['http_sha256_proxy_plain']=run(ssh, "curl -fsS http://127.0.0.1:81/web-panel/assets/css/login.css | sha256sum | awk '{print $1}'")
        mtime=run(ssh, 'stat -c %Y '+shlex.quote(REMOTE))
        result['http_sha256_proxy_query']=run(ssh, "curl -fsS 'http://127.0.0.1:81/web-panel/assets/css/login.css?v="+mtime+"' | sha256sum | awk '{print $1}'")
        result['proxy_cache_note']='plain proxy may retain the previous cache entry; query-string readback is authoritative'
        if result['http_sha256_direct'] != local_sha or result['http_sha256_proxy_query'] != local_sha:
            raise RuntimeError('HTTP hash mismatch')
        result['installed']=True
    except Exception as exc:
        result['error']=str(exc)
        if result.get('after_sha256') and not result.get('installed'):
            run(ssh, f'install -o www -g www -m 644 {shlex.quote(backup+"/login.css.before")} {shlex.quote(REMOTE)}')
            result['rolled_back']=run(ssh, 'sha256sum '+shlex.quote(REMOTE)).split()[0]
        raise
    finally:
        ssh.close()
        out=WB/'temp/login_ui_20260927/deploy_upward_readback.json'
        out.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        print(json.dumps({'evidence':str(out),'installed':result.get('installed'),'backup':backup,'after_sha256':result.get('after_sha256'),'error':result.get('error')}))

if __name__=='__main__': main()
