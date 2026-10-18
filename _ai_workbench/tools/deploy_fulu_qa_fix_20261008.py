"""Deploy the reviewed Fulu server/client candidate with backup and CAS.

Scope: Activity52TaskService.js, lhs-fulu-safe-v1.js, game/index.html only.
No player/account writes. Unsafe event exposure remains closed.
"""
from __future__ import annotations

import base64
import hashlib
import json
import shlex
import time
from datetime import datetime, timezone
from pathlib import Path

from skin_incident_remote import connect, run

ROOT = Path(__file__).resolve().parents[2]
REMOTE = '/linhhoasu'
APP = REMOTE + '/lhs/newServer'
OUT = ROOT / '_ai_workbench/temp/fulu_qa_20261008/deploy'
MANIFEST = OUT / 'release.json'
STAGE = REMOTE + '/_ai_workbench/temp/fulu_qa_20261008/deploy/candidate'
NODES = {
    'lhs-s1001': 8080, 'lhs-s1002': 8083, 'lhs-s1003': 8084,
    'lhs-s1004': 8085, 'lhs-s1005': 8086, 'lhs-s1006': 8087,
    'lhs-s1007': 8088,
}

SERVER_REL = 'lhs/newServer/src/services/Activity52TaskService.js'
CLIENT_REL = 'webgame/game/js/lhs-fulu-safe-v1.js'
INDEX_REL = 'webgame/game/index.html'
SERVER_BEFORE = '06f305f2a62ba6feedf136d928a55607b098cb3a8cf2a38b8cb8e482ca42f50f'
CLIENT_BEFORE = '5afd8377be87a2e6e214233e3e30c51fa83c3a7d1a0e282f223e6d40f80e9f4b'
INDEX_BEFORE = 'f9905732f5e01f290696ed9b969e246f7eb74afb4512100d9358cf9b38ecb671'
CLIENT_VERSION = '20261008_fulu_safe_v2'
OLD_CLIENT_ANCHOR = 'lhs-fulu-safe-v1.js?v=20261007_fulu_safe_v1'
NEW_CLIENT_ANCHOR = f'lhs-fulu-safe-v1.js?v={CLIENT_VERSION}'


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def remote_sha(ssh, path: str) -> str:
    return run(ssh, f"sha256sum -- {shlex.quote(path)} | awk '{{print $1}}'").strip().lower()


def remote_exists(ssh, path: str) -> bool:
    return run(ssh, f"test -e {shlex.quote(path)} && echo yes || echo no").strip() == 'yes'


def upload(ssh, path: str, data: bytes) -> None:
    run(ssh, f"mkdir -p {shlex.quote(path.rsplit('/', 1)[0])}")
    stdin, stdout, stderr = ssh.exec_command(f"base64 -d > {shlex.quote(path)}", timeout=120)
    stdin.write(base64.b64encode(data))
    stdin.channel.shutdown_write()
    err = stderr.read().decode('utf-8', 'replace')
    rc = stdout.channel.recv_exit_status()
    if rc:
        raise RuntimeError(f'UPLOAD_FAILED:{path}:{err[-500:]}')
    if remote_sha(ssh, path) != digest(data):
        raise RuntimeError(f'UPLOAD_HASH:{path}')


def read_remote(ssh, path: str) -> bytes:
    with ssh.open_sftp() as sftp:
        with sftp.open(path, 'rb') as stream:
            return stream.read()


def ready(ssh, node: str) -> dict:
    port = NODES[node]
    for _ in range(40):
        try:
            raw = run(ssh, f'curl -fsS --max-time 5 http://127.0.0.1:{port}/ready')
            body = json.loads(raw)
            if body.get('status') == 'ok' and body.get('checks', {}).get('mongo') is True and body.get('checks', {}).get('redis') is True:
                return body
        except Exception:
            pass
        time.sleep(1)
    raise RuntimeError(f'NOT_READY:{node}')


def snapshot_processes(ssh) -> list[dict]:
    rows = json.loads(run(ssh, 'pm2 jlist'))
    return [
        {
            'name': row.get('name'), 'pid': row.get('pid'),
            'status': row.get('pm2_env', {}).get('status'),
            'restarts': row.get('pm2_env', {}).get('restart_time'),
        }
        for row in rows if row.get('name', '').startswith('lhs-')
    ]


