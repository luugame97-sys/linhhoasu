from pathlib import Path
from datetime import datetime, timezone
import hashlib, json, shlex, paramiko

ROOT = Path(__file__).resolve().parents[1]
lines = (ROOT / 'VPS103.116.105.154.txt').read_text(encoding='utf-8').splitlines()
host, user, password = lines[0].strip(), lines[1].strip(), lines[2].strip()
srcdir = ROOT / 'temp' / 'box_runtime_sources_20260912'
files = {
    'src__handlers__account.js': '/linhhoasu/lhs/newServer/src/handlers/account.js',
    'src__handlers__box.js': '/linhhoasu/lhs/newServer/src/handlers/box.js',
    'src__handlers__compat.js': '/linhhoasu/lhs/newServer/src/handlers/compat.js',
}
expected = {
    '/linhhoasu/lhs/newServer/src/handlers/account.js': '2d0b9d45a28fb22f49b92354c2cbf7f93aa0c38e0eb64375b6f258161f8b5b52',
    '/linhhoasu/lhs/newServer/src/handlers/box.js': 'be7335e7b76221e1fc48343099ce3f082f27a846b1439c87757ddb68b1ad0090',
    '/linhhoasu/lhs/newServer/src/handlers/compat.js': 'ddd85335214581e71d1e306283dfc854b2c61de36017067ef08fbc13164f9e36',
}
stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
backup = f'/linhhoasu/_ai_workbench/backups/auto_delegate_tier_fix_20260912_{stamp}'
stage = f'/linhhoasu/_ai_workbench/temp/auto_delegate_tier_fix_20260912_{stamp}'

def run(ssh, cmd, check=True):
    _, out, err = ssh.exec_command(cmd, timeout=180)
    text = out.read().decode('utf-8', 'replace')
    error = err.read().decode('utf-8', 'replace')
    code = out.channel.recv_exit_status()
    if check and code:
        raise RuntimeError(f'{cmd}\n{error[-4000:]}\n{text[-4000:]}')
    return text, error, code

def main():
    ssh = paramiko.SSHClient(); ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(host, username=user, password=password, look_for_keys=False, allow_agent=False, timeout=20, banner_timeout=20, auth_timeout=20)
    manifest = {'backup': backup, 'stage': stage, 'expectedBaseline': expected, 'files': {}, 'restarts': {}}
    try:
        run(ssh, f'mkdir -p -- {shlex.quote(backup)} {shlex.quote(stage)}')
        for local, remote in files.items():
            got, _, _ = run(ssh, f'sha256sum -- {shlex.quote(remote)}')
            actual = got.split()[0]
            if actual != expected[remote]:
                raise RuntimeError(f'CAS mismatch {remote}: expected {expected[remote]} got {actual}')
            run(ssh, f'cp -p -- {shlex.quote(remote)} {shlex.quote(backup + "/" + Path(remote).name + ".before")}')
            manifest['files'][remote] = {'before': actual, 'backup': backup + '/' + Path(remote).name + '.before'}
        sftp = ssh.open_sftp()
        try:
            for local, remote in files.items():
                staged = stage + '/' + Path(remote).name
                sftp.put(str(srcdir / local), staged)
                sftp.chmod(staged, 0o640)
        finally: sftp.close()
        run(ssh, f"cd /linhhoasu/lhs/newServer && for f in {shlex.quote(stage+'/account.js')} {shlex.quote(stage+'/box.js')} {shlex.quote(stage+'/compat.js')}; do node --check \"$f\"; done")
        for local, remote in files.items():
            staged = stage + '/' + Path(remote).name
            run(ssh, f'mv -f -- {shlex.quote(staged)} {shlex.quote(remote)}')
        for remote in files.values():
            got, _, _ = run(ssh, f'sha256sum -- {shlex.quote(remote)}')
            manifest['files'][remote]['after'] = got.split()[0]
        for name in ['lhs-s1002', 'lhs-s1001']:
            before, _, _ = run(ssh, f'pm2 pid {shlex.quote(name)}')
            run(ssh, f'pm2 restart {shlex.quote(name)} --update-env')
            after, _, _ = run(ssh, f'pm2 pid {shlex.quote(name)}')
            manifest['restarts'][name] = {'before': before.strip(), 'after': after.strip()}
        ready1 = run(ssh, "curl -sS -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:8080/ready")[0].strip()
        ready2 = run(ssh, "curl -sS -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:8083/ready")[0].strip()
        manifest['ready'] = {'S1': ready1, 'S2': ready2}
        manifest['status'] = 'DEPLOYED' if ready1 == '200' and ready2 == '200' else 'FAILED_READY'
        run(ssh, f'rm -rf -- {shlex.quote(stage)}')
    finally: ssh.close()
    out = ROOT / 'temp' / f'auto_delegate_tier_fix_20260912_{stamp}.json'
    out.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'manifest': str(out), **manifest}, ensure_ascii=False, indent=2))
    if manifest.get('status') != 'DEPLOYED': raise SystemExit(2)

if __name__ == '__main__': main()
