import getpass
import json
import shlex
import paramiko


HOST = '103.116.105.154'
APP = '/linhhoasu/lhs/newServer'
POLICY = APP + '/src/config/alchemyMaterialDrops.json'
SERVICE = APP + '/src/services/AlchemyMaterialDropService.js'
BACKUP = '/linhhoasu/_ai_workbench/backups/alchemy_material_current_tier_20260914_20260913_175840'


def run(ssh, command, timeout=60):
    _, out, err = ssh.exec_command(command, timeout=timeout)
    stdout = out.read().decode('utf-8', 'replace')
    stderr = err.read().decode('utf-8', 'replace')
    code = out.channel.recv_exit_status()
    if code:
        raise RuntimeError(stderr[-3000:] or stdout[-3000:])
    return stdout


def main():
    password = getpass.getpass('VPS password (not logged): ')
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username='root', password=password, look_for_keys=False,
                allow_agent=False, timeout=20)
    try:
        policy = json.loads(run(ssh, 'cat -- ' + shlex.quote(POLICY)))
        probe = (
            "const c=require(" + json.dumps(APP + '/src/services/ConfigService') + ");"
            "const d=require(" + json.dumps(SERVICE) + ");c.loadAllTables();let n=0;"
            "const r=d.roll({roleInfo:{stage:45}},1,{kind:'normal',valid:true,mapId:10001},()=>{n++;return 0});"
            "console.log(JSON.stringify({policy:d.policy,result:r,rngCalls:n}));"
        )
        probe_result = json.loads(run(ssh, 'node -e ' + shlex.quote(probe)).splitlines()[-1])
        ready = {str(port): run(ssh, f"curl -sS -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{port}/ready").strip() for port in (8080, 8083, 8084)}
        hashes = run(ssh, 'sha256sum -- ' + ' '.join(shlex.quote(x) for x in [POLICY, SERVICE, BACKUP + '/policy.json', BACKUP + '/service.js']))
        processes = json.loads(run(ssh, 'pm2 jlist'))
        names = {'lhs-s1001','lhs-s1002','lhs-s1003','lhs-real-bots','lhs-real-bots-s2','lhs-real-bots-s3'}
        pm2 = {p['name']:{'status':p.get('pm2_env',{}).get('status'),'pid':p.get('pid'),'restarts':p.get('pm2_env',{}).get('restart_time')} for p in processes if p.get('name') in names}
        errors = run(ssh, "for f in /root/.pm2/logs/lhs-s1001-error.log /root/.pm2/logs/lhs-s1002-error.log /root/.pm2/logs/lhs-s1003-error.log; do tail -n 120 \"$f\" 2>/dev/null; done | grep -E 'SyntaxError|ReferenceError|TypeError|INVALID_ALCHEMY|ALCHEMY_' | tail -n 40 || true")
        print(json.dumps({'policy':policy,'probe':probe_result,'ready':ready,'hashes':hashes,'pm2':pm2,'recentErrors':errors.splitlines()},ensure_ascii=False,indent=2))
    finally:
        ssh.close()


if __name__ == '__main__': main()
