"""Narrow System 231 release with pinned snapshots, atomic swaps and rollback."""
from __future__ import annotations
import datetime as dt
import hashlib
import json
import shlex
import sys
import time
from pathlib import Path
import paramiko
from rollback_role_lian_manifest_20260930 import ssh_config

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '_ai_workbench/temp/system231_20261001'
FILES = {
    'server/main.bin': '/linhhoasu/lhs/update/resource/assets/excel/config_fashion_20260909.bin',
    'server/fallback.bin': '/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin',
    'client/main.bin': '/linhhoasu/webgame/game/update/resource/assets/excel/config_fashion_20260909.bin',
    'client/fallback.bin': '/linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin',
    'index.html': '/linhhoasu/webgame/game/index.html',
}
PORTS = {'lhs-s1001': 8080, 'lhs-s1002': 8083, 'lhs-s1003': 8084, 'lhs-s1004': 8085, 'lhs-s1005': 8086, 'lhs-s1006': 8087}
EXPECTED = {
    'server/main.bin': '01e4adbdd5ba7283f0bebbf525eb69a27434a8dcaf15d57189a39d0d10663a25',
    'server/fallback.bin': '01e4adbdd5ba7283f0bebbf525eb69a27434a8dcaf15d57189a39d0d10663a25',
    'client/main.bin': '01e4adbdd5ba7283f0bebbf525eb69a27434a8dcaf15d57189a39d0d10663a25',
    'client/fallback.bin': '495292380d341ee3b55d0887d0bdaace923cf8f159ceff32d7519021da75244c',
    'index.html': 'ef6583d2b504331693f7e78d3af08f421b62f7b8035aaa0780e8e76b24b64ea8',
}
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
def sha(data): return hashlib.sha256(data).hexdigest()
def stamp(): return dt.datetime.now(dt.timezone.utc).isoformat()
def save(name, data):
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / name).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

class Remote:
    def __init__(self):
        args, kwargs = ssh_config()
        assert args[0] == '103.116.104.165'
        self.ssh = paramiko.SSHClient()
        self.ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        self.ssh.connect(*args, **kwargs)
        self.sftp = self.ssh.open_sftp()
    def close(self):
        self.sftp.close(); self.ssh.close()
    def run(self, cmd, stdin_text=None, timeout=45):
        i, o, e = self.ssh.exec_command(cmd, timeout=timeout)
        if stdin_text is not None:
            i.write(stdin_text); i.channel.shutdown_write()
        out, err = o.read().decode('utf8', 'replace'), e.read().decode('utf8', 'replace')
        rc = o.channel.recv_exit_status()
        if rc: raise RuntimeError('REMOTE_FAILED:' + str(rc) + ':' + err[-700:])
        return out.strip()
    def read(self, p):
        with self.sftp.open(p, 'rb') as f: return f.read()
    def hash(self, p): return self.run('sha256sum -- ' + shlex.quote(p)).split()[0]
    def processes(self):
        raw = json.loads(self.run('pm2 jlist 2>/dev/null'))
        return {p['name']: {'pid': p['pid'], 'status': p['pm2_env']['status'], 'restarts': p['pm2_env'].get('restart_time'),
                'cwd': p['pm2_env'].get('pm_cwd'), 'uptime': p['pm2_env'].get('pm_uptime'),
                'configPath': p['pm2_env'].get('CONFIG_BIN_PATH'), 'killTimeout': p['pm2_env'].get('kill_timeout')}
                for p in raw}
    def ready(self, name, retry=False):
        deadline = time.monotonic() + (45 if retry else 8)
        while True:
            try:
                row = json.loads(self.run(f'curl --max-time 5 -fsS http://127.0.0.1:{PORTS[name]}/ready', timeout=8))
                if row.get('status') == 'ok' and row.get('checks', {}).get('mongo') is True and row.get('checks', {}).get('redis') is True: return row
            except Exception: pass
            if time.monotonic() >= deadline: raise RuntimeError('READINESS_FAILED:' + name)
            time.sleep(1)
    def http_hash(self, url):
        cmd = 'curl --max-time 25 -fsS ' + shlex.quote(url) + ' | sha256sum'
        return self.run('bash -o pipefail -c ' + shlex.quote(cmd)).split()[0]

