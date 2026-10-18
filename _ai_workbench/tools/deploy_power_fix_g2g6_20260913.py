"""Scoped G2-G6 power fix deployment with remote CAS and post-checks."""
import hashlib
import json
import shlex
from datetime import datetime, timezone
from pathlib import Path

from snapshot_web_multiserver_20260906 import connect, run

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '_ai_workbench' / 'temp' / 'power_fix_g2g6_20260913'
BACKUP = ROOT / '_ai_workbench' / 'backups' / 'power_fix_g2g6_20260913_pre'
REMOTE_ROOT = '/linhhoasu'

FILES = [
    'lhs/newServer/src/services/BattleService.js',
    'lhs/newServer/src/services/PowerDisplayService.js',
    'lhs/newServer/src/services/NativeBonusService.js',
    'lhs/newServer/src/handlers/playerPayload.js',
    'lhs/newServer/src/handlers/basic.js',
    'lhs/newServer/src/handlers/arena.js',
    'lhs/newServer/src/handlers/chat.js',
    'lhs/newServer/src/handlers/activity.js',
    'lhs/newServer/src/handlers/cross-rival.js',
    'lhs/newServer/src/handlers/farm.js',
    'lhs/newServer/src/handlers/guild.js',
    'lhs/newServer/src/handlers/island.js',
    'lhs/newServer/src/handlers/temple.js',
    'lhs/newServer/src/handlers/dungeon.js',
    'lhs/newServer/src/handlers/tower.js',
    'webgame/game/index.html',
    'webgame/game/js/lhs-power-display-v1.js',
]

# Read-only inventory immediately before this release. A mismatch means the
# remote source changed and the deployment stops without overwriting it.
EXPECTED_REMOTE = {
    'lhs/newServer/src/services/BattleService.js': '1416b1270726acbd3afb7ea07d34f5cae99763611a025cc093967b0d96b3e484',
    'lhs/newServer/src/services/PowerDisplayService.js': None,
    'lhs/newServer/src/services/NativeBonusService.js': None,
    'lhs/newServer/src/handlers/playerPayload.js': 'a6e18b698cfe0577251e8f9c807f09dbe6d7d274ed93461e07e06c6a23e20714',
    'lhs/newServer/src/handlers/basic.js': '873762fe47f755338339d490dfede4303869697d5b29fe3dd5576b956d5b9653',
    'lhs/newServer/src/handlers/arena.js': '420e6359b3edbaf0207650c5a97e0917f862e4861f0317926a70b1754d8f8149',
    'lhs/newServer/src/handlers/chat.js': '81c9959831faf60df21d7301d2451855bca2ce37d327da469958d5e78d0d8d8d',
    'lhs/newServer/src/handlers/activity.js': '8a852bce19886b361b5add372e20738457fb666d51fd5d08e1eaec177ad6259e',
    'lhs/newServer/src/handlers/cross-rival.js': '7819fc5bbf31212dab38e9a4198b14f621ed1437aa593e23fa9192d69d5c7f65',
    'lhs/newServer/src/handlers/farm.js': '97991f57f3a9abd607c26341defdb7ac3476c384f3cee255e0cba07e10da2eb4',
    'lhs/newServer/src/handlers/guild.js': 'b83f027661272e2476bb32278c3212fbe7c6101dcaf0441f1633ae877eec467d',
    'lhs/newServer/src/handlers/island.js': 'f2a5a01fc71a14aea09615bb90eb08b81fbf4dead923974ffa89c28d59b9f159',
    'lhs/newServer/src/handlers/temple.js': '72ccdbd87fce28dba97a864565ef8e76d0ec451f428e32f659bf246a11b6cfc8',
    'lhs/newServer/src/handlers/dungeon.js': 'ee51f6f81cbf6df3b9da802eb98818cdd6c91d76f17598e30f1259400ad442d3',
    'lhs/newServer/src/handlers/tower.js': '91dc0b6c04eccdfb629f6e97266276bea0852cf3f997bfe075afa4cd4ba60234',
    'webgame/game/index.html': '6920040a73976b75ddc3948e209110e497e40cbd1eb0de8a1b4d086d88c3890e',
    'webgame/game/js/lhs-power-display-v1.js': None,
}

GAME_PROCESSES = ['lhs-s1001', 'lhs-s1002', 'lhs-s1003']
READY_PORTS = {'1001': 8080, '1002': 8083, '1003': 8084}


def sha_bytes(data):
    return hashlib.sha256(data).hexdigest()


def remote_path(rel):
    return REMOTE_ROOT + '/' + rel


