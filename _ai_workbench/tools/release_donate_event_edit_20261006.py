"""Publish only the event editor delta, retaining source metadata and live claims."""
import hashlib
import json
import shlex
import sys
from datetime import datetime, timezone
from pathlib import Path
from skin_incident_remote import connect, run

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '_ai_workbench/temp/donate_event_edit_20261006'
WEB = '/linhhoasu/webgame/gm'
STAGE = '/linhhoasu/_ai_workbench/temp/donate_event_edit_20261006/candidate'
FILES = ['donate_events.php', 'admin/admin_api.php', 'assets/js/admin.js']

def sha(data):
    return hashlib.sha256(data).hexdigest()

def main():
    baseline = json.loads((OUT / 'baseline.json').read_text(encoding='utf8'))
    hashes = {rel: sha((OUT / 'candidate' / rel).read_bytes()) for rel in FILES}
    stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    backup = '/linhhoasu/_ai_workbench/backups/donate_event_edit_' + stamp
    receipt = {'at': datetime.now(timezone.utc).isoformat(), 'backup': backup,
               'baseline': {rel: baseline['hashes'][rel] for rel in FILES},
               'candidate': hashes, 'applied': [], 'sourceOnly': True}
    with connect() as c, c.open_sftp() as s:
        for rel in FILES:
            if sha(s.open(WEB + '/' + rel, 'rb').read()) != baseline['hashes'][rel]:
                raise RuntimeError('PRODUCTION_DRIFT:' + rel)
            if sha(s.open(STAGE + '/' + rel, 'rb').read()) != hashes[rel]:
                raise RuntimeError('STAGE_DRIFT:' + rel)
        for rel in FILES:
            if rel.endswith('.php'):
                run(c, 'php -l ' + shlex.quote(STAGE + '/' + rel))
        result = json.loads(run(c, 'php /linhhoasu/_ai_workbench/temp/donate_event_edit_20261006/test.php ' + shlex.quote(STAGE)))
        if result.get('result') != 'PASS':
            raise RuntimeError('FIXTURE_FAILED')
        receipt['tests'] = result
        run(c, 'mkdir ' + shlex.quote(backup))
        for rel in FILES:
            dest = backup + '/' + rel
            run(c, 'mkdir -p ' + shlex.quote(dest.rsplit('/', 1)[0]) +
                ' && cp -p ' + shlex.quote(WEB + '/' + rel) + ' ' + shlex.quote(dest))
        manifest = {'baseline': receipt['baseline'], 'metadata': {rel: baseline['meta'][rel] for rel in FILES}}
        with s.open(backup + '/manifest.json', 'w') as f:
            f.write(json.dumps(manifest, indent=2))
        try:
            for rel in FILES:
                remote = WEB + '/' + rel
                if sha(s.open(remote, 'rb').read()) != baseline['hashes'][rel]:
                    raise RuntimeError('CUTOVER_DRIFT:' + rel)
                temp = remote + '.event-edit-install'
                s.put(str(OUT / 'candidate' / rel), temp)
                meta = baseline['meta'][rel]
                s.chown(temp, meta['uid'], meta['gid'])
                s.chmod(temp, meta['mode'])
                s.posix_rename(temp, remote)
                receipt['applied'].append(rel)
                if sha(s.open(remote, 'rb').read()) != hashes[rel]:
                    raise RuntimeError('READBACK_FAILED:' + rel)
            receipt['installed_tests'] = json.loads(run(c, 'php /linhhoasu/_ai_workbench/temp/donate_event_edit_20261006/test.php ' + shlex.quote(WEB)))
            receipt['post_hashes'] = {rel: sha(s.open(WEB + '/' + rel, 'rb').read()) for rel in FILES}
            receipt['php_user_readable'] = run(c, 'su -s /bin/sh www -c ' + shlex.quote('php -l ' + WEB + '/donate_events.php')).strip()
            receipt['http_login'] = run(c, "curl -fsS --max-time 8 -o /dev/null -w '%{http_code}' http://127.0.0.1:88/login.php").strip()
            receipt['http_admin'] = run(c, "curl -sS --max-time 8 -o /dev/null -w '%{http_code}' http://127.0.0.1:88/admin/index.php").strip()
            receipt['http_js_sha256'] = run(c, 'curl -fsS --max-time 8 http://127.0.0.1:88/assets/js/admin.js | sha256sum').split()[0]
            if (receipt['http_login'] != '200' or receipt['http_admin'] != '302' or
                receipt['http_js_sha256'] != hashes['assets/js/admin.js'] or receipt['installed_tests']['result'] != 'PASS'):
                raise RuntimeError('POSTCHECK_FAILED')
            receipt['result'] = 'DEPLOY_VERIFIED'
        except Exception as exc:
            receipt['error'] = str(exc)
            for rel in reversed(receipt['applied']):
                remote = WEB + '/' + rel
                if sha(s.open(remote, 'rb').read()) != hashes[rel]:
                    receipt['rollback_error'] = 'external drift:' + rel
                    break
                run(c, 'cp -p ' + shlex.quote(backup + '/' + rel) + ' ' + shlex.quote(remote + '.event-edit-rollback') +
                    ' && mv ' + shlex.quote(remote + '.event-edit-rollback') + ' ' + shlex.quote(remote))
            receipt['result'] = 'ROLLED_BACK'
            raise
        finally:
            (OUT / 'deployment.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2), encoding='utf8')
        print(json.dumps(receipt, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf8')
    main()
