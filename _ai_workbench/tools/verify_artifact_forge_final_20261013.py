"""Read-only post-deploy receipt for artifact forge; no gameplay RPC or player writes."""
import hashlib
import importlib.util
import json
import shlex
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '_ai_workbench/temp/artifact_forge_20261013'
CAND = OUT / 'candidate'
spec = importlib.util.spec_from_file_location('transport', ROOT / '_ai_workbench/tools/release_artifact_quench_fix_20261009.py')
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)

FILES = {
    'server/artifact.js': (CAND / 'artifact.js', helper.REMOTE_ROOT + '/src/handlers/artifact.js'),
    'server/WSServer.js': (CAND / 'WSServer.js', helper.REMOTE_ROOT + '/src/net/WSServer.js'),
    'client/lhs-artifact-forge-v1.js': (CAND / 'lhs-artifact-forge-v1.js', '/linhhoasu/webgame/game/js/lhs-artifact-forge-v1.js'),
    'client/index.html': (CAND / 'index.html', '/linhhoasu/webgame/game/index.html'),
}

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    ssh = helper.connect()
    try:
        result = {
            'at': datetime.now(timezone.utc).isoformat(),
            'mode': 'read-only',
            'productionWrites': 0,
            'playerWrites': 0,
            'nativeE2E': False,
            'candidateHashes': {rel: digest(local) for rel, (local, _remote) in FILES.items()},
        }
        result['liveHashes'] = {rel: helper.rh(ssh, remote) for rel, (_local, remote) in FILES.items()}
        assert result['liveHashes'] == result['candidateHashes'], 'LIVE_HASH_MISMATCH'
        result['ready'] = {name: json.loads(helper.run(ssh, f'curl -fsS --max-time 10 http://127.0.0.1:{port}/ready', 15)) for name, port in helper.NODES}
        assert all(row.get('status') == 'ok' and row.get('checks', {}).get('mongo') and row.get('checks', {}).get('redis') for row in result['ready'].values()), 'READY_CHECK'
        result['served'] = {}
        for rel, url in [('client/lhs-artifact-forge-v1.js', 'js/lhs-artifact-forge-v1.js'), ('client/index.html', 'index.html')]:
            pipeline = 'curl -fsS --max-time 30 ' + shlex.quote('https://linhhoasu.lol/' + url) + " | sha256sum | awk '{print $1}'"
            served = helper.run(ssh, 'bash -o pipefail -c ' + shlex.quote(pipeline), 40).strip()
            assert served == result['candidateHashes'][rel], 'SERVED_HASH:' + rel
            result['served'][rel] = served
        result['result'] = 'PASS'
        (OUT / 'final_verification.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(json.dumps({'result': 'PASS', 'ready': len(result['ready']), 'served': result['served'], 'nativeE2E': False}, ensure_ascii=False))
    finally:
        ssh.close()

if __name__ == '__main__':
    main()
