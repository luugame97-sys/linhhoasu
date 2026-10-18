"""Enable direct unlock policy for Thần binh/Võ hồn on all game nodes."""
import hashlib
import json
import re
import shlex
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.dont_write_bytecode = True
WB = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WB / 'temp/pydeps'))
from snapshot_web_multiserver_20260906 import connect, run

APP = '/linhhoasu/lhs/newServer'
ECO = APP + '/ecosystem.config.js'
NODES = ['lhs-s1001', 'lhs-s1002', 'lhs-s1003', 'lhs-s1004']
PORTS = {'lhs-s1001': 8080, 'lhs-s1002': 8083, 'lhs-s1003': 8084, 'lhs-s1004': 8085}
FORCED = '10010,209,216'


def states(ssh):
    rows = json.loads(run(ssh, 'pm2 jlist'))
    return {p['name']: {'pid': p.get('pid'), 'status': p.get('pm2_env', {}).get('status'),
                        'restarts': p.get('pm2_env', {}).get('restart_time'),
                        'flags': {k: p.get('pm2_env', {}).get(k) for k in (
                            'FORCE_UNLOCK_SYSTEM_IDS', 'FEATURE_SIDE_TASKS_ENABLED',
                            'FEATURE_SIDE_TASK_ROOTS', 'FEATURE_UNLOCK_DAY1_ENABLED')}}
            for p in rows if p.get('name') in NODES}


def ready(ssh, port):
    return run(ssh, 'for i in $(seq 1 30); do c=$(curl -s --max-time 3 -o /dev/null -w %{http_code} '
                    + shlex.quote(f'http://127.0.0.1:{port}/ready')
                    + ' || true); [ "$c" = 200 ] && echo 200 && exit 0; sleep 1; done; echo 000').strip()


def patch_ecosystem(text):
    if 'FORCE_UNLOCK_SYSTEM_IDS' in text:
        raise RuntimeError('DIRECT_UNLOCK_FLAG_ALREADY_PRESENT')
    for server_id in [1001, 1002, 1003, 1004]:
        pattern = re.compile(r'(?m)^(\s*)SERVER_ID:\s*' + str(server_id) + r',\s*$')
        match = pattern.search(text)
        if not match:
            raise RuntimeError('SERVER_ID_ANCHOR:' + str(server_id))
        indent = match.group(1)
        insert = match.group(0) + '\n' + indent + "FORCE_UNLOCK_SYSTEM_IDS: '" + FORCED + "',"
        text = text[:match.start()] + insert + text[match.end():]
    return text


ssh = connect()
backup = None
restarted = []
try:
    before = states(ssh)
    before_ready = {str(port): ready(ssh, port) for port in PORTS.values()}
    if any(value != '200' for value in before_ready.values()):
        raise RuntimeError('NOT_READY_BEFORE')
    with ssh.open_sftp() as sftp:
        old = sftp.open(ECO, 'rb').read()
    new = patch_ecosystem(old.decode('utf-8')).encode()
    stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    backup = '/linhhoasu/_ai_workbench/backups/direct_systems_' + stamp
    run(ssh, 'install -d -m 700 ' + shlex.quote(backup))
    run(ssh, 'cp -p -- ' + shlex.quote(ECO) + ' ' + shlex.quote(backup + '/ecosystem.config.js'))
    temp = ECO + '.deploy-' + stamp
    with ssh.open_sftp() as sftp:
        with sftp.open(temp, 'wb') as handle:
            handle.write(new)
    run(ssh, 'mv -f -- ' + shlex.quote(temp) + ' ' + shlex.quote(ECO))
    for node in NODES:
        run(ssh, 'FORCE_UNLOCK_SYSTEM_IDS=' + FORCED + ' FEATURE_SIDE_TASKS_ENABLED=1 '
            + 'FEATURE_SIDE_TASK_ROOTS=90020 pm2 restart ' + shlex.quote(node) + ' --update-env')
        if ready(ssh, PORTS[node]) != '200':
            raise RuntimeError('NOT_READY:' + node)
        restarted.append(node)
    after = states(ssh)
    after_ready = {str(port): ready(ssh, port) for port in PORTS.values()}
    if any(after[node]['flags']['FORCE_UNLOCK_SYSTEM_IDS'] != FORCED for node in NODES):
        raise RuntimeError('FORCE_UNLOCK_FLAG_NOT_LOADED')
    result = {'status': 'PASS', 'policy': {'forcedSystems': [209, 216], 'preservedForcedSystem': 10010,
              'sideTaskRoots': [90020], 'day1': None}, 'backup': backup, 'before': before,
              'after': after, 'beforeReady': before_ready, 'ready': after_ready,
              'restarted': restarted, 'productionWrites': 0, 'playerWrites': 0}
    path = WB / 'temp' / 'vo_hon_than_binh_migration_20260919' / 'enable_direct_systems.json'
    path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(result, ensure_ascii=False))
except Exception:
    if backup:
        run(ssh, 'cp -p -- ' + shlex.quote(backup + '/ecosystem.config.js') + ' ' + shlex.quote(ECO))
        for node in restarted:
            run(ssh, 'pm2 restart ' + shlex.quote(node) + ' --update-env')
    raise
finally:
    ssh.close()
