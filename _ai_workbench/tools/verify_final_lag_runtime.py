import getpass
import json
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('103.116.105.154', username='root', password=getpass.getpass('VPS password (not logged): '), look_for_keys=False, allow_agent=False, timeout=15)

def run(command):
    _, out, err = ssh.exec_command(command)
    text = out.read().decode('utf-8', 'replace')
    code = out.channel.recv_exit_status()
    if code:
        print('COMMAND_FAILED', code, err.read().decode('utf-8', 'replace')[-2000:])
    return text

try:
    rows = json.loads(run('pm2 jlist'))
    for name in ('lhs-s1001', 'lhs-dist', 'lhs-admin'):
        row = next((item for item in rows if item.get('name') == name), {})
        env = row.get('pm2_env') or {}
        metrics = env.get('axm_monitor') or {}
        print('PM2', name, {
            'status': env.get('status'),
            'pid': row.get('pid'),
            'restarts': env.get('restart_time'),
            'cpu': (row.get('monit') or {}).get('cpu'),
            'memoryMB': round(((row.get('monit') or {}).get('memory') or 0) / 1048576, 1),
            'eventLoopP50': (metrics.get('Event Loop Latency') or {}).get('value'),
            'eventLoopP95': (metrics.get('Event Loop Latency p95') or {}).get('value'),
        })
    print('HEALTH')
    print(run("curl -sS http://127.0.0.1:8080/ready; echo; curl -sS http://127.0.0.1:9200/health; echo"))
    print('CPU_SAMPLES')
    print(run("pid=$(pm2 pid lhs-s1001); for i in $(seq 1 5); do ps -p $pid -o pid=,%cpu=,%mem=,rss=,etime=; sleep 1; done"))
    print('LISTENERS')
    print(run("ss -ltnp | grep -E ':(8080|9200)\\b'"))
    print('CONNECTIONS')
    print(run("ss -tn state established | awk '$4 ~ /:9200$/ {n++} END{print n+0}'"))
    print('FRESH_ERRORS')
    print(run("f=/root/.pm2/logs/lhs-s1001-out.log; line=$(grep -n '\\[WSServer\\] runtime ready revision=' $f | tail -1 | cut -d: -f1); [ -n \"$line\" ] && tail -n +$line $f | grep -Ei 'failed|error|exception|timeout|save queue backlog' | tail -50 || true"))
finally:
    ssh.close()