def save(manifest: dict) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def build_candidate_index(ssh) -> bytes:
    current = read_remote(ssh, REMOTE + '/' + INDEX_REL)
    text = current.decode('utf-8')
    if text.count(OLD_CLIENT_ANCHOR) != 1:
        raise RuntimeError('INDEX_ANCHOR_MISMATCH')
    return text.replace(OLD_CLIENT_ANCHOR, NEW_CLIENT_ANCHOR).encode('utf-8')


def deploy() -> None:
    server_file = ROOT / '_ai_workbench/temp/fulu_qa_20261008/candidate/lhs/newServer/src/services/Activity52TaskService.js'
    client_file = ROOT / '_ai_workbench/temp/fulu_qa_20261008/candidate/webgame/game/js/lhs-fulu-safe-v1.js'
    if not server_file.exists() or not client_file.exists():
        raise RuntimeError('CANDIDATE_MISSING')
    server_data = server_file.read_bytes()
    client_data = client_file.read_bytes()
    if digest(server_data) != 'c425c87fffee81cbf8a16c0ea2b1a6dc4ffea152f2c07f0e50ac430d1ab494d1': raise RuntimeError('SERVER_CANDIDATE_HASH')
    if digest(client_data) != '1f96a613015d47fe5f0b99fa53697f78cca9cd1757c3b02c2e2984d4d15a15b3': raise RuntimeError('CLIENT_CANDIDATE_HASH')
    index_data = None
    manifest = {
        'version': 'fulu_qa_fix_20261008_v1', 'phase': 'candidate',
        'scope': [SERVER_REL, CLIENT_REL, INDEX_REL],
        'serverCandidate': digest(server_data), 'clientCandidate': digest(client_data),
        'clientVersion': CLIENT_VERSION, 'playerWrites': 0,
    }
    with connect() as ssh:
        expected = {
            SERVER_REL: SERVER_BEFORE, CLIENT_REL: CLIENT_BEFORE, INDEX_REL: INDEX_BEFORE,
        }
        actual = {rel: remote_sha(ssh, REMOTE + '/' + rel) for rel in expected}
        manifest['preHashes'] = actual
        if actual != expected:
            raise RuntimeError(f'PREIMAGE_CAS:{actual}')
        index_data = build_candidate_index(ssh)
        manifest['indexCandidate'] = digest(index_data)
        manifest['indexBytes'] = len(index_data)
        manifest['preProcesses'] = snapshot_processes(ssh)
        manifest['preReady'] = {node: ready(ssh, node) for node in NODES}
        backup = f"{REMOTE}/_ai_workbench/backups/fulu_qa_fix_20261008_{datetime.now(timezone.utc).strftime('%H%M%S')}"
        manifest['backup'] = backup
        if remote_exists(ssh, backup): raise RuntimeError('BACKUP_EXISTS')
        run(ssh, f"mkdir -p {shlex.quote(backup)}")
        for rel in [SERVER_REL, CLIENT_REL, INDEX_REL]:
            src = REMOTE + '/' + rel
            dst = backup + '/' + rel
            run(ssh, f"mkdir -p {shlex.quote(dst.rsplit('/', 1)[0])} && cp -p {shlex.quote(src)} {shlex.quote(dst)}")
            if remote_sha(ssh, dst) != expected[rel]: raise RuntimeError(f'BACKUP_HASH:{rel}')
        upload(ssh, STAGE + '/' + SERVER_REL, server_data)
        upload(ssh, STAGE + '/' + CLIENT_REL, client_data)
        upload(ssh, STAGE + '/' + INDEX_REL, index_data)
        for rel, data in [(SERVER_REL, server_data), (CLIENT_REL, client_data), (INDEX_REL, index_data)]:
            target = REMOTE + '/' + rel
            temp = target + '.fulu_qa_fix_20261008.tmp'
            if remote_sha(ssh, target) != expected[rel]: raise RuntimeError(f'FINAL_CAS:{rel}')
            run(ssh, f"cp {shlex.quote(STAGE+'/'+rel)} {shlex.quote(temp)} && chmod --reference={shlex.quote(target)} {shlex.quote(temp)} && chown --reference={shlex.quote(target)} {shlex.quote(temp)}")
            if remote_sha(ssh, temp) != digest(data): raise RuntimeError(f'TEMP_HASH:{rel}')
            run(ssh, f"mv -f {shlex.quote(temp)} {shlex.quote(target)}")
            if remote_sha(ssh, target) != digest(data): raise RuntimeError(f'INSTALLED_HASH:{rel}')
            manifest.setdefault('published', []).append(rel)
            save(manifest)
        # Shared Node source is loaded by all game processes; restart all seven.
        for node in NODES:
            run(ssh, f"pm2 restart {shlex.quote(node)}")
            manifest.setdefault('rollingReady', {})[node] = ready(ssh, node)
            save(manifest)
        manifest['postProcesses'] = snapshot_processes(ssh)
        manifest['finalReady'] = {node: ready(ssh, node) for node in NODES}
        # Verify served static artifacts and the new cache marker from local port.
        served_client = run(ssh, f"curl -fsS --max-time 15 http://127.0.0.1:81/js/lhs-fulu-safe-v1.js?v={CLIENT_VERSION} | sha256sum", 25).split()[0]
        served_index = run(ssh, 'curl -fsS --max-time 15 http://127.0.0.1:81/index.html', 25)
        if served_client != digest(client_data): raise RuntimeError('SERVED_CLIENT_HASH')
        if NEW_CLIENT_ANCHOR not in served_index: raise RuntimeError('SERVED_INDEX_MARKER')
        manifest['servedClientHash'] = served_client
        manifest['servedIndexMarker'] = NEW_CLIENT_ANCHOR
        manifest['phase'] = 'verified_qa_pending'
        manifest['result'] = 'PASS'
        manifest['verifiedAt'] = datetime.now(timezone.utc).isoformat()
        save(manifest)
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


