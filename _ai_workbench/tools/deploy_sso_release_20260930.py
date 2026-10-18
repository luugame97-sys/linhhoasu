import hashlib, json, posixpath, time
from pathlib import Path
import paramiko

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / '_ai_workbench/temp/sso_release_20260930'
HOST = '103.116.104.165'
USER = 'root'
PASSWORD = 'anhduc11'
BACKUP = '/linhhoasu/_ai_workbench/backups/sso_release_20260930'
STAGE = '/linhhoasu/_ai_workbench/temp/sso_release_20260930_stage'

FILES = {
    '/linhhoasu/lhs/newServer/src/net/HTTPServer.js': WORK / 'candidate/lhs/newServer/src/net/HTTPServer.js',
    '/linhhoasu/lhs/newServer/src/handlers/serverList.js': WORK / 'candidate/lhs/newServer/src/handlers/serverList.js',
    '/linhhoasu/lhs/newServer/src/services/AccountService.js': WORK / 'candidate/lhs/newServer/src/services/AccountService.js',
    '/linhhoasu/lhs/newServer/src/services/AuthSessionService.js': WORK / 'candidate/lhs/newServer/src/services/AuthSessionService.js',
    '/linhhoasu/lhs/newServer/src/services/PortalSessionService.js': WORK / 'candidate/lhs/newServer/src/services/PortalSessionService.js',
    '/linhhoasu/webgame/game/index.html': WORK / 'candidate/webgame/game/index.html',
    '/linhhoasu/webgame/game/register.html': WORK / 'candidate/webgame/game/register.html',
    '/linhhoasu/webgame/game/js/lhs-portal-v1.js': WORK / 'candidate/webgame/game/js/lhs-portal-v1.js',
    '/linhhoasu/webgame/gm/api/portal.php': WORK / 'candidate/webgame/gm/api/portal.php',
    '/linhhoasu/webgame/gm/public_giftcode_notice.php': WORK / 'candidate/webgame/gm/public_giftcode_notice.php',
    '/linhhoasu/webgame/gm/web_context.php': WORK / 'candidate/webgame/gm/web_context.php',
    '/linhhoasu/webgame/gm/api/user_api.php': WORK / 'candidate/webgame/gm/api/user_api.php',
}
EXPECTED = {
    '/linhhoasu/lhs/newServer/src/net/HTTPServer.js': '101d796a33b9d4118c732823b2077d1bb66d963b4d4458041fd9c417642391c5',
    '/linhhoasu/lhs/newServer/src/handlers/serverList.js': 'cac4a220bb474dc4920611f5aada3c4454e1a024fad7f89889ec9d2e909c0b19',
    '/linhhoasu/lhs/newServer/src/services/AccountService.js': '78e1abc5385e6f20a09226fe1f57388a8e7038dfce22667bbf1044738bf7dfed',
    '/linhhoasu/lhs/newServer/src/services/AuthSessionService.js': '4dc113dd54d507883e9abe8c8dcd88cc2ee6ae659eee6b7b8cf87757ecd009fd3',
    '/linhhoasu/lhs/newServer/src/services/PortalSessionService.js': '',
    '/linhhoasu/webgame/game/index.html': '612d638780dbeb8eba6b89180119dd52db259c01d753734e8dd5be78c3afd30f',
    '/linhhoasu/webgame/game/register.html': '44ce176e0e90ba5a1c87078faf5dc1994a235bbdcd9c61a8f751bad3bba5c7ff',
    '/linhhoasu/webgame/game/js/lhs-portal-v1.js': '',
    '/linhhoasu/webgame/gm/api/portal.php': '',
    '/linhhoasu/webgame/gm/public_giftcode_notice.php': '',
    '/linhhoasu/webgame/gm/web_context.php': '8ff82105e96fa8679b8bb965a8754067f2f330def083cf66dc75ec606a8173c0',
    '/linhhoasu/webgame/gm/api/user_api.php': '43fb73280729f3baefc40c2b187924f29d2f5d54dd964e93874ad06f4035c1d3',
}

def sha_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()

def run(ssh, command, check=True):
    _, out, err = ssh.exec_command(command, timeout=120)
    text = out.read().decode('utf-8', 'replace').strip()
    error = err.read().decode('utf-8', 'replace').strip()
    code = out.channel.recv_exit_status()
    if check and code:
        raise RuntimeError(f'{command}: {error or text}')
    return text

