"""Reuse read-only residue/log probe with exact current QA prefix and cutoff."""
import json
import sys
from datetime import datetime, timezone
import paramiko
from verify_fishing_full_residue_20260906 import WB, SCRIPT
from release_huyenvu_daily_20260906 import run

ROOT = WB / 'temp/fishing_contest_shop_20260906'


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    deploy=json.loads((ROOT/'deploy.json').read_text())
    script=SCRIPT.replace("const since='2026-09-06T12:12:37.634778+00:00';", 'const since='+json.dumps(deploy['finishedAt'])+';')
    script=script.replace('session:qafull_*','session:qafshop_*').replace('/qa_fishing_full_live_20260906.js','/qa_fishing_contest_shop_live_20260906.js')
    creds=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines()
    ssh=paramiko.SSHClient();ssh.load_system_host_keys();ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
    ssh.connect(creds[0].strip(),username='root',password=creds[2],look_for_keys=False,allow_agent=False,timeout=20)
    try:
        report=json.loads(run(ssh,'node -',script,timeout=30))
        report.update(checkedAt=datetime.now(timezone.utc).isoformat(),productionWrites=0)
        (ROOT/'qa-residue-final.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
        assert not report['ownedHarnessProcesses']
        assert all(v['qaRedisSessions']==0 for v in report['servers'].values())
        print(json.dumps(report))
    finally:ssh.close()


if __name__=='__main__':main()
