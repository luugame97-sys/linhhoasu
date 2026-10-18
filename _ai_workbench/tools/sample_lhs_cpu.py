#!/usr/bin/env python3
import getpass, json, paramiko

ssh=paramiko.SSHClient(); ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('103.116.105.154',username='root',password=getpass.getpass('VPS password (not logged): '),look_for_keys=False,allow_agent=False,timeout=15)
try:
    def run(cmd):
        _,o,e=ssh.exec_command(cmd); out=o.read().decode('utf-8','replace'); err=e.read().decode('utf-8','replace'); code=o.channel.recv_exit_status();
        if code: raise RuntimeError(err[-500:])
        return out
    rows=json.loads(run('pm2 jlist')); p=next(x for x in rows if x.get('name')=='lhs-s1001'); env=p.get('pm2_env') or {}
    print(f"PM_UPTIME_MS={env.get('pm_uptime')} RESTARTS={env.get('restart_time')} UNSTABLE={env.get('unstable_restarts')} STATUS={env.get('status')} PID={p.get('pid')}")
    print('CPU_SAMPLES_START')
    print(run(f"top -b -d 1 -n 8 -p {p.get('pid')} | awk '$1=={p.get('pid')} {{print $9, $10}}'").strip())
    print('CPU_SAMPLES_END')
    print(run("stat -c 'ERR_LOG_MTIME=%y SIZE=%s' /root/.pm2/logs/lhs-s1001-error.log; tail -n 8 /root/.pm2/logs/lhs-s1001-error.log"))
finally: ssh.close()
