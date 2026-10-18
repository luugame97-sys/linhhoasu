"""CAS deploy cultivation_2000_v2 with selected backup and rolling readiness."""
import hashlib, json, shlex, time
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect, run

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / 'linhhoasu'
REMOTE = '/linhhoasu'
BACKUP = '/linhhoasu/_ai_workbench/backups/role_level2000_20260922'
STAGE = '/linhhoasu/_ai_workbench/temp/role_level2000_20260922'
FILES = [
    'lhs/newServer/src/services/ConfigService.js',
    'lhs/newServer/src/handlers/upgrade.js',
    'lhs/newServer/src/handlers/playerPayload.js',
    'lhs/newServer/src/services/PlayerService.js',
    'lhs/newServer/ecosystem.config.js',
    'webgame/game/index.html',
    'lhs/newServer/src/config/roleLevel2000.js',
    'lhs/newServer/src/services/CultivationProgressionService.js',
    'webgame/game/js/lhs-role-level2000-data-v1.js',
    'webgame/game/js/lhs-role-level2000-v1.js',
]
BASE = {
    'lhs/newServer/src/services/ConfigService.js': 'c494f73e8d291876c24913ace63c0fd4453c6be1c12fbbdb45dc3a26e30bc242',
    'lhs/newServer/src/handlers/upgrade.js': 'd2d7156f519e922bd0a29af898e523ab5620692e5e767655bd748573028fb866',
    'lhs/newServer/src/handlers/playerPayload.js': 'b1644886d4b8f5b1988ca6be7f9ebaac1f294c5ad8163045b2cc545a20d0866f',
    'lhs/newServer/src/services/PlayerService.js': '08cbef51f43e27dd03dac8670501f200ea059d8d1b2aa308a63548c5e8347e87',
    'lhs/newServer/ecosystem.config.js': '0a319067870fe677db9c3d6829e28bbd2d08858636e2078a0f1ad0cf4abd3cf8',
    'webgame/game/index.html': '075abb85287d2ea8d9c4475687831191cae93aa4dbde1890321186c17a9341bf',
    'lhs/newServer/src/config/roleLevel2000.js': '',
    'lhs/newServer/src/services/CultivationProgressionService.js': '',
    'webgame/game/js/lhs-role-level2000-data-v1.js': '',
    'webgame/game/js/lhs-role-level2000-v1.js': '',
}
NODES = [('lhs-s1002', 8083), ('lhs-s1001', 8080), ('lhs-s1003', 8084), ('lhs-s1004', 8085), ('lhs-s1005', 8086)]
def sha(value): return hashlib.sha256(value).hexdigest()
def ready(ssh, port):
    return run(ssh, f"for i in $(seq 1 90);do c=$(curl -fsS -o /dev/null -w '%{{http_code}}' --max-time 5 http://127.0.0.1:{port}/ready||true);[ \"$c\" = 200 ]&&echo 200&&exit 0;sleep 1;done;exit 1").strip()
def main():
    local = {rel: (APP / rel).read_bytes() for rel in FILES}
    assert b'ROLE_LEVEL_2000_ENABLED' in local['lhs/newServer/ecosystem.config.js']
    assert b'cultivation_2000_v2' in local['lhs/newServer/src/config/roleLevel2000.js']
    assert b'lhs-role-level2000-data-v1' in local['webgame/game/index.html']
    ssh = connect(); before = {}; published = []; touched = []
    try:
        with ssh.open_sftp() as sf:
            run(ssh, 'install -d -m 700 ' + shlex.quote(BACKUP)); run(ssh, 'install -d -m 700 ' + shlex.quote(STAGE))
            for rel in FILES:
                remote = REMOTE + '/' + rel
                try: old = sf.open(remote, 'rb').read()
                except FileNotFoundError: old = b''
                before[rel] = old
                bp = BACKUP + '/' + rel.replace('/', '__') + '.before'
                try: saved = sf.open(bp, 'rb').read()
                except FileNotFoundError:
                    with sf.open(bp, 'wb') as f: f.write(old)
                    sf.chmod(bp, 0o600)
                else:
                    if saved != old: raise RuntimeError('BACKUP_DRIFT:' + rel)
                if BASE[rel] and sha(old) != BASE[rel]: raise RuntimeError('REMOTE_CAS_DRIFT:' + rel + ':' + sha(old))
                staged = STAGE + '/' + str(int(time.time())) + '/' + rel
                run(ssh, 'install -d -m 700 ' + shlex.quote(staged.rsplit('/', 1)[0]))
                with sf.open(staged, 'wb') as f: f.write(local[rel])
                sf.chmod(staged, 0o644 if rel.startswith('webgame/') else 0o755)
                if rel.endswith('.js'): run(ssh, 'node --check ' + shlex.quote(staged))
                sf.posix_rename(staged, remote); published.append(rel)
        for name, port in NODES:
            run(ssh, 'pm2 restart ' + name + ' --update-env'); touched.append(name)
            if ready(ssh, port) != '200': raise RuntimeError('READY_FAILED:' + name)
        result = {'result': 'DEPLOYED_AND_READY', 'at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'productionWrites': 0, 'backup': BACKUP, 'restartOrder': touched, 'readiness': {str(p): run(ssh, f'curl -fsS http://127.0.0.1:{p}/ready').strip() for _, p in NODES}, 'files': {r: {'before': sha(before[r]), 'after': sha(local[r])} for r in FILES}}
        out = ROOT / '_ai_workbench/temp/role_level2000_20260922/release.json'; out.parent.mkdir(parents=True, exist_ok=True); out.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf8'); print(json.dumps(result, ensure_ascii=False, indent=2))
    except Exception:
        try:
            with ssh.open_sftp() as sf:
                for rel in published:
                    tmp = STAGE + '/rollback_' + str(int(time.time())) + '/' + rel; run(ssh, 'install -d -m 700 ' + shlex.quote(tmp.rsplit('/', 1)[0]))
                    with sf.open(tmp, 'wb') as f: f.write(before[rel])
                    sf.chmod(tmp, 0o644 if rel.startswith('webgame/') else 0o755); sf.posix_rename(tmp, REMOTE + '/' + rel)
            for name, port in NODES:
                if name in touched: run(ssh, 'pm2 restart ' + name + ' --update-env'); ready(ssh, port)
        finally: ssh.close()
        raise
    finally:
        try: ssh.close()
        except Exception: pass
if __name__ == '__main__': main()