def ensure_local_backup(rel, data):
    target = BACKUP / 'remote' / rel
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    BACKUP.mkdir(parents=True, exist_ok=True)
    local_hashes = {}
    for rel in FILES:
        local = ROOT / 'linhhoasu' / rel
        if not local.exists():
            raise RuntimeError('LOCAL_FILE_MISSING:' + rel)
        local_hashes[rel] = {'sha256': sha_bytes(local.read_bytes()), 'bytes': local.stat().st_size}

    ssh = connect()
    evidence = {'startedAt': datetime.now(timezone.utc).isoformat(), 'files': [], 'processesBefore': [], 'restarted': []}
    try:
        with ssh.open_sftp() as sftp:
            for rel in FILES:
                path = remote_path(rel)
                expected = EXPECTED_REMOTE.get(rel)
                try:
                    data = sftp.open(path, 'rb').read()
                    actual = sha_bytes(data)
                    exists = True
                    ensure_local_backup(rel, data)
                except FileNotFoundError:
                    data = b''
                    actual = None
                    exists = False
                if expected is None and exists:
                    raise RuntimeError('REMOTE_EXPECTED_ABSENT_BUT_EXISTS:' + rel)
                if expected is not None and actual != expected:
                    raise RuntimeError(f'CAS_MISMATCH:{rel}:{actual}:{expected}')
                evidence['files'].append({'file': rel, 'remoteBefore': actual, 'localCandidate': local_hashes[rel]['sha256'], 'existsBefore': exists})

        run(ssh, 'mkdir -p ' + shlex.quote('/linhhoasu/_ai_workbench/backups/power_fix_g2g6_20260913_pre'))
        for rel in FILES:
            src_raw = remote_path(rel)
            dest_raw = '/linhhoasu/_ai_workbench/backups/power_fix_g2g6_20260913_pre/' + rel
            src = shlex.quote(src_raw)
            dest = shlex.quote(dest_raw)
            parent_raw = dest_raw.rsplit('/', 1)[0]
            run(ssh, 'mkdir -p ' + shlex.quote(parent_raw) + ' && if [ -f ' + src + ' ]; then cp -p ' + src + ' ' + dest + '; fi')

        pm2_before = json.loads(run(ssh, 'pm2 jlist'))
        evidence['processesBefore'] = [
            {'name': p.get('name'), 'pid': p.get('pid'), 'status': (p.get('pm2_env') or {}).get('status'), 'restarts': (p.get('pm2_env') or {}).get('restart_time')}
            for p in pm2_before if p.get('name') in GAME_PROCESSES
        ]

        with ssh.open_sftp() as sftp:
            for rel in FILES:
                local = ROOT / 'linhhoasu' / rel
                target = remote_path(rel)
                parent = str(Path(target).parent).replace('\\', '/')
                run(ssh, 'mkdir -p ' + shlex.quote(parent))
                temp = target + '.power_fix_tmp_20260913'
                sftp.put(str(local), temp)
                if hasattr(sftp, 'posix_rename'):
                    sftp.posix_rename(temp, target)
                else:
                    sftp.rename(temp, target)

        js_files = [remote_path(rel) for rel in FILES if rel.endswith('.js') and rel.startswith('lhs/')]
        run(ssh, 'node --check ' + ' '.join(shlex.quote(p) for p in js_files))

        with ssh.open_sftp() as sftp:
            for row in evidence['files']:
                data = sftp.open(remote_path(row['file']), 'rb').read()
                row['remoteAfter'] = sha_bytes(data)
                if row['remoteAfter'] != row['localCandidate']:
                    raise RuntimeError('REMOTE_HASH_AFTER_MISMATCH:' + row['file'])

        for name in GAME_PROCESSES:
            run(ssh, 'pm2 restart ' + shlex.quote(name) + ' --update-env')
            evidence['restarted'].append(name)

        ready = {}
        for server_id, port in READY_PORTS.items():
            ready[server_id] = int(run(ssh, f"for i in $(seq 1 10); do c=$(curl -sS --max-time 10 -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{port}/ready || true); [ \"$c\" = 200 ] && echo $c && break; sleep 2; done").strip())
        evidence['ready'] = ready
        evidence['processesAfter'] = [
            {'name': p.get('name'), 'pid': p.get('pid'), 'status': (p.get('pm2_env') or {}).get('status'), 'restarts': (p.get('pm2_env') or {}).get('restart_time')}
            for p in json.loads(run(ssh, 'pm2 jlist')) if p.get('name') in GAME_PROCESSES
        ]
        evidence['served'] = {
            'indexMarker': '20260913_power_display_v2' in run(ssh, "curl -sS --max-time 20 http://127.0.0.1:81/index.html"),
            'hudHttp': int(run(ssh, "curl -sS --max-time 20 -o /dev/null -w '%{http_code}' http://127.0.0.1:81/js/lhs-power-display-v1.js").strip()),
        }
        evidence['recentErrors'] = run(ssh, "for f in /root/.pm2/logs/lhs-s1001-error.log /root/.pm2/logs/lhs-s1002-error.log /root/.pm2/logs/lhs-s1003-error.log; do tail -120 \"$f\" 2>/dev/null | grep -Ei 'uncaught|unhandled|SyntaxError|TypeError|ReferenceError' || true; done")
    finally:
        ssh.close()

    evidence['finishedAt'] = datetime.now(timezone.utc).isoformat()
    evidence['result'] = 'PASS' if evidence.get('ready') == {'1001': 200, '1002': 200, '1003': 200} and all(p['status'] == 'online' for p in evidence.get('processesAfter', [])) and not evidence.get('recentErrors') and evidence.get('served', {}).get('indexMarker') and evidence.get('served', {}).get('hudHttp') == 200 else 'HOLD'
    path = OUT / 'deploy.json'
    path.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'result': evidence['result'], 'evidence': str(path), 'ready': evidence.get('ready'), 'restarted': evidence.get('restarted')}, ensure_ascii=False))


if __name__ == '__main__':
    main()
