"""Deploy the verified OldTrek renderer-only fix with backup and CAS."""
import hashlib
import json
import shlex
from datetime import datetime, timezone
from pathlib import Path
from skin_incident_remote import connect, run

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '_ai_workbench/temp/oldtrek_renderer_fix_20261017'
MANIFEST = json.loads((OUT / 'release.json').read_text(encoding='utf-8'))
REMOTE = '/linhhoasu/webgame/game'
FILES = ['js/main.min_drop200.js', 'index.html']

def sha(data):
    return hashlib.sha256(data).hexdigest()

def rh(c, path):
    return run(c, 'sha256sum ' + shlex.quote(path)).split()[0]

def atomic(c, source, target, expected):
    tmp = target + '.oldtrek-renderer-20261017.tmp'
    q = shlex.quote
    run(c, 'test ! -e {tmp} && cp -p {src} {tmp} && chmod --reference={dst} {tmp} && chown --reference={dst} {tmp}'.format(tmp=q(tmp), src=q(source), dst=q(target)))
    if rh(c, tmp) != expected:
        raise RuntimeError('STAGE_HASH')
    run(c, 'mv -f {tmp} {dst}'.format(tmp=q(tmp), dst=q(target)))
    if rh(c, target) != expected:
        raise RuntimeError('PUBLISHED_HASH')

with connect() as c:
    stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    backup = f'/linhhoasu/_ai_workbench/backups/oldtrek_renderer_fix_20261017_{stamp}'
    stage = f'/linhhoasu/_ai_workbench/temp/oldtrek_renderer_fix_20261017_{stamp}'
    live = {rel: rh(c, REMOTE + '/' + rel) for rel in FILES}
    expected = {row['relative']: row['before'] for row in MANIFEST['files']}
    if live != expected:
        raise RuntimeError('PREFLIGHT_DRIFT:' + json.dumps(live))
    candidate = {rel: sha((OUT / rel).read_bytes()) for rel in FILES}
    manifest_candidate = {row['relative']: row['candidate'] for row in MANIFEST['files']}
    if candidate != manifest_candidate:
        raise RuntimeError('CANDIDATE_DRIFT')
    run(c, 'mkdir -p ' + shlex.quote(backup) + '/js ' + shlex.quote(stage) + '/js')
    for rel in FILES:
        src = OUT / rel
        dst_stage = stage + '/' + rel
        dst_backup = backup + '/' + rel
        run(c, 'cp -p {src} {dst}'.format(src=shlex.quote(REMOTE + '/' + rel), dst=shlex.quote(dst_backup)))
        if rh(c, dst_backup) != expected[rel]:
            raise RuntimeError('BACKUP_HASH:' + rel)
        with c.open_sftp() as sftp:
            sftp.put(str(src), dst_stage)
        if rh(c, dst_stage) != candidate[rel]:
            raise RuntimeError('UPLOAD_HASH:' + rel)
        if rel.endswith('.js'):
            run(c, 'node --check ' + shlex.quote(dst_stage))
    published = []
    try:
        for rel in FILES:
            target = REMOTE + '/' + rel
            if rh(c, target) != expected[rel]:
                raise RuntimeError('CAS_DRIFT:' + rel)
            atomic(c, stage + '/' + rel, target, candidate[rel])
            published.append(rel)
    except Exception:
        for rel in reversed(published):
            target = REMOTE + '/' + rel
            if rh(c, target) == candidate[rel]:
                atomic(c, backup + '/' + rel, target, expected[rel])
        raise
    final = {rel: rh(c, REMOTE + '/' + rel) for rel in FILES}
    if final != candidate:
        raise RuntimeError('FINAL_HASH')
    receipt = {
        'result': 'PASS', 'version': MANIFEST['version'], 'backup': backup,
        'stage': stage, 'files': FILES, 'before': expected, 'candidate': candidate,
        'final': final, 'directPlayerWrites': 0, 'serviceRestarts': 0,
        'verifiedAt': datetime.now(timezone.utc).isoformat(),
    }
    (OUT / 'deployment.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(receipt, ensure_ascii=False))
