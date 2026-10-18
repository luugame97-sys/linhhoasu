import ast, json, sys
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
js = "const s=db.serverStatus();const ops=db.currentOp({active:true});const cache=s.wiredTiger.cache;printjson({connections:s.connections,opcounters:s.opcounters,network:s.network,wtCache:{used:cache['bytes currently in the cache'],dirty:cache['tracked dirty bytes in the cache'],max:cache['maximum bytes configured']},mem:s.mem,activeOps:(ops.inprog||[]).filter(x=>x.secs_running>1).slice(0,50).map(x=>({secs:x.secs_running,op:x.op,ns:x.ns,command:Object.keys(x.command||{}).slice(0,5),client:x.client}))});"
_, o, e = c.exec_command('mongosh --quiet mongodb://127.0.0.1:27017/lhs_s1001 --eval ' + json.dumps(js), timeout=60)
print(o.read().decode('utf8', 'replace')); print(e.read().decode('utf8', 'replace')); c.close()
