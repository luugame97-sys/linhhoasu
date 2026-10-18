import ast, json
import sys
from pathlib import Path
import paramiko
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

ROOT = Path(__file__).resolve().parents[2]
tree = ast.parse((ROOT / '_ai_workbench/tools/vps_exec.py').read_text(encoding='utf-8-sig'))
n = next(n for n in ast.walk(tree) if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute) and n.func.attr == 'connect')
a = [ast.literal_eval(x) for x in n.args]
k = {x.arg: ast.literal_eval(x.value) for x in n.keywords}
k.update(timeout=20, banner_timeout=20, auth_timeout=20)
c = paramiko.SSHClient(); c.set_missing_host_key_policy(paramiko.AutoAddPolicy()); c.connect(*a, **k)
js = "const m=require('./src/handlers/playerPayload');const p={activityInfo:{datas:[{id:43001}]},taskInfo:{},roleInfo:{stage:1},level:1,items:{},other_attr_info:{}};const a=m.normalizeTaskInfo(p.taskInfo,p.roleInfo,p);const b=m.normalizeTaskInfo(a,p.roleInfo);console.log(JSON.stringify({count:Object.keys(a.tasks||{}).filter(k=>/^6100/.test(k)).length,has61001:!!a.tasks['61001'],preserved:!!b.tasks['61001'],type:a.tasks['61001']&&a.tasks['61001'].type}));"
_, o, e = c.exec_command('cd /linhhoasu/lhs/newServer && node -e ' + json.dumps(js), timeout=60)
print(o.read().decode('utf8', 'replace'))
print(e.read().decode('utf8', 'replace'))
c.close()
