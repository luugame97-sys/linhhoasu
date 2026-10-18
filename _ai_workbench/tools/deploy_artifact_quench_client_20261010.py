from __future__ import annotations
import hashlib, json, shlex
from datetime import datetime, timezone
from pathlib import Path
import importlib.util

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('release_helper', ROOT / '_ai_workbench/tools/release_artifact_quench_fix_20261009.py')
helper = importlib.util.module_from_spec(spec); spec.loader.exec_module(helper)
LOCAL = ROOT / 'linhhoasu/webgame/game'
FILES = [('index.html', 'index.html'), ('js/lhs-artifact-quench-v1.js', 'lhs-artifact-quench-v1.js')]
REMOTE = '/linhhoasu/webgame/game'

def sha(path: Path): return hashlib.sha256(path.read_bytes()).hexdigest()
def q(v): return shlex.quote(v)
def main():
    ssh = helper.connect(); stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    backup = '/linhhoasu/_ai_workbench/backups/artifact_quench_client_20261010_' + stamp
    stage = '/linhhoasu/_ai_workbench/temp/artifact_quench_client_20261010_' + stamp
    evidence = {'at': datetime.now(timezone.utc).isoformat(), 'result': 'FAILED', 'productionWrites': 0, 'playerWrites': 0}
    try:
        # Preserve the exact pre-change live index; the local index contains
        # older unrelated script markers and must never replace that baseline.
        baseline = (ROOT / '_ai_workbench/temp/artifact_quench_release_20261010/index.before.html').read_bytes()
        if hashlib.sha256(baseline).hexdigest() != 'e602b633070aba638abfa1de8a4893b0eefb1779c62380a2d29a683eeaef5f27':
            raise RuntimeError('INDEX_BASELINE_CHANGED')
        marker = b'"js/lhs-feature-day1-v1.js?v=20261009_level_unlock_v2",'
        if baseline.count(marker) != 1: raise RuntimeError('INDEX_MARKER_COUNT')
        newline = b'\r\n' if b'\r\n' in baseline else b'\n'
        index_data = baseline.replace(marker, marker + newline + b'\t\t"js/lhs-artifact-quench-v1.js?v=20261010_quench_v1",')
        candidate_data = {'index.html': index_data, 'js/lhs-artifact-quench-v1.js': (LOCAL / 'js/lhs-artifact-quench-v1.js').read_bytes()}
        expected = {'index.html': 'a370b423e1a4efcb32a087c666c0caee2938a2668b5de9ce731433f961780173',
                    'js/lhs-artifact-quench-v1.js': '619339f210c624a5c0c96a1247e8c14b5e4abc3f203de89bc5f67777d02dd8e1'}
        for rel, _ in FILES:
            if helper.rh(ssh, REMOTE+'/'+rel) != expected[rel]: raise RuntimeError('PREFLIGHT_CAS:'+rel)
        candidates = {rel: hashlib.sha256(data).hexdigest() for rel, data in candidate_data.items()}
        evidence['expectedHashes'] = expected; evidence['candidateHashes'] = candidates
        helper.run(ssh, 'install -d -m 700 ' + q(stage) + ' ' + q(backup))
        for rel, name in FILES:
            target = REMOTE + '/' + rel; rs = stage + '/' + rel; rb = backup + '/' + rel
            helper.run(ssh, 'install -d -m 700 ' + q(rs.rsplit('/', 1)[0]) + ' ' + q(rb.rsplit('/', 1)[0]))
            with ssh.open_sftp() as sf:
                with sf.open(rs, 'wb') as f: f.write(candidate_data[rel])
            if helper.rh(ssh, rs) != candidates[rel]: raise RuntimeError('STAGE_HASH:' + rel)
            if expected[rel]:
                helper.run(ssh, 'cp -p -- ' + q(target) + ' ' + q(rb))
                if helper.rh(ssh, rb) != expected[rel]: raise RuntimeError('BACKUP_HASH:' + rel)
        for rel, _ in FILES:
            target = REMOTE + '/' + rel; rs = stage + '/' + rel; tmp = target + '.artifact_quench_client.tmp'
            if helper.rh(ssh, target) != expected[rel]: raise RuntimeError('CAS:' + rel)
            mode = 'chmod --reference=' + q(target) + ' ' + q(tmp) + ' && chown --reference=' + q(target) + ' ' + q(tmp) if expected[rel] else 'chmod 644 ' + q(tmp) + ' && chown root:www ' + q(tmp)
            helper.run(ssh, 'cp -- ' + q(rs) + ' ' + q(tmp) + ' && ' + mode + ' && mv -f -- ' + q(tmp) + ' ' + q(target))
            if helper.rh(ssh, target) != candidates[rel]: raise RuntimeError('FINAL_HASH:' + rel)
        index = helper.run(ssh, 'grep -F "lhs-artifact-quench-v1.js?v=20261010_quench_v1" ' + q(REMOTE + '/index.html') + ' | wc -l').strip()
        js = helper.run(ssh, 'node --check ' + q(REMOTE + '/js/lhs-artifact-quench-v1.js') + ' >/dev/null && echo PASS').strip()
        if index != '1' or js != 'PASS': raise RuntimeError('STATIC_VERIFY')
        evidence.update({'result': 'PASS', 'backup': backup, 'installedHashes': {rel: helper.rh(ssh, REMOTE+'/'+rel) for rel, _ in FILES}, 'indexMarker': index, 'syntax': js, 'verifiedAt': datetime.now(timezone.utc).isoformat()})
    except Exception as exc:
        evidence['error'] = str(exc); raise
    finally:
        (ROOT / '_ai_workbench/temp/artifact_quench_release_20261010/client_release.json').write_text(json.dumps(evidence, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
        try: helper.run(ssh, 'rm -rf -- ' + q(stage), 30)
        except Exception: pass
        ssh.close()
    print(json.dumps(evidence, ensure_ascii=False))
if __name__ == '__main__': main()
