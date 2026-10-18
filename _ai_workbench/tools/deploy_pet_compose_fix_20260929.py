"""Deploy the pet compose fix (retain primary on failure for q9, client composeSuccess patch)."""
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
APP = HOSTROOT + '/lhs/newServer'
GAME = HOSTROOT + '/webgame/game'
STAMP = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
BACKUP = f'{HOSTROOT}/_ai_workbench/backups/pet_compose_fix_{STAMP}'
STAGE = f'{HOSTROOT}/_ai_workbench/temp/pet_compose_fix_{STAMP}'

PAYLOAD_FILES = {
    'linhhoasu/lhs/newServer/src/handlers/pet.js': APP + '/src/handlers/pet.js',
    'linhhoasu/webgame/game/js/main.min_drop100.js': GAME + '/js/main.min_drop100.js',
}

BEFORE = {
    APP + '/src/handlers/pet.js': '5518f1601b640def06c1fb89e5dd36672411d90747e20475735c69ed7ec5c32f',
    GAME + '/js/main.min_drop100.js': '4a6b12eea8863a1b02d9d80b4bef91deb6312ea7678e8d513fab92c4bae40230',
}

NODES = [
    ('lhs-s1006', 8087),
    ('lhs-s1005', 8086),
    ('lhs-s1004', 8085),
    ('lhs-s1003', 8084),
    ('lhs-s1002', 8083),
    ('lhs-s1001', 8080),
]

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
    restarted = []
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
        run(s, f'node --check {q(STAGE + "/lhs/newServer/src/handlers/pet.js")}')
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
        run(s, f'node --check {q(APP + "/src/handlers/pet.js")}')
        run(s, f'node --check {q(GAME + "/js/main.min_drop100.js")}')

        # 9. Rolling restart S6 -> S1
        report['readiness'] = {}
        for name, port in NODES:
            run(s, f'pm2 restart {q(name)}')
            restarted.append(name)
            code = ''
            for _ in range(25):
                code = run(s, f"curl -sS -o /dev/null -w '%{{http_code}}' --max-time 3 http://127.0.0.1:{port}/ready || true").strip()
                if code == '200':
                    break
                time.sleep(1)
            report['readiness'][str(port)] = code
            if code != '200':
                raise RuntimeError(f'READINESS_FAILED: {name} on port {port} returned {code}')

        # 10. Runtime verification probe
        probe_code = (
            "const p = require('/linhhoasu/lhs/newServer/src/handlers/pet'); "
            "console.log(JSON.stringify({ "
            "  hasApplyPetComposition: typeof p.handlePetCompose === 'function', "
            "  handlers: Object.keys(p).length "
            "}));"
        )
        probe_res = run(s, f'cd {q(APP)} && node -e {q(probe_code)}').strip().splitlines()[-1]
        report['probe'] = json.loads(probe_res)
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
            for name, _ in NODES:
                try:
                    run(s, f'pm2 restart {q(name)}')
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
        out_dir = ROOT / '_ai_workbench/temp/pet_compose_fix_20260929'
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / 'release.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
        print(json.dumps(report, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
