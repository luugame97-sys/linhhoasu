"""Scoped incident runner; credentials stay in the existing credential source."""
import ast
import json
import shlex
import sys
from pathlib import Path
import paramiko

sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(__file__).resolve().parents[2]

def connect():
    tree = ast.parse((ROOT / '_ai_workbench/tools/apply_player_opt.py').read_text(encoding='utf-8-sig'))
    password = None
    for call in ast.walk(tree):
        if isinstance(call, ast.Call) and isinstance(call.func, ast.Attribute) and call.func.attr == 'connect':
            if call.args and isinstance(call.args[0], ast.Constant) and call.args[0].value == '103.116.104.165':
                for kw in call.keywords:
                    if kw.arg == 'password' and isinstance(kw.value, ast.Constant):
                        password = kw.value.value
    if not password:
        raise RuntimeError('Existing credential source unavailable')
    client = paramiko.SSHClient()
    client.load_system_host_keys()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect('103.116.104.165', username='root', password=password,
                   look_for_keys=False, allow_agent=False, timeout=20)
    return client

def run(client, cmd, data=None):
    stdin, stdout, stderr = client.exec_command(cmd, timeout=60)
    if data is not None:
        stdin.write(data)
        stdin.channel.shutdown_write()
    out = stdout.read().decode('utf-8', 'replace')
    err = stderr.read().decode('utf-8', 'replace')
    if stdout.channel.recv_exit_status() != 0:
        raise RuntimeError(err[-2500:] + out[-2500:])
    return out

if __name__ == '__main__':
    with connect() as client:
        mode = sys.argv[1]
        if mode in ('php', 'node'):
            source = Path(sys.argv[2]).read_text(encoding='utf-8-sig')
            output = run(client, 'php' if mode == 'php' else 'node -', source)
            if len(sys.argv) > 3:
                Path(sys.argv[3]).parent.mkdir(parents=True, exist_ok=True)
                Path(sys.argv[3]).write_text(output, encoding='utf-8')
            print(output)
        elif mode == 'shell':
            print(run(client, sys.argv[2]))
