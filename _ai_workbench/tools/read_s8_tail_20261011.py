import ast, sys
from pathlib import Path
import paramiko
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT=Path(__file__).resolve().parents[2]
t=ast.parse((ROOT/'_ai_workbench/tools/vps_exec.py').read_text(encoding='utf-8-sig'))
n=next(n for n in ast.walk(t) if isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and n.func.attr=='connect')
a=[ast.literal_eval(x) for x in n.args]
k={x.arg:ast.literal_eval(x.value) for x in n.keywords}; k.update(timeout=20,banner_timeout=20,auth_timeout=20)
c=paramiko.SSHClient(); c.set_missing_host_key_policy(paramiko.AutoAddPolicy()); c.connect(*a,**k)
_,o,e=c.exec_command("tail -n 5000 /root/.pm2/logs/lhs-s1008-out.log",timeout=60)
print(o.read().decode('utf8','replace')); print(e.read().decode('utf8','replace')); c.close()
