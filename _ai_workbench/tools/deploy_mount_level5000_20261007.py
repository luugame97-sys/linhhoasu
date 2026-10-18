import base64, hashlib, json, shlex, sys, time
from datetime import datetime, timezone
from pathlib import Path
import paramiko

ROOT = Path(__file__).resolve().parents[2]
STAGE = ROOT / '_ai_workbench' / 'temp' / 'mount_level5000_20261007'
CRED = ROOT / '_ai_workbench' / 'VPS103.116.104.165.txt'
HOST_KEY_B64 = 'AAAAC3NzaC1lZDI1NTE5AAAAIAh0MQqGHi2vS59Si4zOty+N5c+t1eIs9haYhyvRk/jx'
HOST_FINGERPRINT = 'SHA256:u2WmIwEfcu/oSANYjx83Myx/uHlbncK1tvL7hkQKTGk'
BACKUP = '/linhhoasu/_ai_workbench/backups/mount_level5000_20261007_pre'
TARGETS = {
  '/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin': STAGE / 'next' / 'server.bin',
  '/linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin': STAGE / 'next' / 'client.bin',
  '/linhhoasu/webgame/game/update/resource/assets/excel/config_fashion_20260909.bin': STAGE / 'next' / 'fashion.bin',
  '/linhhoasu/webgame/game/index.html': STAGE / 'next' / 'index.html',
}
EXPECTED = {
  '/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin': 'fbf1950dbd7fee7bf783c4308ef91bc9b59b89eaa0ac352c13598e4c29513a46',
  '/linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin': '5f38896d14610055962671f3df443da121ce97607bf9f0d0d5610c40e559d02c',
  '/linhhoasu/webgame/game/update/resource/assets/excel/config_fashion_20260909.bin': 'fbf1950dbd7fee7bf783c4308ef91bc9b59b89eaa0ac352c13598e4c29513a46',
  '/linhhoasu/webgame/game/index.html': '7055e5925f4facfb9514d57ed8aadd3f569a4f4955e0387bc6c571c3d72cc2a0',
}
NODES = [('lhs-s1001',8080),('lhs-s1002',8083),('lhs-s1003',8084),('lhs-s1004',8085),('lhs-s1005',8086),('lhs-s1006',8087),('lhs-s1007',8088)]

def sha(data): return hashlib.sha256(data).hexdigest()
class ConfirmedKey(paramiko.MissingHostKeyPolicy):
  def missing_host_key(self, client, hostname, key):
    actual = 'SHA256:' + base64.b64encode(hashlib.sha256(key.asbytes()).digest()).decode().rstrip('=')
    if hostname != '103.116.104.165' or key.get_name() != 'ssh-ed25519' or actual != HOST_FINGERPRINT:
      raise paramiko.SSHException('VPS_HOST_KEY_MISMATCH')
    client.get_host_keys().add(hostname, key.get_name(), key)

def run(s, cmd, timeout=60):
  i,o,e=s.exec_command(cmd, timeout=timeout)
  out=o.read().decode('utf-8',errors='replace'); err=e.read().decode('utf-8',errors='replace')
  rc=o.channel.recv_exit_status()
  if rc != 0: raise RuntimeError(f'REMOTE_COMMAND_FAILED:{rc}:{cmd}:{err[-1000:]}')
  return out

def write_atomic(s, remote, data):
  tmp = remote + '.mount5000_tmp_20261007'
  b64 = base64.b64encode(data)
  i,o,e=s.exec_command('base64 -d > ' + shlex.quote(tmp), timeout=120)
  i.write(b64); i.channel.shutdown_write(); err=e.read().decode('utf-8',errors='replace'); rc=o.channel.recv_exit_status()
  if rc != 0: raise RuntimeError('REMOTE_UPLOAD_FAILED:'+remote+':'+err[-500:])
  run(s, 'chmod --reference=' + shlex.quote(remote) + ' ' + shlex.quote(tmp))
  run(s, 'mv -f ' + shlex.quote(tmp) + ' ' + shlex.quote(remote))