def build_candidate_index() -> bytes:
    current = (ROOT / '_ai_workbench/temp/fulu_qa_20261008/before/webgame/game/index.html').read_text(encoding='utf-8')
    if current.count(OLD_CLIENT_ANCHOR) != 1:
        raise RuntimeError('INDEX_BASE_ANCHOR_MISMATCH')
    return current.replace(OLD_CLIENT_ANCHOR, NEW_CLIENT_ANCHOR).encode('utf-8')


def resume_published() -> None:
    if not MANIFEST.exists(): raise RuntimeError('MANIFEST_MISSING')
    manifest = json.loads(MANIFEST.read_text(encoding='utf-8'))
    if manifest.get('phase') != 'candidate' or manifest.get('published') != [SERVER_REL, CLIENT_REL, INDEX_REL]:
        raise RuntimeError('RESUME_PHASE_INVALID')
    server_data = (ROOT / '_ai_workbench/temp/fulu_qa_20261008/candidate/lhs/newServer/src/services/Activity52TaskService.js').read_bytes()
    client_data = (ROOT / '_ai_workbench/temp/fulu_qa_20261008/candidate/webgame/game/js/lhs-fulu-safe-v1.js').read_bytes()
    index_data = build_candidate_index()
    candidates = {SERVER_REL: digest(server_data), CLIENT_REL: digest(client_data), INDEX_REL: digest(index_data)}
    with connect() as ssh:
        installed = {rel: remote_sha(ssh, REMOTE + '/' + rel) for rel in candidates}
        if installed != candidates: raise RuntimeError(f'RESUME_HASH_INVALID:{installed}')
        for node in NODES:
            run(ssh, f"pm2 restart {shlex.quote(node)}")
            manifest.setdefault('rollingReady', {})[node] = ready(ssh, node)
            save(manifest)
        manifest['postProcesses'] = snapshot_processes(ssh)
        manifest['finalReady'] = {node: ready(ssh, node) for node in NODES}
        served = run(ssh, f"curl -fsS --max-time 15 http://127.0.0.1:81/js/lhs-fulu-safe-v1.js?v={CLIENT_VERSION} | sha256sum").split()[0]
        index = run(ssh, 'curl -fsS --max-time 15 http://127.0.0.1:81/index.html')
        if served != candidates[CLIENT_REL]: raise RuntimeError('SERVED_CLIENT_HASH')
        if NEW_CLIENT_ANCHOR not in index: raise RuntimeError('SERVED_INDEX_MARKER')
        manifest.update({'servedClientHash': served, 'servedIndexMarker': NEW_CLIENT_ANCHOR,
                         'phase': 'verified_qa_pending', 'result': 'PASS',
                         'verifiedAt': datetime.now(timezone.utc).isoformat()})
        save(manifest)
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    import sys
    resume_published() if len(sys.argv) > 1 and sys.argv[1] == 'resume' else deploy()
