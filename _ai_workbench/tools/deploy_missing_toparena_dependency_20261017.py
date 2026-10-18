"""Restore the second JS dependency that the live game index references."""
import hashlib
import json
import re
import shlex
from datetime import datetime, timezone
from pathlib import Path

from skin_incident_remote import connect, run

ROOT = Path(__file__).resolve().parents[2]
LOCAL = ROOT / 'linhhoasu/webgame/game/js/lhs-toparena-v3.js'
REMOTE = '/linhhoasu/webgame/game/js/lhs-toparena-v3.js'
INDEX = '/linhhoasu/webgame/game/index.html'
OUT = ROOT / '_ai_workbench/temp/missing_toparena_dependency_20261017'


def sha_bytes(data):
    return hashlib.sha256(data).hexdigest()


def rh(client, path):
    try:
        return run(client, 'sha256sum ' + shlex.quote(path)).split()[0]
    except RuntimeError:
        return None


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    expected = sha_bytes(LOCAL.read_bytes())
    if 'LhsTopArenaV3' not in LOCAL.read_text(encoding='utf-8'):
        raise RuntimeError('TOPARENA_MARKER_MISSING')
    stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    backup = f'/linhhoasu/_ai_workbench/backups/missing_toparena_dependency_20261017_{stamp}'
    stage = f'/linhhoasu/_ai_workbench/temp/missing_toparena_dependency_20261017_{stamp}'
    receipt = {'status': 'STARTING', 'result': 'PENDING', 'relative': 'js/lhs-toparena-v3.js',
               'candidate': expected, 'backup': backup, 'stage': stage,
               'directPlayerWrites': 0, 'serviceRestarts': 0}
    with connect() as client:
        before = rh(client, REMOTE)
        if before is not None:
            if before != expected:
                raise RuntimeError('TARGET_DRIFT_PRESENT:' + before)
            receipt.update(status='ALREADY_PRESENT', result='PASS', final=before)
            (OUT / 'deployment.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
            print(json.dumps(receipt, ensure_ascii=False))
            return
        index_before = rh(client, INDEX)
        if not index_before:
            raise RuntimeError('INDEX_MISSING')
        run(client, 'mkdir -p ' + shlex.quote(backup + '/js') + ' ' + shlex.quote(stage + '/js'))
        run(client, 'cp -p ' + shlex.quote(INDEX) + ' ' + shlex.quote(backup + '/index.html'))
        if rh(client, backup + '/index.html') != index_before:
            raise RuntimeError('INDEX_BACKUP_HASH')
        with client.open_sftp() as sftp:
            sftp.put(str(LOCAL), stage + '/js/lhs-toparena-v3.js')
        if rh(client, stage + '/js/lhs-toparena-v3.js') != expected:
            raise RuntimeError('UPLOAD_HASH')
        run(client, 'node --check ' + shlex.quote(stage + '/js/lhs-toparena-v3.js'))
        receipt.update(status='STAGED', indexBefore=index_before)
        (OUT / 'deployment.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        if rh(client, REMOTE) is not None:
            raise RuntimeError('CAS_TARGET_APPEARED')
        run(client, 'mv ' + shlex.quote(stage + '/js/lhs-toparena-v3.js') + ' ' + shlex.quote(REMOTE))
        if rh(client, REMOTE) != expected:
            raise RuntimeError('FINAL_HASH')
        # Re-scan all live index script URLs so the loader cannot stop at the
        # next missing dependency.
        index_text = run(client, 'cat ' + shlex.quote(INDEX)).replace('\r', '')
        refs = list(dict.fromkeys(re.findall(r'"(js/[^"\s]+\.js(?:\?[^"\s]*)?)"', index_text)))
        missing = []
        for ref in refs:
            path = ref.split('?', 1)[0]
            code = run(client, 'curl -s -o /dev/null -w "%{http_code}" --connect-timeout 3 --max-time 10 https://linhhoasu.lol/' + shlex.quote(path)).strip()
            if code != '200':
                missing.append({'path': path, 'http': code})
        if missing:
            raise RuntimeError('REFERENCED_SCRIPT_GAPS:' + json.dumps(missing, ensure_ascii=False))
        public_hash = run(client, 'curl -fsS --connect-timeout 3 --max-time 15 https://linhhoasu.lol/js/lhs-toparena-v3.js?v=20261017_toparena_dependency | sha256sum').split()[0]
        if public_hash != expected:
            raise RuntimeError('PUBLIC_HASH_MISMATCH:' + public_hash)
        receipt.update({'status': 'DEPLOYED', 'result': 'PASS', 'final': expected,
                        'publicHash': public_hash, 'referencedScripts': len(refs),
                        'missingReferencedScripts': missing,
                        'verifiedAt': datetime.now(timezone.utc).isoformat()})
    (OUT / 'deployment.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(receipt, ensure_ascii=False))


if __name__ == '__main__':
    main()