def snapshot(r):
    if (OUT / 'baseline.json').exists(): raise RuntimeError('SNAPSHOT_ALREADY_EXISTS')
    record = {'at': stamp(), 'files': {}, 'processes': r.processes(), 'productionWrites': 0}
    for name, remote in FILES.items():
        data = r.read(remote)
        if sha(data) != EXPECTED[name]: raise RuntimeError('SNAPSHOT_DRIFT:' + name)
        target = OUT / 'baseline' / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        local = ROOT / remote.lstrip('/')
        record['files'][name] = {'remote': remote, 'sha256': sha(data), 'bytes': len(data),
            'localSha': sha(local.read_bytes()) if local.exists() else None}
    record['ready'] = {n: r.ready(n) for n in PORTS}
    save('baseline.json', record)
    print(json.dumps({'result': 'SNAPSHOT_OK', 'files': {k: v['sha256'] for k,v in record['files'].items()}, 'ready': len(record['ready'])}))

def runtime_probe(r, expected_open, targets=None):
    targets = targets or FILES
    js = r'''
const fs=require('fs');const log=require.resolve('./src/logger');require.cache[log]={id:log,filename:log,loaded:true,exports:{info(){},warn(){},error(){},debug(){}}};
const targets=TARGET_PATHS;
const c=require('./src/services/ConfigService');const t=c.loadAllTables(targets['server/main.bin']);const row=t.SystemConfig[231];
const zlib=require('zlib'),{BinJsonUtil,ByteArray}=require('./src/protocol/BinJsonUtil');
function readSystem(p){const b=fs.readFileSync(p),a=new ByteArray(b);while(a.position<a.length){const n=a.readUTFBytes(a.readUnsignedByte()),len=a.readUnsignedInt(),start=a.position;a.position+=len;if(n==='SystemConfig')return BinJsonUtil.readFullJson(new ByteArray(zlib.inflateSync(b.subarray(start,start+len))))[231];}throw Error('MISSING_SYSTEM_CONFIG');}
const bins={};for(const [name,p] of Object.entries(targets)){if(name==='index.html')continue;bins[p]=readSystem(p);}
console.log(JSON.stringify({row,bins,base:t.PetBaseConfig.levelMax,qualities:t.PetBaseConfig.breakLimitPetQuality,stage50:t.CoercionConfig[50],tableCount:Object.keys(t).length}));process.exit(0);
'''
    js = js.replace('TARGET_PATHS', json.dumps(targets))
    data = json.loads(r.run('cd /linhhoasu/lhs/newServer && timeout 35s node -', js, timeout=40))
    conditions = data['row']['conditions']
    assert {'type': 7, 'value': 206, 'cond': 4} in conditions
    assert {'type': 3, 'value': 135, 'cond': 4} in conditions
    assert any(c['type'] == 5 for c in conditions) is not expected_open
    assert data['base'] == 200 and data['stage50']['limitLevelUp'] == 800
    for row in data['bins'].values(): assert row == data['row']
    return data

def rollback(r, receipt, build):
    restored = []
    for name in reversed(receipt['swapped']):
        dest = FILES[name]
        if r.hash(dest) != build['files'][name]['sha256']: raise RuntimeError('ROLLBACK_CAS_BLOCKED:' + name)
        before = receipt['backupDir'] + '/' + name
        if r.hash(before) != EXPECTED[name]: raise RuntimeError('ROLLBACK_BACKUP_MISMATCH:' + name)
        stage = dest + '.system231_rollback.tmp'
        r.run('cp -p -- ' + shlex.quote(before) + ' ' + shlex.quote(stage))
        r.run('mv -f -- ' + shlex.quote(stage) + ' ' + shlex.quote(dest))
        restored.append(name)
    for name in receipt['restarted']:
        r.run('pm2 restart ' + shlex.quote(name), timeout=55)
        r.ready(name, retry=True)
    receipt['rollback'] = {'restored': restored, 'at': stamp()}

