import ast, json, time
from pathlib import Path
import paramiko

ROOT = Path(__file__).resolve().parents[2]
tree = ast.parse((ROOT / '_ai_workbench/tools/vps_exec.py').read_text(encoding='utf-8-sig'))
node = next(n for n in ast.walk(tree) if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute) and n.func.attr == 'connect')
args = [ast.literal_eval(x) for x in node.args]
kwargs = {x.arg: ast.literal_eval(x.value) for x in node.keywords}
kwargs.update(timeout=20, banner_timeout=20, auth_timeout=20)
client = paramiko.SSHClient(); client.set_missing_host_key_policy(paramiko.AutoAddPolicy()); client.connect(*args, **kwargs)
def run(command):
    _, out, err = client.exec_command(command, timeout=40)
    text = out.read().decode('utf-8', 'replace')
    return {'code': out.channel.recv_exit_status(), 'out': text, 'err': err.read().decode('utf-8', 'replace')}
time.sleep(8)
pm2 = run("pm2 jlist | node -e \"let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.stringify(JSON.parse(s).filter(p=>/^lhs-s100[1-8]$/.test(p.name)).map(p=>({name:p.name,pid:p.pid,status:p.pm2_env.status,restarts:p.pm2_env.restart_time})))));\"")
ready = {}
for port in [8080, 8083, 8084, 8085, 8086, 8087, 8088, 8089]:
    ready[str(port)] = run(f"curl -sS -o /dev/null -w '%{{http_code}}' --max-time 8 http://127.0.0.1:{port}/ready")
paths = {
    'RealmTaskProgressService.js': '/linhhoasu/lhs/newServer/src/services/RealmTaskProgressService.js',
    'raid.js': '/linhhoasu/lhs/newServer/src/handlers/raid.js',
    'farm.js': '/linhhoasu/lhs/newServer/src/handlers/farm.js',
    'farm1.js': '/linhhoasu/lhs/newServer/src/handlers/farm1.js',
}
hashes = run('sha256sum ' + ' '.join(paths.values()))
print(json.dumps({'pm2': pm2, 'ready': ready, 'hashes': hashes}, ensure_ascii=False, indent=2))
client.close()
