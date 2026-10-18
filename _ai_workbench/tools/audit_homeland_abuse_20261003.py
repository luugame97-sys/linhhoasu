"""Run read-only Homeland forensics through SSH stdin; never upload or mutate."""
import json
import sys
from pathlib import Path
import paramiko
from rollback_role_lian_manifest_20260930 import ssh_config

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '_ai_workbench/temp/homeland_abuse_20261003'

def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else 'inventory'
    assert mode in ('inventory', 'players', 'logs')
    args, kwargs = ssh_config()
    assert args[0] == '103.116.104.165'
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(*args, **kwargs)
    try:
        code = (ROOT / '_ai_workbench/tools/audit_homeland_abuse_20261003.js').read_text(encoding='utf8')
        stdin, stdout, stderr = client.exec_command('cd /linhhoasu/lhs/newServer && node - ' + mode, timeout=55)
        stdin.write(code)
        stdin.channel.shutdown_write()
        data = stdout.read()
        err = stderr.read()
        if stdout.channel.recv_exit_status():
            raise RuntimeError('AUDIT_FAILED:' + err.decode('utf8', 'replace')[-500:])
        result = json.loads(data)
        OUT.mkdir(parents=True, exist_ok=True)
        (OUT / (mode + '.json')).write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
        print(json.dumps(result, ensure_ascii=False))
    finally:
        client.close()

if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf8')
    main()
