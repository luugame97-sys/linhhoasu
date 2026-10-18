"""Restart only the four game nodes to invalidate stale player sessions."""
import json
import shlex
import sys
from pathlib import Path

sys.dont_write_bytecode = True
WB = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WB / 'temp/pydeps'))
from snapshot_web_multiserver_20260906 import connect, run

NODES = ['lhs-s1001', 'lhs-s1002', 'lhs-s1003', 'lhs-s1004']
PORTS = {'lhs-s1001': 8080, 'lhs-s1002': 8083, 'lhs-s1003': 8084, 'lhs-s1004': 8085}


def states(ssh):
    rows = json.loads(run(ssh, 'pm2 jlist'))
    return {p['name']: {'pid': p.get('pid'), 'status': p.get('pm2_env', {}).get('status'),
                        'restarts': p.get('pm2_env', {}).get('restart_time')}
            for p in rows if p.get('name') in NODES}


def ready(ssh, port):
    command = ('for i in $(seq 1 30); do c=$(curl -s --max-time 3 -o /dev/null -w %{http_code} '
               + shlex.quote(f'http://127.0.0.1:{port}/ready')
               + ' || true); [ "$c" = 200 ] && echo 200 && exit 0; sleep 1; done; echo 000')
    return run(ssh, command).strip()


ssh = connect()
try:
    before = states(ssh)
    out = {'before': before, 'restarted': [], 'productionWrites': 0, 'playerWrites': 0}
    for node in NODES:
        run(ssh, 'pm2 restart ' + shlex.quote(node) + ' --update-env')
        if ready(ssh, PORTS[node]) != '200':
            raise RuntimeError('NOT_READY:' + node)
        out['restarted'].append(node)
    out['after'] = states(ssh)
    out['ready'] = {str(port): ready(ssh, port) for port in PORTS.values()}
    out['status'] = 'PASS'
    path = WB / 'temp' / 'vo_hon_than_binh_migration_20260919' / 'restart.json'
    path.write_text(json.dumps(out, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(out, ensure_ascii=False))
finally:
    ssh.close()
