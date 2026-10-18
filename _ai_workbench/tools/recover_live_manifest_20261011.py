"""Restore the verified pre-x10 live index; never publish a stale local index."""
from pathlib import Path
from datetime import datetime, timezone
import importlib.util, hashlib, json, re, shlex, sys

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '_ai_workbench/temp/fishing_x10_s1_20261010'
INDEX = '/linhhoasu/webgame/game/index.html'
SOURCE = '/linhhoasu/_ai_workbench/backups/fishing_x10_s1_20261010_235457/webgame/game/index.html'
EXPECTED = '9252eeea8e87379dbff593f677a10ff26a5a8455f18389f5f58470cb9e7eea4e'
GOOD = 'fd9611f0b4b046167c22c3850e87ecfdb0452543748527c260eefa00999b4f32'
spec = importlib.util.spec_from_file_location('helper', ROOT / '_ai_workbench/tools/release_artifact_quench_fix_20261009.py')
h = importlib.util.module_from_spec(spec)
spec.loader.exec_module(h)
q = shlex.quote

def main():
    sys.stdout.reconfigure(encoding='utf-8')
    s = h.connect()
    stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    backup = '/linhhoasu/_ai_workbench/backups/restore_live_manifest_' + stamp
    try:
        if h.rh(s, INDEX) != EXPECTED or h.rh(s, SOURCE) != GOOD:
            raise RuntimeError('MANIFEST_CAS_FAILED')
        with s.open_sftp() as sf:
            data = sf.open(SOURCE, 'rb').read()
            refs = list(dict.fromkeys(re.findall(r'"(js/[^"\s]+\.js(?:\?[^"\s]*)?)"', data.decode('utf-8'))))
            for ref in refs:
                sf.stat('/linhhoasu/webgame/game/' + ref.split('?')[0])
        if b'lhs-fishing-x10-v1.js' in data or b'lhs-homeland-guard-v1.js' in data:
            raise RuntimeError('BASELINE_UNEXPECTED')
        h.run(s, 'install -d -m 700 ' + q(backup))
        h.run(s, 'cp -p -- ' + q(INDEX) + ' ' + q(backup + '/index.html'))
        if h.rh(s, INDEX) != EXPECTED or h.rh(s, backup+'/index.html') != EXPECTED:
            raise RuntimeError('BACKUP_CAS_FAILED')
        tmp = INDEX + '.recover-live.tmp'
        h.run(s, 'cp -p -- ' + q(SOURCE) + ' ' + q(tmp))
        if h.rh(s, tmp) != GOOD: raise RuntimeError('STAGE_HASH_FAILED')
        h.run(s, 'mv -f -- ' + q(tmp) + ' ' + q(INDEX))
        if h.rh(s, INDEX) != GOOD: raise RuntimeError('READBACK_FAILED')
        ev = {'result':'PASS', 'at':datetime.now(timezone.utc).isoformat(), 'backup':backup,
              'source':SOURCE, 'beforeHash':EXPECTED, 'restoredHash':GOOD,
              'scriptReferences':refs, 'missingFiles':[], 'playerWrites':0, 'restarts':0}
        (OUT/'manifest_recovery.json').write_text(json.dumps(ev,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        print(json.dumps({k:v for k,v in ev.items() if k!='scriptReferences'},ensure_ascii=False))
    finally:
        s.close()

if __name__ == '__main__': main()
