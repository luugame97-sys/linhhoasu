"""Deploy case-insensitive account handshake fix with backup and rollback."""
from __future__ import annotations

import getpass
import hashlib
import json
import shlex
from datetime import datetime, timezone
from pathlib import Path

import paramiko

HOST="103.116.105.154"
ROOT=Path(__file__).resolve().parents[1]
CAND=ROOT/'temp'/'account_case_insensitive_candidate_20260901'/'src'/'handlers'
FILES={
 'account.js':('/linhhoasu/lhs/newServer/src/handlers/account.js','326c1773c09318dfdbfa3de9b5a54719d770f71d98c54f511cb5a52106a61910'),
 'serverList.js':('/linhhoasu/lhs/newServer/src/handlers/serverList.js','714750d206e204599602c8c843eda6ff5aec6cf7a41ec4c660b23b9a66c134ec'),
}
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def run(s,c,timeout=180):
 _,o,e=s.exec_command(c,timeout=timeout);out=o.read().decode('utf8','replace');err=e.read().decode('utf8','replace');code=o.channel.recv_exit_status()
 if code:raise RuntimeError(err[-6000:]or out[-6000:]or f'exit={code}')
 return out
def main():
 hashes={n:sha(CAND/n) for n in FILES};password=getpass.getpass('Production password (not logged): ');s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.AutoAddPolicy());s.connect(HOST,username='root',password=password,look_for_keys=False,allow_agent=False,timeout=20,banner_timeout=20,auth_timeout=20)
 stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S');backup=f'/linhhoasu/_ai_workbench/backups/account_case_insensitive_pre_{stamp}';stage=f'/linhhoasu/_ai_workbench/temp/account_case_insensitive_{stamp}';swapped=False;old_pid=''
 try:
  for n,(r,x) in FILES.items():
   live=run(s,f'sha256sum -- {shlex.quote(r)}')
   if x not in live:raise RuntimeError(f'hash precondition failed {n}: {live.strip()}')
  pm=json.loads(run(s,"pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{const p=JSON.parse(s).find(x=>x.name===\"lhs-s1001\");console.log(JSON.stringify({pid:p&&p.pid,status:p&&p.pm2_env&&p.pm2_env.status}))})'").strip());old_pid=str(pm.get('pid',''))
  run(s,f'mkdir -p -- {shlex.quote(backup)} {shlex.quote(stage)}')
  for n,(r,_) in FILES.items():run(s,f'cp -a -- {shlex.quote(r)} {shlex.quote(backup+"/"+n)}')
  sf=s.open_sftp()
  try:
   for n in FILES:sf.put(str(CAND/n),stage+'/'+n)
  finally:sf.close()
  for n in FILES:
   run(s,f'cd /linhhoasu/lhs/newServer && node --check {shlex.quote(stage+"/"+n)}')
   if hashes[n] not in run(s,f'sha256sum -- {shlex.quote(stage+"/"+n)}'):raise RuntimeError('stage hash mismatch '+n)
  for n,(r,_) in FILES.items():run(s,f'install -o root -g root -m 0644 -- {shlex.quote(stage+"/"+n)} {shlex.quote(r)}')
  swapped=True
  require=run(s,"cd /linhhoasu/lhs/newServer && node -e \"require('./src/handlers/account');require('./src/handlers/serverList');console.log('REQUIRE_OK')\"")
  if 'REQUIRE_OK' not in require:raise RuntimeError('require smoke failed')
  run(s,'pm2 restart lhs-s1001 --update-env >/dev/null && pm2 save >/dev/null',240)
  health=run(s,"for i in $(seq 1 30); do h=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:8080/ready || true); w=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:9200/health || true); [ \"$h|$w\" = \"200|200\" ] && { echo \"http=$h ws=$w\"; exit 0; }; sleep 1; done; exit 1",240)
  new_pm=run(s,"pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{const p=JSON.parse(s).find(x=>x.name===\"lhs-s1001\");console.log(JSON.stringify({pid:p&&p.pid,status:p&&p.pm2_env&&p.pm2_env.status,restarts:p&&p.pm2_env&&p.pm2_env.restart_time}))})'")
 except Exception:
  if swapped:
   for n,(r,_) in FILES.items():
    try:run(s,f'cp -a -- {shlex.quote(backup+"/"+n)} {shlex.quote(r)}')
    except Exception:pass
   try:run(s,'pm2 restart lhs-s1001 --update-env >/dev/null',240)
   except Exception:pass
  raise
 finally:s.close()
 print(json.dumps({'result':'PASS','backup':backup,'hashes':hashes,'oldPid':old_pid,'health':health,'pm2':new_pm,'restart':['lhs-s1001']},ensure_ascii=False,indent=2))
if __name__=='__main__':main()
