"""Read-only live inventory for the power-sync rollout; never prints credentials."""
import json
import shlex
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
from snapshot_web_multiserver_20260906 import connect, run

PORTS = [8080, 8083, 8084, 8085, 8086, 8087]

ssh = connect()
try:
    selector = (
        "let s='';process.stdin.on('data',b=>s+=b).on('end',()=>{"
        "const xs=JSON.parse(s).filter(p=>/^lhs-s100[1-6]$/.test(p.name));"
        "console.log(JSON.stringify(xs.map(p=>({name:p.name,pid:p.pid,status:p.pm2_env.status,"
        "cwd:p.pm2_env.pm_cwd||p.pm2_env.cwd,script:p.pm2_env.pm_exec_path,"
        "httpPort:p.pm2_env.HTTP_PORT||p.pm2_env.env?.HTTP_PORT||null,"
        "wsPort:p.pm2_env.WS_PORT||p.pm2_env.env?.WS_PORT||null,"
        "serverId:p.pm2_env.SERVER_ID||p.pm2_env.env?.SERVER_ID||null,"
        "restarts:p.pm2_env.restart_time}))))});"
    )
    raw = run(ssh, "pm2 jlist | node -e " + shlex.quote(selector))
    processes = json.loads(raw)
    readiness = {}
    for port in PORTS:
        readiness[str(port)] = run(
            ssh,
            "curl -s --max-time 8 -o /dev/null -w '%{http_code}' "
            f"http://127.0.0.1:{port}/ready",
        ).strip()
    result = {"readOnly": True, "processes": processes, "readiness": readiness}
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
finally:
    ssh.close()
