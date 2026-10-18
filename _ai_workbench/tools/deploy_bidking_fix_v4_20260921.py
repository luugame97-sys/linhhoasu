"""Deploy Bid King state/payload fix with narrow CAS and rollback backup."""
import hashlib, json, shlex, sys, time
from datetime import datetime, timezone
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from snapshot_web_multiserver_20260906 import connect, run

ROOT = Path(__file__).resolve().parents[2]
FILES = {
    '/linhhoasu/lhs/newServer/src/handlers/bid-king.js': ('linhhoasu/lhs/newServer/src/handlers/bid-king.js', '60ed21d844b1bafafa5f76919f4fade24e92ea519167e50b0a5bed9af054ef09'),
    '/linhhoasu/webgame/game/js/lhs-oldtrek-errors-v1.js': ('linhhoasu/webgame/game/js/lhs-oldtrek-errors-v1.js', '6e27c612f5c68e897d6242c382f2a4cbf3c0143b40b7f8bc9a93578d5410406f'),
    '/linhhoasu/webgame/game/index.html': ('linhhoasu/webgame/game/index.html', '9876cf33e92621d788687e4d42b43be518fd2bcee32a32991c9d57c6750db44d'),
}

def sha(data): return hashlib.sha256(data).hexdigest()

def main():
    stamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    backup = f'/linhhoasu/_ai_workbench/backups/bidking_fix_v4_{stamp}'
    report = {'at': datetime.now(timezone.utc).isoformat(), 'backup': backup, 'directPlayerWrites': 0, 'restarts': 0, 'files': {}}
    ssh = connect()
    try:
        with ssh.open_sftp() as sftp:
            before = {}
            for remote, (_, expected) in FILES.items():
                data = sftp.open(remote, 'rb').read()
                if sha(data) != expected: raise RuntimeError('CAS_DRIFT:' + remote)
                before[remote] = data
            run(ssh, 'mkdir ' + shlex.quote(backup))
            for remote, (local, _) in FILES.items():
                payload = (ROOT / local).read_bytes()
                saved = backup + '/' + remote.rsplit('/', 1)[-1]
                staged = remote + '.bidking-stage-' + stamp + ('.js' if remote.endswith('.js') else '.html')
                with sftp.open(saved, 'wb') as handle: handle.write(before[remote])
                with sftp.open(staged, 'wb') as handle: handle.write(payload)
                if sha(sftp.open(saved, 'rb').read()) != sha(before[remote]): raise RuntimeError('BACKUP_HASH_MISMATCH')
                if sha(sftp.open(staged, 'rb').read()) != sha(payload): raise RuntimeError('STAGE_HASH_MISMATCH')
                if remote.endswith('.js'): run(ssh, 'node --check ' + shlex.quote(staged))
                if sha(sftp.open(remote, 'rb').read()) != sha(before[remote]): raise RuntimeError('PRE_SWAP_CAS_DRIFT')
                run(ssh, 'chown --reference=' + shlex.quote(remote) + ' ' + shlex.quote(staged))
                run(ssh, 'chmod --reference=' + shlex.quote(remote) + ' ' + shlex.quote(staged))
                sftp.posix_rename(staged, remote)
                if sha(sftp.open(remote, 'rb').read()) != sha(payload): raise RuntimeError('LIVE_HASH_MISMATCH')
                report['files'][remote] = {'before': sha(before[remote]), 'after': sha(payload)}
        for name, port in [('lhs-s1001',8080),('lhs-s1002',8083),('lhs-s1003',8084),('lhs-s1004',8085),('lhs-s1005',8086)]:
            run(ssh, 'pm2 restart ' + name)
            report['restarts'] += 1
            ready = False
            for _ in range(10):
                code = run(ssh, f"curl -sS -o /dev/null -w '%{{http_code}}' --max-time 3 http://127.0.0.1:{port}/ready || true").strip()
                if code == '200': ready = True; break
                time.sleep(2)
            report.setdefault('readiness', {})[str(port)] = code
            if not ready: raise RuntimeError('READY_FAILED:' + name)
        addon = run(ssh, 'curl -fsS --max-time 10 http://127.0.0.1:81/js/lhs-oldtrek-errors-v1.js').encode()
        index = run(ssh, 'curl -fsS --max-time 10 http://127.0.0.1:81/').encode()
        report['servedAddonHash'] = sha(addon); report['servedIndexHash'] = sha(index)
        if sha(addon) != report['files']['/linhhoasu/webgame/game/js/lhs-oldtrek-errors-v1.js']['after']: raise RuntimeError('SERVED_ADDON_HASH_MISMATCH')
        if sha(index) != report['files']['/linhhoasu/webgame/game/index.html']['after']: raise RuntimeError('SERVED_INDEX_HASH_MISMATCH')
        report['status'] = 'DEPLOYED'
        print(json.dumps(report, ensure_ascii=False, indent=2), flush=True)
    finally:
        ssh.close()
        (ROOT / '_ai_workbench/temp/bidking_fix_v4_deploy_20260921.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')

if __name__ == '__main__': main()
