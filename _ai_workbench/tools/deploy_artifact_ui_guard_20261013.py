"""Deploy the narrow artifact renderer guard with exact-hash CAS and cache-busted index."""
from pathlib import Path
import hashlib, json, shlex, sys
from datetime import datetime, timezone
from release_artifact_quench_fix_20261009 import connect, run, rh, NODES

sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(__file__).resolve().parents[2]
MAIN = '/linhhoasu/webgame/game/js/main.min_drop200.js'
INDEX = '/linhhoasu/webgame/game/index.html'
BASE = ROOT / '_ai_workbench/temp/ui_freeze_20261013'
STAMP = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
BACKUP = f'/linhhoasu/_ai_workbench/backups/artifact_ui_guard_20261013_{STAMP}'
STAGE = f'/linhhoasu/_ai_workbench/temp/artifact_ui_guard_20261013_{STAMP}'
sha = lambda b: hashlib.sha256(b).hexdigest()
q = shlex.quote

def main():
    ssh = connect()
    event = {'startedAt': datetime.now(timezone.utc).isoformat(), 'result': 'FAILED', 'productionFileWrites': 0, 'playerWrites': 0, 'restarts': 0}
    published = []
    try:
        with ssh.open_sftp() as sftp:
            live_main = sftp.open(MAIN, 'rb').read()
            live_index = sftp.open(INDEX, 'rb').read()
        candidate_main = (BASE / 'main.candidate.js').read_bytes()
        index_text = live_index.decode('utf-8')
        old_marker = 'js/main.min_drop200.js?v=20261011_newyear_guard_v1'
        new_marker = 'js/main.min_drop200.js?v=20261013_artifact_ui_guard_v1'
        if index_text.count(old_marker) != 1:
            raise RuntimeError('INDEX_CACHE_MARKER_CHANGED')
        candidate_index = index_text.replace(old_marker, new_marker).encode('utf-8')
        expected = {'main': sha(live_main), 'index': sha(live_index)}
        cand = {'main': sha(candidate_main), 'index': sha(candidate_index)}
        if cand['main'] == expected['main'] or cand['index'] == expected['index']:
            raise RuntimeError('CANDIDATE_EQUALS_LIVE')
        event.update(expected=expected, candidate=cand, indexMarker={'old': old_marker, 'new': new_marker})
        run(ssh, 'install -d -m 700 -- ' + q(BACKUP) + ' ' + q(STAGE))
        event['readiness'] = {name: run(ssh, f"curl -fsS --max-time 10 -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{port}/ready").strip() for name, port in NODES}
        if any(v != '200' for v in event['readiness'].values()): raise RuntimeError('READY_BASELINE')
        with ssh.open_sftp() as sftp:
            for label, target, content in [('main', MAIN, candidate_main), ('index', INDEX, candidate_index)]:
                backup = BACKUP + '/' + label
                sftp.putfo(__import__('io').BytesIO(live_main if label == 'main' else live_index), backup)
                if rh(ssh, backup) != expected[label]: raise RuntimeError('BACKUP_HASH:' + label)
                stage = STAGE + '/' + label
                sftp.putfo(__import__('io').BytesIO(content), stage)
                if rh(ssh, stage) != cand[label]: raise RuntimeError('STAGE_HASH:' + label)
        for label, target in [('main', MAIN), ('index', INDEX)]:
            if rh(ssh, target) != expected[label]: raise RuntimeError('PUBLISH_CAS:' + label)
            stage = STAGE + '/' + label
            tmp = target + '.artifact_ui_guard_20261013.tmp'
            run(ssh, 'cp -- ' + q(stage) + ' ' + q(tmp))
            run(ssh, 'chmod --reference=' + q(target) + ' ' + q(tmp) + ' && chown --reference=' + q(target) + ' ' + q(tmp))
            if rh(ssh, tmp) != cand[label]: raise RuntimeError('TEMP_HASH:' + label)
            run(ssh, 'mv -f -- ' + q(tmp) + ' ' + q(target))
            if rh(ssh, target) != cand[label]: raise RuntimeError('FINAL_HASH:' + label)
            published.append((label, target))
            event['productionFileWrites'] += 1
        served_main = run(ssh, "curl -fsS --max-time 30 'https://linhhoasu.lol/js/main.min_drop200.js?v=20261013_artifact_ui_guard_v1' | sha256sum | awk '{print $1}'", 40).strip()
        served_index = run(ssh, "curl -fsS --max-time 30 'https://linhhoasu.lol/index.html?ui_guard=20261013' | sha256sum | awk '{print $1}'", 40).strip()
        event['served'] = {'main': served_main, 'index': served_index}
        if served_main != cand['main'] or served_index != cand['index']: raise RuntimeError('SERVED_HASH_MISMATCH')
        event.update(result='PASS', completedAt=datetime.now(timezone.utc).isoformat(), backup=BACKUP)
        (BASE / 'deploy.json').write_text(json.dumps(event, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(json.dumps(event, ensure_ascii=False, indent=2))
    except Exception as exc:
        event['error'] = str(exc)
        for label, target in reversed(published):
            try:
                if rh(ssh, target) == event.get('candidate', {}).get(label):
                    backup = BACKUP + '/' + label
                    tmp = target + '.artifact_ui_guard_rollback.tmp'
                    run(ssh, 'cp -- ' + q(backup) + ' ' + q(tmp) + ' && chmod --reference=' + q(target) + ' ' + q(tmp) + ' && chown --reference=' + q(target) + ' ' + q(tmp) + ' && mv -f -- ' + q(tmp) + ' ' + q(target))
            except Exception as rollback_error:
                event.setdefault('rollbackErrors', []).append(str(rollback_error))
        (BASE / 'deploy.json').write_text(json.dumps(event, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        raise
    finally:
        try: run(ssh, 'rm -rf -- ' + q(STAGE), 30)
        except Exception: pass
        ssh.close()

if __name__ == '__main__': main()
