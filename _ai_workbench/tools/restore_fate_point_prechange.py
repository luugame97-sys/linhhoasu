import getpass, hashlib, os
from datetime import datetime, timezone
import paramiko

HOST='103.116.105.154';LOCAL_BACKUP=r'I:\Linhhoasu\server\server\_ai_workbench\backups\fate_point_fix_before_20260830_170622';REMOTE_ROOT='/linhhoasu';FILES={
 'lhs/newServer/src/handlers/fate.js':'fate.js',
 'webgame/game/js/main.min_a6195824.js':'main.min_a6195824.js',
 'webgame/game/index.html':'index.html',
}
def sha(p):
 h=hashlib.sha256()
 with open(p,'rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()
pw=getpass.getpass('VPS password (not logged): ');s=paramiko.SSHClient();s.set_missing_host_key_policy(paramiko.AutoAddPolicy());s.connect(HOST,username='root',password=pw,look_for_keys=False,allow_agent=False,timeout=15)
def run(cmd):
 _,o,e=s.exec_command(cmd);t=o.read().decode('utf8','replace');c=o.channel.recv_exit_status()
 if c:raise RuntimeError(e.read().decode('utf8','replace')[-4000:])
 return t
stages=[]
try:
 stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S');cur=f'/linhhoasu/_ai_workbench/backups/fate_point_prechange_current_{stamp}';run(f'mkdir -p {cur}')
 sf=s.open_sftp()
 try:
  for rel,base in FILES.items():
   remote=f'{REMOTE_ROOT}/{rel}';run(f'cp -p {remote} {cur}/{rel.replace("/","__")}')
   stage=f'{remote}.rollback-{stamp}'+('.js' if rel.endswith(('.js','.html')) else '');sf.put(os.path.join(LOCAL_BACKUP,base),stage);stages.append((rel,remote,stage))
 finally:sf.close()
 run(f'node --check {stages[0][2]}');run(f'node --check {stages[1][2]}');run(f"grep -q '20260830_freeze_guard5' {stages[2][2]}")
 for _rel,remote,stage in stages:run(f'mv {stage} {remote};chmod 644 {remote}')
 run('pm2 restart lhs-s1001 --update-env;pm2 save');ready=run("for i in $(seq 1 30);do c=$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/ready||true);[ \"$c\" = 200 ]&&echo 200&&exit 0;sleep 1;done;exit 1").strip();health=run('curl -fsS http://127.0.0.1:9200/health | head -c 900').strip();print('BACKUP_CURRENT='+cur);print('READY='+ready);print('HEALTH='+health)
 for rel,remote,_stage in stages:print('REMOTE_SHA256 '+rel+' '+run(f"sha256sum {remote}|cut -d' ' -f1").strip()+' EXPECTED_LOCAL_SHA256 '+sha(os.path.join(LOCAL_BACKUP,FILES[rel])))
finally:
 try:
  for _rel,_remote,stage in stages:run(f'rm -f {stage}')
 except Exception:pass
 s.close()
