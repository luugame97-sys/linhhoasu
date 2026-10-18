"""Deploy the shared farm auth-loss guard with backup, CAS and HTTP read-back."""
import hashlib
import json
import shlex
from datetime import datetime, timezone
from pathlib import Path

from skin_incident_remote import connect, run

ROOT = Path(__file__).resolve().parents[2]
REMOTE = '/linhhoasu/webgame/game'
OUT = ROOT / '_ai_workbench/temp/farm_auth_guard_20261017'
FILES = {
    'js/lhs-farm-alchemy-v2.js': ROOT / 'linhhoasu/webgame/game/js/lhs-farm-alchemy-v2.js',
    'index.html': ROOT / 'linhhoasu/webgame/game/index.html',
}
# Read-only preflight immediately before this release. Any drift aborts before
# a production write, so a concurrent release cannot be overwritten silently.
BEFORE = {
    'js/lhs-farm-alchemy-v2.js': '75ef47df93f88bfed058ef81ef508487701c3ab4feb0ce4f814fe1202ae1223c',
    'index.html': 'cc156204b6775bec9a0f404780bbde19a3289f6ad8825740d85b732f85c2bb51',
}


def sha_bytes(data):
    return hashlib.sha256(data).hexdigest()


def sha_file(path):
    return sha_bytes(path.read_bytes())


def remote_hash(client, path):
    return run(client, 'sha256sum ' + shlex.quote(path)).split()[0]


def atomic_publish(client, source, target, expected):
    q = shlex.quote
    temp = target + '.farm-auth-guard-20261017.tmp'
    run(client, 'test ! -e {tmp} && cp -p {src} {tmp} && chmod --reference={dst} {tmp} && chown --reference={dst} {tmp}'.format(
        tmp=q(temp), src=q(source), dst=q(target)))
    if remote_hash(client, temp) != expected:
        raise RuntimeError('STAGE_HASH:' + target)
    run(client, 'mv -f {tmp} {dst}'.format(tmp=q(temp), dst=q(target)))
    if remote_hash(client, target) != expected:
        raise RuntimeError('PUBLISHED_HASH:' + target)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    candidates = {rel: sha_file(path) for rel, path in FILES.items()}
    if not '20261017_auth_guard_v1' in FILES['js/lhs-farm-alchemy-v2.js'].read_text(encoding='utf-8'):
        raise RuntimeError('CANDIDATE_MARKER_MISSING')
    if '20261017_auth_guard_v1' not in FILES['index.html'].read_text(encoding='utf-8'):
        raise RuntimeError('INDEX_MARKER_MISSING')
    stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    backup = f'/linhhoasu/_ai_workbench/backups/farm_auth_guard_20261017_{stamp}'
    stage = f'/linhhoasu/_ai_workbench/temp/farm_auth_guard_20261017_{stamp}'
    receipt = {
        'result': 'STARTING', 'version': '20261017_auth_guard_v1',
        'backup': backup, 'stage': stage, 'files': list(FILES),
        'before': BEFORE, 'candidate': candidates,
        'directPlayerWrites': 0, 'serviceRestarts': 0,
    }
    with connect() as client:
        live = {rel: remote_hash(client, REMOTE + '/' + rel) for rel in FILES}
        if live != BEFORE:
            raise RuntimeError('PREFLIGHT_DRIFT:' + json.dumps(live))
        run(client, 'mkdir -p ' + shlex.quote(backup + '/js') + ' ' + shlex.quote(stage + '/js'))
        for rel, local in FILES.items():
            target = REMOTE + '/' + rel
            backup_path = backup + '/' + rel
            stage_path = stage + '/' + rel
            run(client, 'cp -p {src} {dst}'.format(src=shlex.quote(target), dst=shlex.quote(backup_path)))
            if remote_hash(client, backup_path) != BEFORE[rel]:
                raise RuntimeError('BACKUP_HASH:' + rel)
            with client.open_sftp() as sftp:
                sftp.put(str(local), stage_path)
            if remote_hash(client, stage_path) != candidates[rel]:
                raise RuntimeError('UPLOAD_HASH:' + rel)
            if rel.endswith('.js'):
                run(client, 'node --check ' + shlex.quote(stage_path))
        receipt['status'] = 'STAGED'
        (OUT / 'deployment.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        published = []
        try:
            for rel in FILES:
                target = REMOTE + '/' + rel
                if remote_hash(client, target) != BEFORE[rel]:
                    raise RuntimeError('CAS_DRIFT:' + rel)
                atomic_publish(client, stage + '/' + rel, target, candidates[rel])
                published.append(rel)
        except Exception:
            for rel in reversed(published):
                target = REMOTE + '/' + rel
                if remote_hash(client, target) == candidates[rel]:
                    atomic_publish(client, backup + '/' + rel, target, BEFORE[rel])
            raise
        final = {rel: remote_hash(client, REMOTE + '/' + rel) for rel in FILES}
        if final != candidates:
            raise RuntimeError('FINAL_HASH:' + json.dumps(final))
        served = {}
        unavailable_hosts = []
        for host in ['127.0.0.1', '103.116.105.154']:
            for rel in FILES:
                url = '/' + rel
                try:
                    digest = run(client, 'curl -fsS --connect-timeout 3 --max-time 8 ' + shlex.quote('http://' + host + ':81' + url) + ' | sha256sum').split()[0]
                except RuntimeError as error:
                    unavailable_hosts.append({'host': host, 'url': url, 'error': str(error)[-240:]})
                    continue
                if digest != candidates[rel]:
                    raise RuntimeError('HTTP_ARTIFACT_MISMATCH:' + host + url)
                served[host + url] = digest
        if not any(key.startswith('127.0.0.1/') for key in served):
            raise RuntimeError('NO_LOCAL_HTTP_READBACK')
        marker = run(client, 'grep -F "20261017_auth_guard_v1" ' + shlex.quote(REMOTE + '/index.html')).strip()
        receipt.update({
            'result': 'PASS', 'status': 'DEPLOYED', 'final': final,
            'served': served, 'unavailableHosts': unavailable_hosts, 'indexMarker': marker,
            'verifiedAt': datetime.now(timezone.utc).isoformat(),
        })
    (OUT / 'deployment.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(receipt, ensure_ascii=False))


if __name__ == '__main__':
    main()
