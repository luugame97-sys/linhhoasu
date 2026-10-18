from pathlib import Path
from datetime import datetime
import hashlib, paramiko, shlex, time

ROOT=Path(__file__).resolve().parents[1]
cred=(ROOT/'VPS103.116.105.154.txt').read_text(encoding='utf8').splitlines()
host,user,pw=cred[0].strip(),cred[1].strip(),cred[2].strip()
local=(ROOT/'..'/'linhhoasu'/'lhs'/'newServer'/'src'/'handlers'/'account.js').resolve()
remote='/linhhoasu/lhs/newServer/src/handlers/account.js'
expected='2cbd59f407ba92331049c2c3cb593e0d06ff4c9129d9076278d63431dbba0e07'
stamp=datetime.now().strftime('%Y%m%d_%H%M%S')
backup=f'/linhhoasu/_ai_workbench/backups/login_import_hotfix_{stamp}'
stage=f'/linhhoasu/_ai_workbench/temp/login_import_hotfix_{stamp}.js'
newhash=hashlib.sha256(local.read_bytes()).hexdigest()
s=paramiko.SSHClient();s.set_missing_host_key_policy(paramiko.AutoAddPolicy());s.connect(host,username=user,password=pw,look_for_keys=False,allow_agent=False,timeout=20,banner_timeout=20,auth_timeout=20)
def run(cmd,check=True):
 _,o,e=s.exec_command(cmd,timeout=120);out=o.read().decode('utf8','replace');err=e.read().decode('utf8','replace');code=o.channel.recv_exit_status()
 if check and code: raise RuntimeError(err or out)
 return out
try:
 got=run(f'sha256sum -- {remote}').split()[0]
 if got!=expected: raise RuntimeError(f'CAS mismatch {got}')
 run(f'mkdir -p -- {shlex.quote(backup)}')
 run(f'cp -p -- {remote} {backup}/account.js.before')
 sf=s.open_sftp();sf.put(str(local),stage);sf.chmod(stage,0o640);sf.close()
 run(f'cd /linhhoasu/lhs/newServer && node --check {stage}')
 run(f'mv -f -- {stage} {remote}')
 if run(f'sha256sum -- {remote}').split()[0]!=newhash: raise RuntimeError('post-swap hash mismatch')
 result={'before':got,'after':newhash,'backup':backup}
 for name in ['lhs-s1002','lhs-s1001']:
  run(f'pm2 restart {name} --update-env')
  result[name]=run(f'pm2 pid {name}').strip()
 for _ in range(20):
  a=run("curl -sS -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:8080/ready",False).strip();b=run("curl -sS -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:8083/ready",False).strip()
  if a=='200' and b=='200': result['ready']={'S1':a,'S2':b};break
  time.sleep(2)
 else: result['ready']={'S1':a,'S2':b}
 print(result)
finally: s.close()
