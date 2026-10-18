"""Make the mobile login server card keep the server number readable."""
import hashlib
import json
import shlex
from datetime import datetime, timezone
from pathlib import Path

from skin_incident_remote import connect, run

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / '_ai_workbench/temp/web_game_identity_20261004/source/login.php'
OUT = ROOT / '_ai_workbench/temp/mobile_server_status_20261011'
REMOTE = '/linhhoasu/webgame/gm/login.php'
STAGE = '/linhhoasu/_ai_workbench/temp/mobile_server_status_20261011/login.php'
BACKUP = '/linhhoasu/_ai_workbench/backups/mobile_server_status_20261011_pre'
BASE_HASH = 'b49ed317e4c61a7ad721e9dd8a2b8341cafb1ba5800e309db4d323ebc7e74496'

OLD = b'    @media(max-width:576px){\r\n        .server-modal.modal'
NEW = b'''    @media(max-width:576px){
        /* Preserve server-code width on phones: keep the green state as a dot. */
        .server-card-main{flex:1 1 auto;min-width:0!important}
        .server-card-info{min-width:0!important}
        .server-card-name{font-size:.88rem!important}
        .server-status-pill{width:18px!important;height:18px!important;padding:0!important;gap:0!important;justify-content:center!important;font-size:0!important;flex:0 0 18px!important}
        .server-status-pill .status-pulse{width:8px!important;height:8px!important}
        .server-change-link{padding:4px 6px!important;font-size:.72rem!important;gap:2px!important}
        .server-modal.modal'''

def sha(data):
    return hashlib.sha256(data).hexdigest()

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    baseline = BASE.read_bytes()
    if sha(baseline) != BASE_HASH:
        raise RuntimeError('captured login baseline drifted')
    if baseline.count(OLD) != 1:
        raise RuntimeError(f'expected one mobile CSS anchor, found {baseline.count(OLD)}')
    candidate = baseline.replace(OLD, NEW, 1)
    candidate_path = OUT / 'candidate_login.php'
    candidate_path.write_bytes(candidate)
    candidate_hash = sha(candidate)
    with connect() as ssh, ssh.open_sftp() as sftp:
        live = sftp.open(REMOTE, 'rb').read()
        if sha(live) != BASE_HASH:
            raise RuntimeError('production login.php CAS drift')
        run(ssh, 'mkdir -p ' + shlex.quote(STAGE.rsplit('/', 1)[0]))
        sftp.put(str(candidate_path), STAGE)
        run(ssh, 'php -l ' + shlex.quote(STAGE))
        if run(ssh, 'sha256sum ' + shlex.quote(STAGE) + " | awk '{print $1}'").strip() != candidate_hash:
            raise RuntimeError('stage hash mismatch')
        run(ssh, 'test -e ' + shlex.quote(BACKUP) + ' && exit 1 || mkdir -p ' + shlex.quote(BACKUP))
        run(ssh, 'cp -p ' + shlex.quote(REMOTE) + ' ' + shlex.quote(BACKUP + '/login.php'))
        tmp = REMOTE + '.mobile-status-fix'
        run(ssh, 'cp ' + shlex.quote(STAGE) + ' ' + shlex.quote(tmp) + ' && mv ' + shlex.quote(tmp) + ' ' + shlex.quote(REMOTE))
        post_hash = sha(sftp.open(REMOTE, 'rb').read())
        php_lint = run(ssh, 'php -l ' + shlex.quote(REMOTE)).strip()
        login_http = run(ssh, "curl -fsS --max-time 8 -o /dev/null -w '%{http_code}' http://127.0.0.1:88/login.php").strip()
        public_body = run(ssh, "curl -fsS --max-time 8 http://127.0.0.1:88/login.php")
        checks = {
            'mobile_dot_rule': '.server-status-pill{width:18px' in public_body,
            'server_name_rule': '.server-card-name{font-size:.88rem' in public_body,
            'http_login': login_http,
            'php_lint': php_lint,
            'backup': BACKUP,
            'baseline_hash': BASE_HASH,
            'candidate_hash': candidate_hash,
            'post_hash': post_hash,
        }
        result = {
            'at': datetime.now(timezone.utc).isoformat(),
            'result': 'DEPLOY_VERIFIED' if post_hash == candidate_hash and login_http == '200' and checks['mobile_dot_rule'] and checks['server_name_rule'] else 'HOLD',
            'checks': checks,
        }
        (OUT / 'deployment.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(json.dumps(result, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
