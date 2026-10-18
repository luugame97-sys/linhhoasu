from pathlib import Path
import hashlib, json, shlex
import importlib.util
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('h', ROOT / '_ai_workbench/tools/release_artifact_quench_fix_20261009.py')
h = importlib.util.module_from_spec(spec); spec.loader.exec_module(h)
REMOTE = '/linhhoasu/webgame/game/js/lhs-fishing-x10-v1.js'
LOCAL = ROOT / 'linhhoasu/webgame/game/js/lhs-fishing-x10-v1.js'
def q(x): return shlex.quote(x)
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()

def main():
    s = h.connect(); stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    backup = f'/linhhoasu/_ai_workbench/backups/fishing_x10_client_s1_{stamp}'
    stage = f'/linhhoasu/_ai_workbench/temp/fishing_x10_client_s1_{stamp}'
    evidence = {'at': datetime.now(timezone.utc).isoformat(), 'result': 'FAILED', 'productionWrites': 0, 'playerWrites': 0}
    try:
        old = h.rh(s, REMOTE); candidate = sha(LOCAL)
        h.run(s, 'install -d -m 700 ' + q(stage) + ' ' + q(backup))
        h.run(s, 'cp -p -- ' + q(REMOTE) + ' ' + q(backup + '/lhs-fishing-x10-v1.js'))
        with s.open_sftp() as sf: sf.put(str(LOCAL), stage + '/lhs-fishing-x10-v1.js')
        if h.rh(s, stage + '/lhs-fishing-x10-v1.js') != candidate: raise RuntimeError('STAGE_HASH')
        tmp = REMOTE + '.tmp'
        if h.rh(s, REMOTE) != old: raise RuntimeError('CAS')
        h.run(s, 'cp -- ' + q(stage + '/lhs-fishing-x10-v1.js') + ' ' + q(tmp) + ' && chmod --reference=' + q(REMOTE) + ' ' + q(tmp) + ' && chown --reference=' + q(REMOTE) + ' ' + q(tmp) + ' && mv -f -- ' + q(tmp) + ' ' + q(REMOTE))
        if h.rh(s, REMOTE) != candidate: raise RuntimeError('FINAL_HASH')
        syntax = h.run(s, 'node --check ' + q(REMOTE) + ' >/dev/null && echo PASS').strip()
        if syntax != 'PASS': raise RuntimeError('SYNTAX')
        evidence.update({'result': 'PASS', 'backup': backup, 'oldHash': old, 'installedHash': candidate, 'syntax': syntax, 'verifiedAt': datetime.now(timezone.utc).isoformat()})
    except Exception as exc:
        evidence['error'] = str(exc); raise
    finally:
        (ROOT / '_ai_workbench/temp/fishing_x10_s1_20261010/client_update.json').write_text(json.dumps(evidence, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
        try: h.run(s, 'rm -rf -- ' + q(stage), 30)
        except Exception: pass
        s.close()
    print(json.dumps(evidence, ensure_ascii=False))
if __name__ == '__main__': main()