def main():
  local = {remote: (p.read_bytes(), sha(p.read_bytes())) for remote,p in TARGETS.items()}
  result={'startedAt':datetime.now(timezone.utc).isoformat(),'version':'mount_level5000_v1','scope':'SwordLevelConfig 1-5000; index cache bust','backup':BACKUP,'targets':{},'restarted':[]}
  creds=CRED.read_text(encoding='utf-8-sig').splitlines()
  if len(creds)!=3 or creds[0].strip()!='103.116.104.165' or creds[1].strip()!='root': raise RuntimeError('CREDENTIAL_TARGET_MISMATCH')
  s=paramiko.SSHClient(); s.load_system_host_keys(); s.set_missing_host_key_policy(ConfirmedKey()); s.connect(creds[0].strip(),username='root',password=creds[2],look_for_keys=False,allow_agent=False,timeout=20)
  try:
    if run(s,'test ! -e '+shlex.quote(BACKUP)+' && echo absent').strip()!='absent': raise RuntimeError('BACKUP_ALREADY_EXISTS')
    run(s,'mkdir -p '+shlex.quote(BACKUP))
    for remote, (data, local_hash) in local.items():
      remote_hash=run(s,'sha256sum '+shlex.quote(remote)).split()[0]
      result['targets'][remote]={'expectedBefore':EXPECTED[remote],'observedBefore':remote_hash,'candidate':local_hash,'bytes':len(data)}
      if remote_hash != EXPECTED[remote]: raise RuntimeError(f'CAS_MISMATCH:{remote}:{remote_hash}:{EXPECTED[remote]}')
    for remote in TARGETS:
      dest=BACKUP+remote
      run(s,'mkdir -p '+shlex.quote(dest.rsplit('/',1)[0])+' && cp -p '+shlex.quote(remote)+' '+shlex.quote(dest))
    for remote,(data,_) in local.items(): write_atomic(s,remote,data)
    result['postWriteHashes']={remote:run(s,'sha256sum '+shlex.quote(remote)).split()[0] for remote in TARGETS}
    if any(result['postWriteHashes'][r] != local[r][1] for r in TARGETS): raise RuntimeError('POSTWRITE_HASH_MISMATCH')
    cfgjs="const c=require('/linhhoasu/lhs/newServer/src/services/ConfigService');const t=c.loadAllTables().SwordLevelConfig;console.log(JSON.stringify({q:Object.fromEntries([2,3,4,6,7].map(q=>[q,{max:Object.keys(t[q]||{}).length,l1000:t[q][1000].consumes.count,l5000:t[q][5000].consumes.count,a5000:t[q][5000].attrs[51]}]))}));"
    result['runtimeConfig']=json.loads(run(s,"node -e "+shlex.quote(cfgjs),timeout=120).splitlines()[-1])
    for name,port in NODES:
      run(s,'pm2 restart '+shlex.quote(name)+' --update-env',timeout=60)
      ready=None
      for _ in range(20):
        try:
          ready=run(s,'curl -fsS --max-time 5 http://127.0.0.1:'+str(port)+'/ready',timeout=10).strip()
          if ready: break
        except Exception: pass
        time.sleep(2)
      if not ready: raise RuntimeError('READY_TIMEOUT:'+name)
      result['restarted'].append({'name':name,'port':port,'ready':ready})
    procjs="let a=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log(JSON.stringify(a.filter(x=>/^lhs-s100[1-7]$/.test(x.name)).map(x=>({name:x.name,pid:x.pid,status:x.pm2_env.status,restarts:x.pm2_env.restart_time}))));"
    result['processes']=json.loads(run(s,'pm2 jlist | node -e '+shlex.quote(procjs),timeout=30))
    result['servedIndex']=run(s,'curl -fsS http://127.0.0.1:81/index.html',timeout=30)
    result['servedIndexMarker']='20261007_mount_level5000_v1' in result['servedIndex']
    result['publicClientHash']=run(s,'curl -fsS http://127.0.0.1:81/update/resource/assets/excel/config_e5ac72c2.bin | sha256sum').split()[0]
    result['publicFashionHash']=run(s,'curl -fsS http://127.0.0.1:81/update/resource/assets/excel/config_fashion_20260909.bin | sha256sum').split()[0]
    result['errors']=run(s,"for f in /root/.pm2/logs/lhs-s100{1,2,3,4,5,6,7}-error.log; do tail -120 \"$f\"; done | grep -Ei 'CONFIG_DECODE_FAILED|SyntaxError|ReferenceError|uncaughtException|unhandledRejection|EADDRINUSE' || true",timeout=30)
    result['result']='PASS' if all(x['status']=='online' for x in result['processes']) and all(result['restarted'][i]['ready'] for i in range(7)) and result['servedIndexMarker'] and result['publicClientHash']==local['/linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin'][1] and result['publicFashionHash']==local['/linhhoasu/webgame/game/update/resource/assets/excel/config_fashion_20260909.bin'][1] and not result['errors'] else 'HOLD'
  finally:
    s.close()
  result['servedIndex']=result.get('servedIndex','')
  result['servedIndexSha256']=sha(result['servedIndex'].encode()) if result.get('servedIndex') else None
  result['servedIndex']=result['servedIndex'][:0] if result.get('servedIndex') else ''
  result['finishedAt']=datetime.now(timezone.utc).isoformat(); (STAGE/'deploy.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8'); print(json.dumps({k:v for k,v in result.items() if k not in ('servedIndex',)} ,ensure_ascii=False,indent=2))
if __name__=='__main__': main()
