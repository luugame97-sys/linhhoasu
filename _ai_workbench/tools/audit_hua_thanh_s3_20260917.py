"""Pinned-SSH read-only S3 diagnosis. Remote Node runs via stdin, evidence stays local."""
import json
import sys
from pathlib import Path

sys.dont_write_bytecode = True
BASE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE / 'temp/pydeps'))
from snapshot_web_multiserver_20260906 import connect, run

mode = sys.argv[1] if len(sys.argv) > 1 else 'inventory'
if mode not in ('inventory', 'detail', 'probe'):
    raise SystemExit('Unknown audit mode')
out = BASE / 'temp/hua_thanh_s3_20260917'
out.mkdir(parents=True, exist_ok=True)
source = 'const AUDIT_MODE=' + json.dumps(mode) + ';\n'
if mode == 'probe':
    inventory = json.loads((out / 'inventory.json').read_text(encoding='utf-8'))
    detail = json.loads((out / 'detail.json').read_text(encoding='utf-8'))
    player = inventory['players'][0]
    player['roleInfo'] = detail['players'][0]['roleInfo']
    source += 'const SNAPSHOT=' + json.dumps(player) + ';\n'
    source += 'const OPEN_TIME=' + str(detail['gameServer'][0]['openTime']) + ';\n'
    source += (BASE / 'tools/probe_hua_thanh_s3_20260917.js').read_text(encoding='utf-8')
else:
    source += (BASE / 'tools/audit_hua_thanh_s3_20260917.js').read_text(encoding='utf-8')
ssh = connect()
try:
    data = json.loads(run(ssh, 'cd /linhhoasu/lhs/newServer && node -', source))
    if mode == 'detail':
        with ssh.open_sftp() as sftp:
            snapshot = out / 'source/upgrade.js'
            snapshot.parent.mkdir(parents=True, exist_ok=True)
            snapshot.write_bytes(sftp.open('/linhhoasu/lhs/newServer/src/handlers/upgrade.js', 'rb').read())
finally:
    ssh.close()
(out / (mode + '.json')).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
if mode == 'inventory':
    print(json.dumps({'at': data['at'], 'players': [{'name':p['name'],'level':p['level'],'exp':p['exp']} for p in data['players']],
                     'processesUnchanged':data['processesUnchanged'],'output':str(out / (mode+'.json'))}, ensure_ascii=True))
else:
    print(json.dumps(data, ensure_ascii=True))