def deploy(r):
    if (OUT / 'deployment.json').exists(): raise RuntimeError('DEPLOYMENT_RECEIPT_ALREADY_EXISTS')
    base = json.loads((OUT / 'baseline.json').read_text(encoding='utf8'))
    build = json.loads((OUT / 'build.json').read_text(encoding='utf8'))
    test = json.loads((OUT / 'test.json').read_text(encoding='utf8'))
    assert test['result'] == 'PASS' and test['passed'] == test['total'] == 5
    assert test['candidateHashes'] == {n: f['sha256'] for n, f in build['files'].items()}
    assert set(base['files']) == set(build['files']) == set(FILES)
    for name in FILES:
        assert build['files'][name]['beforeSha256'] == base['files'][name]['sha256'] == EXPECTED[name]
    for name, remote in FILES.items():
        if r.hash(remote) != EXPECTED[name]: raise RuntimeError('DEPLOY_CAS_DRIFT:' + name)
        if sha((OUT/'candidate'/name).read_bytes()) != build['files'][name]['sha256']: raise RuntimeError('CANDIDATE_DRIFT:' + name)
    pre = r.processes()
    for name in PORTS:
        assert pre[name]['status'] == 'online' and pre[name]['cwd'] == '/linhhoasu/lhs/newServer'
        assert not pre[name]['configPath']
        r.ready(name)
    now = dt.datetime.now(dt.timezone(dt.timedelta(hours=7))).strftime('%Y%m%d_%H%M%S')
    backup = '/linhhoasu/_ai_workbench/backups/system231_' + now
    receipt = {'result': 'STARTED', 'at': stamp(), 'backupDir': backup, 'swapped': [], 'restarted': [], 'beforeProcesses': pre,
               'directPlayerWrites': 0, 'serverOpenTimesChanged': False, 'sourceHandlersChanged': False}
    stages = {}
    try:
        r.run('mkdir -m 700 -- ' + shlex.quote(backup))
        for part in ['server','client']: r.run('mkdir -m 700 -- ' + shlex.quote(backup+'/'+part))
        for name, remote in FILES.items():
            before = backup+'/'+name
            r.run('cp -p -- '+shlex.quote(remote)+' '+shlex.quote(before))
            if r.hash(before) != EXPECTED[name]: raise RuntimeError('BACKUP_HASH_FAILED:'+name)
            stage = remote + '.system231_'+now+'.tmp'
            r.sftp.put(str(OUT/'candidate'/name), stage)
            r.run('chown --reference='+shlex.quote(remote)+' '+shlex.quote(stage))
            r.run('chmod --reference='+shlex.quote(remote)+' '+shlex.quote(stage))
            if r.hash(stage) != build['files'][name]['sha256']: raise RuntimeError('STAGE_HASH_FAILED:'+name)
            stages[name] = stage
        print(json.dumps({'phase':'staged_runtime_validation','backupDir':backup}),flush=True)
        receipt['stageRuntime']=runtime_probe(r,True,stages)
        print(json.dumps({'phase':'stage_runtime_pass','system231':receipt['stageRuntime']['row']['conditions']}),flush=True)
        save('deployment.json', receipt)
        def swap(name):
            remote=FILES[name]
            if r.hash(remote)!=EXPECTED[name]: raise RuntimeError('SWAP_CAS_FAILED:'+name)
            r.run('mv -f -- '+shlex.quote(stages[name])+' '+shlex.quote(remote))
            receipt['swapped'].append(name)
            if r.hash(remote)!=build['files'][name]['sha256']: raise RuntimeError('SWAP_HASH_FAILED:'+name)
            save('deployment.json', receipt)
        swap('server/main.bin'); swap('server/fallback.bin')
        for name in PORTS:
            receipt['restarted'].append(name)
            save('deployment.json',receipt)
            r.run('pm2 restart '+shlex.quote(name), timeout=55)
            ready=r.ready(name,retry=True)
            proc=r.processes()[name]
            assert proc['pid'] != pre[name]['pid'] and proc['status']=='online'
            receipt.setdefault('afterReady',{})[name]=ready
            receipt.setdefault('restartReadback',{})[name]=proc
            save('deployment.json',receipt)
            print(json.dumps({'node':name,'ready':ready['status'],'pid':proc['pid']}),flush=True)
        swap('client/main.bin'); swap('client/fallback.bin'); swap('index.html')
        receipt['runtime']=runtime_probe(r,True)
        save('deployment.json',receipt)
        version=build['configVersion']
        urls={'index.html':'/index.html','client/main.bin':'/update/resource/assets/excel/config_fashion_20260909.bin?v='+version,
              'client/fallback.bin':'/update/resource/assets/excel/config_e5ac72c2.bin?v='+version}
        receipt['served']={}
        for name, suffix in urls.items():
            receipt['served'][name]={}
            for label, origin in [('loopback','http://127.0.0.1:81'),('public','https://linhhoasu.lol')]:
                h=r.http_hash(origin+suffix)
                if h!=build['files'][name]['sha256']: raise RuntimeError('SERVED_HASH_FAILED:'+label+':'+name)
                receipt['served'][name][label]=h
                save('deployment.json',receipt)
        post=r.processes()
        receipt['afterProcesses']=post
        for name, proc in pre.items():
            if name not in PORTS:
                assert post[name]['pid']==proc['pid'] and post[name]['restarts']==proc['restarts'], 'NON_GAME_PROCESS_CHANGED:'+name
        receipt['postReady']={n:r.ready(n) for n in PORTS}
        receipt['result']='DEPLOYED';receipt['completedAt']=stamp()
        save('deployment.json',receipt)
        print(json.dumps({'result':receipt['result'],'backupDir':backup,'served':receipt['served'],'completedAt':receipt['completedAt']},ensure_ascii=False),flush=True)
    except Exception as exc:
        receipt['result']='FAILED';receipt['error']=str(exc)
        try: rollback(r,receipt,build)
        except Exception as rb: receipt['rollbackError']=str(rb)
        save('deployment.json',receipt)
        raise
    finally:
        for stage in stages.values():
            try: r.sftp.remove(stage)
            except FileNotFoundError: pass

