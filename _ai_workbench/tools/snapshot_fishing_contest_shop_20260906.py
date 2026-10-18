"""Snapshot the current verified fishing release, read-only on production."""
import hashlib
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path
import paramiko
from release_huyenvu_daily_20260906 import hashes, pm2, ready

WB = Path(__file__).resolve().parents[1]
BASE = WB / 'temp/fishing_full_candidate_20260906'
ROOT = WB / 'temp/fishing_contest_shop_20260906'


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    expected = json.loads((BASE / 'deploy-full.json').read_text())['expected']
    creds = (WB / 'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines()
    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
    ssh.connect(creds[0].strip(), username='root', password=creds[2], look_for_keys=False, allow_agent=False, timeout=20)
    try:
        assert hashes(ssh, list(expected)) == expected, 'PRODUCTION_DRIFT'
        ROOT.mkdir()
        shutil.copytree(BASE / 'app', ROOT / 'app')
        for p in (ROOT / 'app/src').rglob('*'):
            if p.is_file():
                target = '/linhhoasu/lhs/newServer/' + p.relative_to(ROOT / 'app').as_posix()
                assert hashlib.sha256(p.read_bytes()).hexdigest() == expected[target], 'BASE_DRIFT_' + target
        for old, new in [('main.fixed.js','main.js'), ('index.fixed.html','index.before.html'), ('server.bin','server.bin')]:
            shutil.copy2(BASE / old, ROOT / new)
        backup = WB / 'backups/fishing_contest_shop_20260906'
        backup.mkdir()
        for name in ['session_report.md','session_report.html']:
            shutil.copy2(WB / 'reports' / name, backup / name)
        result = {'time': datetime.now(timezone.utc).isoformat(), 'root': str(ROOT), 'expected': expected, 'pm2': pm2(ssh), 'ready': ready(ssh), 'productionWrites': 0}
        (ROOT / 'manifest.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
        print(json.dumps({k:v for k,v in result.items() if k!='expected'}))
    finally:
        ssh.close()


if __name__ == '__main__':
    main()
