"""Extend direct-unlock policy to Bloodline, Curios and Elf systems."""
import json
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
POLICY = '10010,209,216,219,220,222'


def state(ssh):
    rows = json.loads(run(ssh, 'pm2 jlist'))
    return {p['name']: {'pid': p.get('pid'), 'status': p.get('pm2_env', {}).get('status'),
                        'restarts': p.get('pm2_env', {}).get('restart_time'),
                        'force': p.get('pm2_env', {}).get('FORCE_UNLOCK_SYSTEM_IDS')}
            for p in rows if p.get('name') in NODES}


def ready(ssh, port):
    return run(ssh, 'for i in $(seq 1 30); do c=$(curl -s --max-time 3 -o /dev/null -w %{http_code} '
                    + shlex.quote(f'http://127.0.0.1:{port}/ready')
                    + ' || true); [ "$c" = 200 ] && echo 200 && exit 0; sleep 1; done; echo 000').strip()


ssh = connect()
backup = None
restarted = []
try:
    before = state(ssh)
    with ssh.open_sftp() as sftp:
        old = sftp.open(ECO, 'rb').read().decode('utf-8')
    anchor = "FORCE_UNLOCK_SYSTEM_IDS: '10010,209,216',"
    if anchor not in old:
        raise RuntimeError('EXPECTED_POLICY_ANCHOR_MISSING')
    new = old.replace(anchor, "FORCE_UNLOCK_SYSTEM_IDS: '" + POLICY + "',")
    stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    backup = '/linhhoasu/_ai_workbench/backups/direct_systems_extend_' + stamp
    run(ssh, 'install -d -m 700 ' + shlex.quote(backup))
    run(ssh, 'cp -p -- ' + shlex.quote(ECO) + ' ' + shlex.quote(backup + '/ecosystem.config.js'))
    temp = ECO + '.deploy-' + stamp
    with ssh.open_sftp() as sftp:
        with sftp.open(temp, 'wb') as handle:
            handle.write(new.encode())
    run(ssh, 'mv -f -- ' + shlex.quote(temp) + ' ' + shlex.quote(ECO))
    for node in NODES:
        run(ssh, 'FORCE_UNLOCK_SYSTEM_IDS=' + POLICY + ' FEATURE_SIDE_TASKS_ENABLED=1 '
            + 'FEATURE_SIDE_TASK_ROOTS=90020 pm2 restart ' + shlex.quote(node) + ' --update-env')
        if ready(ssh, PORTS[node]) != '200':
            raise RuntimeError('NOT_READY:' + node)
        restarted.append(node)
    after = state(ssh)
    ready_map = {str(port): ready(ssh, port) for port in PORTS.values()}
    if any(after[node]['force'] != POLICY for node in NODES):
        raise RuntimeError('POLICY_NOT_LOADED')
    result = {'status': 'PASS', 'policy': [219, 220, 222], 'backup': backup,
              'before': before, 'after': after, 'ready': ready_map,
              'restarted': restarted, 'productionWrites': 0, 'playerWrites': 0}
    path = WB / 'temp' / 'vo_hon_than_binh_migration_20260919' / 'extend_direct_systems.json'
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