def main():
    mode=sys.argv[1] if len(sys.argv)>1 else 'snapshot'
    if mode not in ('snapshot','deploy','precheck','sync-local','postcheck'): raise ValueError('MODE')
    r=Remote()
    try:
        if mode=='snapshot': snapshot(r)
        elif mode=='precheck':
            result=runtime_probe(r,False)
            save('baseline-runtime.json',result)
            print(json.dumps(result))
        elif mode=='deploy': deploy(r)
        elif mode=='postcheck':
            source=(ROOT/'_ai_workbench/tools/audit_coercion_live_20261001.js').read_text(encoding='utf-8')
            data=json.loads(r.run('cd /linhhoasu/lhs/newServer && timeout 35s node -',source,timeout=40))
            prior=json.loads((ROOT/'_ai_workbench/temp/coercion_audit_20261001/live.json').read_text(encoding='utf-8'))
            old_times={row['name']:row['server']['openTime'] for row in prior['rows']}
            for row in data['rows']:
                assert row['server']['openTime']==old_times[row['name']]
                assert row['system231']['conditions']==[{'type':7,'value':206,'cond':4},{'type':3,'value':135,'cond':4}]
            save('postcheck.json',data)
            print(json.dumps({'at':data['at'],'serverOpenTimesUnchanged':True,'nodes':[{'name':row['name'],'conditions':row['system231']['conditions'],'stats':row['stats'],'histogram':row['histogram']} for row in data['rows']]}))
        else:
            receipt=json.loads((OUT/'deployment.json').read_text(encoding='utf8'))
            assert receipt['result']=='DEPLOYED'
            base=json.loads((OUT/'baseline.json').read_text(encoding='utf8'))
            build=json.loads((OUT/'build.json').read_text(encoding='utf8'))
            result={}
            for name,remote in FILES.items():
                local=ROOT/remote.lstrip('/')
                expected=build['files'][name]['sha256']
                assert r.hash(remote)==expected, 'LIVE_DRIFT:'+name
                if sha(local.read_bytes())==expected:
                    result[name]='already_synced';continue
                assert sha(local.read_bytes())==base['files'][name]['localSha'], 'LOCAL_DRIFT:'+name
                backup=OUT/'local-preimage'/name
                backup.parent.mkdir(parents=True,exist_ok=True)
                with backup.open('xb') as stream:stream.write(local.read_bytes())
                local.write_bytes((OUT/'candidate'/name).read_bytes())
                assert sha(local.read_bytes())==expected
                result[name]='synced_with_backup'
            save('local-sync.json',result);print(json.dumps(result))
    finally:r.close()
if __name__=='__main__': main()