def remote_sha(ssh, path):
    return run(ssh, f"if [ -f {path} ]; then sha256sum -- {path} | cut -d' ' -f1; else echo MISSING; fi", False)

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASSWORD, timeout=20)
sftp = ssh.open_sftp()
stamp = time.strftime('%Y%m%d_%H%M%S')
result = {'status': 'PREPARING', 'host': HOST, 'backup': BACKUP, 'stage': STAGE, 'files': list(FILES), 'stamp': stamp}
before = {}
try:
    for path, local in FILES.items():
        if not local.exists():
            raise RuntimeError(f'LOCAL_CANDIDATE_MISSING:{local}')
    before = {path: remote_sha(ssh, path) for path in FILES}
    result['before'] = before
    for path, expected in EXPECTED.items():
        if expected and before[path] != expected:
            raise RuntimeError(f'CAS_DRIFT:{path}:{before[path]}:{expected}')
    run(ssh, f'mkdir -p {BACKUP} {STAGE}')
    for path in FILES:
        name = posixpath.basename(path)
        if before[path] != 'MISSING':
            run(ssh, f'cp -p -- {path} {BACKUP}/{name}.before')
        else:
            run(ssh, f'touch {BACKUP}/{name}.absent')
    remote_candidates = {}
    for path, local in FILES.items():
        name = posixpath.basename(path) + '.' + stamp + '.candidate'
        staged = f'{STAGE}/{name}'
        sftp.put(str(local), staged)
        remote_candidates[path] = staged
    run(ssh, f'node --check {remote_candidates["/linhhoasu/lhs/newServer/src/net/HTTPServer.js"]}')
    run(ssh, f'node --check {remote_candidates["/linhhoasu/lhs/newServer/src/handlers/serverList.js"]}')
    run(ssh, f'node --check {remote_candidates["/linhhoasu/lhs/newServer/src/services/AccountService.js"]}')
    run(ssh, f'node --check {remote_candidates["/linhhoasu/lhs/newServer/src/services/AuthSessionService.js"]}')
    run(ssh, f'node --check {remote_candidates["/linhhoasu/lhs/newServer/src/services/PortalSessionService.js"]}')
    run(ssh, f'node --check {remote_candidates["/linhhoasu/webgame/game/js/lhs-portal-v1.js"]}')
    run(ssh, f'php -l {remote_candidates["/linhhoasu/webgame/gm/api/portal.php"]}')
    run(ssh, f'php -l {remote_candidates["/linhhoasu/webgame/gm/public_giftcode_notice.php"]}')
    run(ssh, f'php -l {remote_candidates["/linhhoasu/webgame/gm/web_context.php"]}')
    run(ssh, f'php -l {remote_candidates["/linhhoasu/webgame/gm/api/user_api.php"]}')
    for path, staged in remote_candidates.items():
        tmp = path + '.sso.' + stamp + '.next'
        run(ssh, f'install -m 0644 -- {staged} {tmp} && mv -f -- {tmp} {path}')
    after = {path: remote_sha(ssh, path) for path in FILES}
    result['after'] = after
    for path, local in FILES.items():
        if after[path] != sha_file(local):
            raise RuntimeError(f'HASH_MISMATCH:{path}')
    for sid in range(1006, 1000, -1):
        run(ssh, f'pm2 reload lhs-s{sid} --update-env')
        time.sleep(1.5)
    ready = {}
    for port in [8080, 8083, 8084, 8085, 8086, 8087]:
        ready[str(port)] = run(ssh, f'curl -fsS --max-time 8 http://127.0.0.1:{port}/ready')
    result['ready'] = ready
    if any('"status":"ok"' not in row for row in ready.values()):
        raise RuntimeError('READINESS_FAILED')
    result['status'] = 'DEPLOYED'
except Exception as error:
    result['status'] = 'FAILED_ROLLBACK_ATTEMPTED'
    result['error'] = str(error)
    for path in FILES:
        name = posixpath.basename(path)
        if before.get(path) and before[path] != 'MISSING':
            run(ssh, f'cp -p -- {BACKUP}/{name}.before {path}', False)
        elif before.get(path) == 'MISSING':
            run(ssh, f'rm -f -- {path}', False)
    for sid in range(1006, 1000, -1):
        run(ssh, f'pm2 reload lhs-s{sid} --update-env', False)
        time.sleep(1.0)
    raise
finally:
    (WORK / 'deploy_result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    sftp.close()
    ssh.close()
print(json.dumps(result, ensure_ascii=False, indent=2))
