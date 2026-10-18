"""Restore the static Homeland guard referenced by the live loader.

The target is currently absent. This deploy backs up the absence/index evidence,
uses an explicit absent-target CAS, publishes one regular file atomically, and
checks every script reference in the live index for HTTP availability.
"""
import hashlib
import json
import re
import shlex
from datetime import datetime, timezone
from pathlib import Path

from skin_incident_remote import connect, run

ROOT = Path(__file__).resolve().parents[2]
LOCAL = ROOT / 'linhhoasu/webgame/game/js/lhs-homeland-guard-v1.js'
REMOTE_ROOT = '/linhhoasu/webgame/game'
REL = 'js/lhs-homeland-guard-v1.js'
TARGET = REMOTE_ROOT + '/' + REL
OUT = ROOT / '_ai_workbench/temp/missing_homeland_guard_20261017'


def sha_bytes(data):
    return hashlib.sha256(data).hexdigest()


def remote_hash(client, path):
    try:
        return run(client, 'sha256sum ' + shlex.quote(path)).split()[0]
    except RuntimeError:
        return None


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    expected = sha_bytes(LOCAL.read_bytes())
    if '20261003_homeland_guard_v1' not in LOCAL.read_text(encoding='utf-8'):
        raise RuntimeError('CANDIDATE_MARKER_MISSING')
    stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    backup = f'/linhhoasu/_ai_workbench/backups/missing_homeland_guard_20261017_{stamp}'
    stage = f'/linhhoasu/_ai_workbench/temp/missing_homeland_guard_20261017_{stamp}'
    receipt = {
        'status': 'STARTING', 'result': 'PENDING', 'relative': REL,
        'candidate': expected, 'targetBefore': None, 'backup': backup,
        'stage': stage, 'directPlayerWrites': 0, 'serviceRestarts': 0,
    }
    with connect() as client:
        before = remote_hash(client, TARGET)
        if before is not None:
            if before != expected:
                raise RuntimeError('TARGET_DRIFT_PRESENT:' + before)
            receipt.update(status='ALREADY_PRESENT', result='PASS', final=before)
            (OUT / 'deployment.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
            print(json.dumps(receipt, ensure_ascii=False))
            return
        index = REMOTE_ROOT + '/index.html'
        index_hash = remote_hash(client, index)
        if not index_hash:
            raise RuntimeError('INDEX_MISSING')
        run(client, 'mkdir -p ' + shlex.quote(backup + '/js') + ' ' + shlex.quote(stage + '/js'))
        run(client, 'cp -p ' + shlex.quote(index) + ' ' + shlex.quote(backup + '/index.html'))
        if remote_hash(client, backup + '/index.html') != index_hash:
            raise RuntimeError('INDEX_BACKUP_HASH')
        with client.open_sftp() as sftp:
            sftp.put(str(LOCAL), stage + '/' + REL)
        if remote_hash(client, stage + '/' + REL) != expected:
            raise RuntimeError('UPLOAD_HASH')
        run(client, 'node --check ' + shlex.quote(stage + '/' + REL))
        receipt.update(status='STAGED', indexBefore=index_hash)
        (OUT / 'deployment.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        if remote_hash(client, TARGET) is not None:
            raise RuntimeError('CAS_TARGET_APPEARED')
        # The target is absent by design, so mv is the atomic publication.
        run(client, 'mv ' + shlex.quote(stage + '/' + REL) + ' ' + shlex.quote(TARGET))
        if remote_hash(client, TARGET) != expected:
            raise RuntimeError('FINAL_HASH')
        public_hash = run(client, 'curl -fsS --connect-timeout 3 --max-time 15 https://linhhoasu.lol/' + REL + '?v=20261017_homeland_guard | sha256sum').split()[0]
        if public_hash != expected:
            raise RuntimeError('PUBLIC_HASH_MISMATCH:' + public_hash)
        # Verify every JS entry currently referenced by the live index. A 404
        # here would recreate the same loader deadlock with a different file.
        index_text = run(client, 'cat ' + shlex.quote(index)).replace('\r', '')
        refs = list(dict.fromkeys(re.findall(r'"(js/[^"\s]+\.js(?:\?[^"\s]*)?)"', index_text)))
        missing = []
        for ref in refs:
            path = ref.split('?', 1)[0]
            code = run(client, 'curl -s -o /dev/null -w "%{http_code}" --connect-timeout 3 --max-time 10 https://linhhoasu.lol/' + shlex.quote(path)).strip()
            if code != '200':
                missing.append({'path': path, 'http': code})
        if missing:
            raise RuntimeError('REFERENCED_SCRIPT_GAPS:' + json.dumps(missing, ensure_ascii=False))
        receipt.update({
            'status': 'DEPLOYED', 'result': 'PASS', 'targetAfter': expected,
            'publicHash': public_hash, 'indexAfter': remote_hash(client, index),
            'referencedScripts': len(refs), 'missingReferencedScripts': missing,
            'verifiedAt': datetime.now(timezone.utc).isoformat(),
        })
    (OUT / 'deployment.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(receipt, ensure_ascii=False))


if __name__ == '__main__':
    main()
