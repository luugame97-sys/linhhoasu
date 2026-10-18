"""Run a read-only live probe through SSH stdin; save only local audit evidence."""
import json
import sys
from pathlib import Path
import paramiko
from rollback_role_lian_manifest_20260930 import ssh_config

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '_ai_workbench/temp/coercion_audit_20261001'
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

def main():
    args, kwargs = ssh_config()
    assert args[0] == '103.116.104.165'
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(*args, **kwargs)
    try:
        source = (ROOT / '_ai_workbench/tools/audit_coercion_live_20261001.js').read_text(encoding='utf-8-sig')
        stdin, stdout, stderr = ssh.exec_command('cd /linhhoasu/lhs/newServer && timeout 55s node -', timeout=60)
        stdin.write(source)
        stdin.channel.shutdown_write()
        out, err = stdout.read().decode('utf-8'), stderr.read().decode('utf-8', 'replace')
        code = stdout.channel.recv_exit_status()
        if code:
            raise RuntimeError('REMOTE_PROBE_FAILED:' + str(code) + ':' + err[-1200:])
        data = json.loads(out)
        OUT.mkdir(parents=True, exist_ok=True)
        (OUT / 'live.json').write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(json.dumps(data, ensure_ascii=False, indent=2))
    finally:
        ssh.close()

if __name__ == '__main__':
    main()
