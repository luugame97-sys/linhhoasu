"""Synchronize verified game item IDs into the WebGM text catalog only."""
from pathlib import Path
import datetime as dt
import hashlib
import json
import shlex
import sys
import paramiko
from rollback_role_lian_manifest_20260930 import ssh_config

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '_ai_workbench/temp/gmitem_sync_20261003'
REMOTE = '/linhhoasu/webgame/gm/assets/item/gmitem.txt'
sha = lambda data: hashlib.sha256(data).hexdigest()

def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else 'audit'
    args, kwargs = ssh_config()
    assert args[0] == '103.116.104.165'
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(*args, **kwargs)
    s = c.open_sftp()
    OUT.mkdir(parents=True, exist_ok=True)
    try:
        if mode != 'audit':
            raise RuntimeError('MODE_NOT_IMPLEMENTED')
        source = (ROOT / '_ai_workbench/tools/sync_gmitem_catalog_20261003.js').read_text('utf8')
        i, o, e = c.exec_command('cd /linhhoasu/lhs/newServer && node -', timeout=55)
        i.write(source); i.channel.shutdown_write()
        raw, err = o.read(), e.read()
        if o.channel.recv_exit_status():
            raise RuntimeError('INVENTORY_FAILED:' + err.decode('utf8', 'replace')[-500:])
        audit = json.loads(raw)
        baseline = s.open(REMOTE, 'rb').read()
        if sha(baseline) != audit['catalogHash']:
            raise RuntimeError('CATALOG_CHANGED_DURING_AUDIT')
        (OUT / 'gmitem.before.txt').write_bytes(baseline)
        (OUT / 'audit.json').write_text(json.dumps(audit, ensure_ascii=False, indent=2)+'\n',encoding='utf8')
        print(json.dumps({'catalogCount':audit['catalogCount'], 'servers':[{'node':r['node'],'assets':r['assets'],'missing':len(r['missing']),'hash':r['assetHash']}for r in audit['reports']], 'missing':audit['reports'][0]['missing'], 'nonPositive':audit['reports'][0]['nonPositive']},ensure_ascii=False))
    finally:
        s.close(); c.close()

if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf8')
    main()
