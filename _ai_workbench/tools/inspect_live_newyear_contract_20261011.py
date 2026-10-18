import ast, json
from pathlib import Path
import paramiko

ROOT = Path(__file__).resolve().parents[2]
src = (ROOT / '_ai_workbench/tools/vps_exec.py').read_text(encoding='utf-8-sig')
tree = ast.parse(src)
call = next(n for n in ast.walk(tree) if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute) and n.func.attr == 'connect')
args = [ast.literal_eval(n) for n in call.args]
kwargs = {n.arg: ast.literal_eval(n.value) for n in call.keywords}
kwargs.update(timeout=20, banner_timeout=20, auth_timeout=20)
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(*args, **kwargs)
sftp = c.open_sftp()
try:
    for name, path in [('payload', '/linhhoasu/lhs/newServer/src/handlers/playerPayload.js'), ('activity', '/linhhoasu/lhs/newServer/src/handlers/activity.js'), ('client', '/linhhoasu/webgame/game/js/main.min_drop200.js'), ('index', '/linhhoasu/webgame/game/index.html')]:
        with sftp.open(path, 'rb') as f:
            t = f.read().decode('utf8', 'replace')
        result = {
            'name': name,
            'bytes': len(t),
            'activityTaskLoop': 'activityTaskConfigMaps.forEach' in t,
            'requiresCfgId': 'if (taskId <= 0 || !cfg.id) return;' in t,
            'activeActivityIds': 'activeActivityIds' in t,
            'unsafeRedPoint': 'getActivityTaskDataById(t.id,i.taskId).status' in t,
        }
        if name == 'index':
            result['mainDrop200Lines'] = [x.strip() for x in t.splitlines() if 'main.min_drop200' in x]
        if name == 'payload':
            p = t.find('activityTaskConfigMaps.forEach')
            result['snippet'] = t[p:p + 700] if p >= 0 else ''
        print(json.dumps(result, ensure_ascii=False))
finally:
    sftp.close()
    c.close()
