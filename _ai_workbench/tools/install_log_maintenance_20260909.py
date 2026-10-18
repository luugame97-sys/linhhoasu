"""Install scoped log maintenance and logging-only env changes with backups."""
import hashlib
import json
import shlex
import sys
import time
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect, run

WB = Path(__file__).resolve().parents[1]
REMOTE = '/linhhoasu/_ai_workbench/tools/lhs_log_maintenance.py'
BACKUP = '/linhhoasu/_ai_workbench/backups/log_maintenance_20260909'
ECO = '/linhhoasu/lhs/newServer/ecosystem.config.js'
CRON = '/etc/cron.d/lhs-log-maintenance'

def state(s):
    code = "let x='';process.stdin.on('data',d=>x+=d).on('end',()=>console.log(JSON.stringify(JSON.parse(x).map(p=>({name:p.name,pid:p.pid,restarts:p.pm2_env.restart_time,status:p.pm2_env.status,level:p.pm2_env.LOG_LEVEL||null})))));"
    return json.loads(run(s, 'pm2 jlist | node -e ' + shlex.quote(code)))

def main():
    s = connect()
    try:
        action = sys.argv[1]
        if action == 'install':
            run(s, 'test ! -e ' + CRON + ' && test ! -e ' + REMOTE + ' && test ! -e ' + BACKUP)
            before = state(s)
            run(s, 'install -d -m 700 ' + BACKUP + ' /linhhoasu/_ai_workbench/logs/log-maintenance')
            with s.open_sftp() as f:
                f.put(str(WB / 'tools/lhs_log_maintenance.py'), REMOTE)
                f.chmod(REMOTE, 0o700)
                with f.open(BACKUP + '/pm2-summary.json', 'w') as out:
                    out.write(json.dumps(before))
            test = r'''
import importlib.util,tempfile,pathlib,os
spec=importlib.util.spec_from_file_location('maint','/linhhoasu/_ai_workbench/tools/lhs_log_maintenance.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
with tempfile.TemporaryDirectory(prefix='log-test-',dir='/linhhoasu/_ai_workbench/logs/log-maintenance') as d:
 p=pathlib.Path(d);m.BASE=p;log=p/'test.log';log.write_bytes(b'a'*8192)
 assert m.cap(log,4096,True)['beforeBytes']==8192 and log.stat().st_size==8192
 assert m.cap(log,4096)['afterBytes']==0
 assert len(list(p.glob('sample-*.gz')))==1
 assert m.cap(log,4096) is None
 link=p/'link.log';link.symlink_to(log);assert m.cap(link,1) is None
 m.prune_samples()
 print('TEST_PASS: dry-run, cap, gzip readback, idempotence, symlink guard, journal')
'''
            print(run(s, 'python3 -', test))
            print(run(s, 'python3 ' + REMOTE + ' --dry-run'))
        elif action == 'clean':
            print(run(s, 'python3 ' + REMOTE))
        elif action == 'configure':
            with s.open_sftp() as f:
                with f.open(ECO, 'rb') as inp:
                    original = inp.read()
                text = original.decode('utf-8')
                for name in ['lhs-s1001', 'lhs-s1002']:
                    start = text.index("name: '" + name + "'")
                    pos = text.index("NODE_ENV: 'production',", start) + len("NODE_ENV: 'production',")
                    assert 'LOG_LEVEL' not in text[start:text.index('WS_PORT:', pos)]
                    text = text[:pos] + "\n        LOG_LEVEL: 'warn'," + text[pos:]
                with f.open(BACKUP + '/ecosystem.before', 'wb') as out:
                    out.write(original)
                with f.open(ECO + '.log-maintenance.tmp', 'wb') as out:
                    out.write(text.encode('utf-8'))
            run(s, 'node --check < ' + ECO + '.log-maintenance.tmp')
            # Same filesystem rename; backup protects only this configuration.
            run(s, 'mv -- ' + ECO + '.log-maintenance.tmp ' + ECO)
            cron = 'SHELL=/bin/sh\nPATH=/usr/sbin:/usr/bin:/sbin:/bin\n*/10 * * * * root /usr/bin/python3 ' + REMOTE + ' >/dev/null 2>&1\n'
            with s.open_sftp() as f:
                with f.open(CRON, 'w') as out:
                    out.write(cron)
                f.chmod(CRON, 0o644)
            before = state(s)
            for name, port in [('lhs-s1002',8083),('lhs-s1001',8080)]:
                run(s, 'LOG_LEVEL=warn pm2 restart ' + name + ' --update-env')
                ok=False
                for _ in range(25):
                    response=run(s, "curl --max-time 4 -s -o /dev/null -w '%{http_code}' http://127.0.0.1:"+str(port)+'/ready || true').strip()
                    if response == '200':
                        ok=True;break
                    time.sleep(1)
                if not ok:
                    raise RuntimeError('READY_FAILED_'+name+'; backup retained; stop before next server')
                print(name+' READY200 LOG_LEVEL=warn',flush=True)
            after=state(s)
            assert [p for p in before if p['name'] not in ['lhs-s1001','lhs-s1002']]==[p for p in after if p['name'] not in ['lhs-s1001','lhs-s1002']]
            assert all(p['level']=='warn' for p in after if p['name'] in ['lhs-s1001','lhs-s1002'])
            # Persist existing process set with only these logging env changes.
            run(s, 'test ! -f /root/.pm2/dump.pm2 || cp -p /root/.pm2/dump.pm2 ' + BACKUP + '/dump.pm2.before')
            run(s, 'pm2 save')
            print(json.dumps(after))
        elif action == 'verify':
            print(json.dumps(state(s)))
            print(run(s, 'df -h /; du -sh /root/.pm2/logs /linhhoasu/lhs/newServer/logs /linhhoasu/_ai_workbench/logs/log-maintenance; systemctl is-active crond; cat '+CRON+'; tail -n 3 /linhhoasu/_ai_workbench/logs/log-maintenance/cleanup.jsonl'))
        else:
            raise ValueError('UNKNOWN_ACTION')
    finally:
        s.close()

if __name__ == '__main__':
    main()
