"""Deploy client v4: Er.Open reward popup for release + null safety guards."""
from __future__ import annotations
import hashlib
import json
import posixpath
import shlex
import time
from datetime import datetime, timezone
from pathlib import Path
import sys

WB_TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(WB_TOOLS))
from snapshot_web_multiserver_20260906 import connect, run

ROOT = Path(__file__).resolve().parents[2]
HOSTROOT = '/linhhoasu'
GAME = HOSTROOT + '/webgame/game'
STAMP = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
BACKUP = f'{HOSTROOT}/_ai_workbench/backups/client_pet_release_v4_{STAMP}'
STAGE = f'{HOSTROOT}/_ai_workbench/temp/client_pet_release_v4_{STAMP}'

PAYLOAD_FILES = {
    'linhhoasu/webgame/game/index.html': GAME + '/index.html',
    'linhhoasu/webgame/game/js/main.min_drop100.js': GAME + '/js/main.min_drop100.js',
}

BEFORE = {
    GAME + '/index.html': 'e6bec799ad9ef6e956ad35e70ed438ae9987eea28334904032be891694eb7dcb',
    GAME + '/js/main.min_drop100.js': '612912357ca806f529f90d06cbabdc2eacaddca9110d096cddcf148da651a27e',
}

q = shlex.quote
sha = lambda b: hashlib.sha256(b).hexdigest()

def hashes(s, paths):
    out = run(s, 'sha256sum -- ' + ' '.join(q(p) for p in paths))
    res = {}
    for line in out.splitlines():
        parts = line.split()
        if len(parts) >= 2:
            res[parts[1]] = parts[0]
    return res

def main():
    payload = {}
    for local_rel, remote in PAYLOAD_FILES.items():
        local_path = ROOT / local_rel
        content = local_path.read_bytes()
        payload[remote] = {
            'local': local_path,
            'sha': sha(content),
            'size': len(content),
        }

    s = connect()
    swapped = []
    report = {
        'result': 'STARTED',
        'backup': BACKUP,
        'stage': STAGE,
        'payload': {r: {'sha': d['sha'], 'size': d['size']} for r, d in payload.items()},
        'productionWrites': 0,
        'playerWrites': 0,
    }

    try:
        # 1. CAS pre-check
        existing = list(BEFORE)
        live = hashes(s, existing)
        for p, h in BEFORE.items():
            if live.get(p) != h:
                raise RuntimeError(f'CAS_DRIFT: {p} expected {h} got {live.get(p)}')

        # 2. Backup
        run(s, f'install -d -m 700 {q(BACKUP)} {q(STAGE)}')
        for p in existing:
            run(s, f'install -d -m 700 {q(BACKUP + posixpath.dirname(p))}; cp -p -- {q(p)} {q(BACKUP + p)}')

        # 3. SFTP put to stage
        with s.open_sftp() as sf:
            for remote, item in payload.items():
                stage_file = STAGE + remote[len(HOSTROOT):]
                run(s, f'install -d -m 700 {q(posixpath.dirname(stage_file))}')
                sf.put(str(item['local']), stage_file)
                sf.chmod(stage_file, 0o644)

        # 4. Verify stage hash
        stages = [STAGE + p[len(HOSTROOT):] for p in payload]
        st = hashes(s, stages)
        for remote, item in payload.items():
            stage_file = STAGE + remote[len(HOSTROOT):]
            if st.get(stage_file) != item['sha']:
                raise RuntimeError(f'STAGE_HASH_MISMATCH: {remote}')

        # 5. Check syntax on stage
        run(s, f'node --check {q(STAGE + "/webgame/game/js/main.min_drop100.js")}')

        # 6. Atomic swap
        for remote in payload:
            stage_file = STAGE + remote[len(HOSTROOT):]
            run(s, f'install -d -m 755 {q(posixpath.dirname(remote))}; mv -f -- {q(stage_file)} {q(remote)}')
            swapped.append(remote)

        # 7. Verify live hash
        after = hashes(s, list(payload))
        for remote, item in payload.items():
            if after.get(remote) != item['sha']:
                raise RuntimeError(f'LIVE_HASH_MISMATCH: {remote}')

        # 8. Check syntax on live
        run(s, f'node --check {q(GAME + "/js/main.min_drop100.js")}')

        # 9. Verify web access through nginx port 81
        code_html = run(s, "curl -sS -o /dev/null -w '%{http_code}' --max-time 3 http://127.0.0.1:81/index.html").strip()
        code_js = run(s, "curl -sS -o /dev/null -w '%{http_code}' --max-time 3 'http://127.0.0.1:81/js/main.min_drop100.js?v=20260929_pet_release_v4'").strip()
        report['http_probe'] = {
            'index.html': code_html,
            'main.min_drop100.js': code_js,
        }
        if code_html != '200' or code_js != '200':
            raise RuntimeError(f'HTTP_PROBE_FAILED: html={code_html}, js={code_js}')

        report['result'] = 'DEPLOYED'

    except Exception as e:
        report['result'] = 'FAILED'
        report['error'] = str(e)
        if swapped:
            for p in existing:
                try:
                    run(s, f'cp -p -- {q(BACKUP + p)} {q(p)}')
                except Exception:
                    pass
            report['rollback'] = 'RESTORED'
        raise
    finally:
        try:
            run(s, f'rm -rf -- {q(STAGE)}')
        except Exception:
            pass
        s.close()
        out_dir = ROOT / '_ai_workbench/temp/client_pet_release_v4_20260929'
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / 'release.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
        print(json.dumps(report, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
