"""Deploy the v2 Formation client event-order patch with static CAS."""
import hashlib, json, shlex
from datetime import datetime, timezone
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect, run

ROOT = Path(__file__).resolve().parents[2]
STAGE = ROOT / '_ai_workbench' / 'temp' / 'formation_fix_client_v2_20260913'
OUT = ROOT / '_ai_workbench' / 'temp' / 'formation_fix_client_v2_20260913'
REMOTE_ROOT = '/linhhoasu'
BACKUP = REMOTE_ROOT + '/_ai_workbench/backups/formation_fix_client_v2_20260913_pre'
FILES = {
    'webgame/game/index.html': STAGE / 'index.html',
    'webgame/game/js/lhs-formation-fix-v1.js': STAGE / 'lhs-formation-fix-v1.js',
}
EXPECTED = {
    'webgame/game/index.html': '53b4afacfbc8fb172089b583b11367d68044b49352de1e9c6fb7f1a9bd9e50ca',
    'webgame/game/js/lhs-formation-fix-v1.js': '6fccb2d33534cbed89c164c1ab959adcf1cb51abf5fd7ccfee79ca4a50c9ff1c',
}

def sha(data): return hashlib.sha256(data).hexdigest()
def rp(rel): return REMOTE_ROOT + '/' + rel

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    cand = {rel: {'sha256': sha(path.read_bytes()), 'bytes': path.stat().st_size} for rel, path in FILES.items()}
    ssh = connect(); ev = {'startedAt': datetime.now(timezone.utc).isoformat(), 'files': [], 'restart': 'none', 'scope': 'Formation client v2 static only'}
    try:
        if run(ssh, 'test -e ' + shlex.quote(BACKUP) + ' && echo yes || echo no').strip() != 'no': raise RuntimeError('REMOTE_BACKUP_ALREADY_EXISTS')
        with ssh.open_sftp() as sftp:
            for rel in FILES:
                try: data = sftp.open(rp(rel), 'rb').read(); actual = sha(data); exists = True
                except FileNotFoundError: data = b''; actual = None; exists = False
                if actual != EXPECTED[rel]: raise RuntimeError(f'CAS_MISMATCH:{rel}:{actual}:{EXPECTED[rel]}')
                before = OUT / 'remote_before' / rel; before.parent.mkdir(parents=True, exist_ok=True); before.write_bytes(data)
                ev['files'].append({'file': rel, 'remoteBefore': actual, 'localCandidate': cand[rel]['sha256']})
        for rel in FILES:
            dst = BACKUP + '/' + rel
            run(ssh, 'mkdir -p ' + shlex.quote(dst.rsplit('/', 1)[0]) + ' && cp -p ' + shlex.quote(rp(rel)) + ' ' + shlex.quote(dst))
        with ssh.open_sftp() as sftp:
            for rel, path in FILES.items():
                target = rp(rel); tmp = target + '.formation_v2_tmp_20260913'; sftp.put(str(path), tmp)
                if hasattr(sftp, 'posix_rename'): sftp.posix_rename(tmp, target)
                else: sftp.rename(tmp, target)
        with ssh.open_sftp() as sftp:
            for row in ev['files']: row['remoteAfter'] = sha(sftp.open(rp(row['file']), 'rb').read())
        idx = run(ssh, 'curl -sS --max-time 20 http://127.0.0.1:81/index.html')
        patch_http = int(run(ssh, "curl -sS --max-time 20 -o /dev/null -w '%{http_code}' http://127.0.0.1:81/js/lhs-formation-fix-v1.js?v=20260913_formation_fix_v2").strip())
        patch_sha = run(ssh, "curl -sS --max-time 20 http://127.0.0.1:81/js/lhs-formation-fix-v1.js?v=20260913_formation_fix_v2 | sha256sum | awk '{print $1}'").strip()
        ev['served'] = {'indexMarker': '20260913_formation_fix_v2' in idx, 'patchHttp': patch_http, 'patchSha256': patch_sha, 'candidateSha256': cand['webgame/game/js/lhs-formation-fix-v1.js']['sha256']}
        ev['remoteAfterHashesMatch'] = all(r.get('remoteAfter') == r.get('localCandidate') for r in ev['files'])
    finally: ssh.close()
    ev['finishedAt'] = datetime.now(timezone.utc).isoformat()
    ev['result'] = 'PASS' if ev.get('served', {}).get('indexMarker') and ev.get('served', {}).get('patchHttp') == 200 and ev.get('served', {}).get('patchSha256') == ev.get('served', {}).get('candidateSha256') and ev.get('remoteAfterHashesMatch') else 'HOLD'
    (OUT / 'deploy.json').write_text(json.dumps(ev, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'result': ev['result'], 'evidence': str(OUT / 'deploy.json'), 'restart': 'none'}, ensure_ascii=False))

if __name__ == '__main__': main()
