from pathlib import Path
import hashlib, json, shlex, importlib.util
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('h', ROOT / '_ai_workbench/tools/release_artifact_quench_fix_20261009.py')
h = importlib.util.module_from_spec(spec); spec.loader.exec_module(h)
REMOTE = '/linhhoasu/webgame/game/index.html'
LOCAL = ROOT / 'linhhoasu/webgame/game/index.html'
EXPECTED = 'e060b3e90cb27cb3e8190c69d848a1e576da87f7fca4df5a55aa676fb66c0dba'

def q(x): return shlex.quote(x)
def main():
    s = h.connect(); stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    backup = f'/linhhoasu/_ai_workbench/backups/fishing_x10_client_rollback_{stamp}'
    stage = f'/linhhoasu/_ai_workbench/temp/fishing_x10_client_rollback_{stamp}'
    evidence = {'at': datetime.now(timezone.utc).isoformat(), 'result': 'FAILED', 'productionWrites': 0, 'playerWrites': 0}
    try:
        current = h.rh(s, REMOTE)
        if current != EXPECTED: raise RuntimeError('INDEX_CAS:' + current)
        data = LOCAL.read_bytes()
        lines = data.splitlines(keepends=True)
        removed = [line for line in lines if b'lhs-fishing-x10-v1.js?v=20261010_fishing_x10_s1' not in line]
        candidate = b''.join(removed)
        if len(candidate) >= len(data): raise RuntimeError('MARKER_NOT_FOUND_LOCAL')
        candidate_hash = hashlib.sha256(candidate).hexdigest()
        h.run(s, 'install -d -m 700 ' + q(stage) + ' ' + q(backup))
        h.run(s, 'cp -p -- ' + q(REMOTE) + ' ' + q(backup + '/index.html'))
        with s.open_sftp() as sf:
            with sf.open(stage + '/index.html', 'wb') as f: f.write(candidate)
        if h.rh(s, stage + '/index.html') != candidate_hash: raise RuntimeError('STAGE_HASH')
        tmp = REMOTE + '.rollback.tmp'
        h.run(s, 'cp -- ' + q(stage + '/index.html') + ' ' + q(tmp) + ' && chmod --reference=' + q(REMOTE) + ' ' + q(tmp) + ' && chown --reference=' + q(REMOTE) + ' ' + q(tmp) + ' && mv -f -- ' + q(tmp) + ' ' + q(REMOTE))
        if h.rh(s, REMOTE) != candidate_hash: raise RuntimeError('FINAL_HASH')
        evidence.update({'result': 'PASS', 'backup': backup, 'oldHash': current, 'installedHash': candidate_hash, 'markerPresent': False, 'verifiedAt': datetime.now(timezone.utc).isoformat()})
    except Exception as exc:
        evidence['error'] = str(exc); raise
    finally:
        (ROOT / '_ai_workbench/temp/fishing_x10_s1_20261010/rollback.json').write_text(json.dumps(evidence, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
        try: h.run(s, 'rm -rf -- ' + q(stage), 30)
        except Exception: pass
        s.close()
    print(json.dumps(evidence, ensure_ascii=False))
if __name__ == '__main__': main()
