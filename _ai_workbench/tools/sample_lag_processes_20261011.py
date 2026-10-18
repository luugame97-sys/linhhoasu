import ast, json, time, sys
from pathlib import Path
import paramiko
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = Path(__file__).resolve().parents[2]
t = ast.parse((ROOT / '_ai_workbench/tools/vps_exec.py').read_text(encoding='utf-8-sig'))
n = next(n for n in ast.walk(t) if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute) and n.func.attr == 'connect')
a = [ast.literal_eval(x) for x in n.args]
k = {x.arg: ast.literal_eval(x.value) for x in n.keywords}
k.update(timeout=20, banner_timeout=20, auth_timeout=20)
c = paramiko.SSHClient(); c.set_missing_host_key_policy(paramiko.AutoAddPolicy()); c.connect(*a, **k)
def run(cmd):
    _, o, e = c.exec_command(cmd, timeout=30)
    return o.read().decode('utf8', 'replace'), e.read().decode('utf8', 'replace')
rows = []
for _ in range(4):
    out, err = run("ps -eo pid,pcpu,pmem,rss,args --no-headers | grep '/linhhoasu/lhs/newServer/src/app.js' | grep -v grep | sort -k2 -nr")
    rows.append({'at': time.time(), 'out': out})
    time.sleep(5)
print(json.dumps(rows, ensure_ascii=False, indent=2)); c.close()
