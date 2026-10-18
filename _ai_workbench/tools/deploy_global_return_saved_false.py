import getpass,hashlib,os,posixpath,paramiko
from datetime import datetime,timezone

ROOT='/linhhoasu/lhs/newServer'; HANDLERS=ROOT+'/src/handlers'
REPLACEMENTS={
 'await playerService.savePlayer(session.userId, player);':'await playerService.savePlayer(session.userId, player, { returnSaved: false });',
 'await playerService.savePlayer(session.userId, session.player);':'await playerService.savePlayer(session.userId, session.player, { returnSaved: false });',
 'await playerService.savePlayer(userId, player);':'await playerService.savePlayer(userId, player, { returnSaved: false });',
}
ssh=paramiko.SSHClient();ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy());ssh.connect('103.116.105.154',username='root',password=getpass.getpass('VPS password (not logged): '),look_for_keys=False,allow_agent=False,timeout=15)
def run(cmd,check=True):
 _,o,e=ssh.exec_command(cmd);out=o.read().decode('utf-8','replace');err=e.read().decode('utf-8','replace');code=o.channel.recv_exit_status()
 if check and code:raise RuntimeError(f'command failed {code}: {cmd}\n{err[-1500:]}')
 return out
try:
 stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S');backup=f'/linhhoasu/_ai_workbench/backups/lag_fix_return_saved_false_{stamp}';run(f'mkdir -p {backup}')
 run("find /linhhoasu/lhs/newServer/src/handlers -type f -name '*.js.deploy-*' -delete")
 files=run("find /linhhoasu/lhs/newServer/src/handlers -type f -name '*.js' -print").splitlines();changed=[];total=0;sftp=ssh.open_sftp()
 try:
  for path in files:
   with sftp.open(path,'rb') as f:raw=f.read()
   text=raw.decode('utf-8');next_text=text;counts={}
   for old,new in REPLACEMENTS.items():
    n=next_text.count(old);counts[old]=n
    if n:next_text=next_text.replace(old,new);total+=n
   if next_text==text:continue
   rel=path[len(HANDLERS)+1:];target=f'{backup}/{rel}';run(f"mkdir -p '{posixpath.dirname(target)}'; cp -p '{path}' '{target}'")
   temp=path+f'.deploy-{stamp}.js';
   with sftp.open(temp,'wb') as f:f.write(next_text.encode('utf-8'))
   changed.append((path,temp,rel,sum(counts.values()),hashlib.sha256(next_text.encode()).hexdigest()))
 finally:sftp.close()
 if total<300:raise RuntimeError(f'unexpected replacement count {total}')
 for path,temp,rel,n,h in changed:run(f"node --check '{temp}'")
 for path,temp,rel,n,h in changed:run(f"mv '{temp}' '{path}'; chmod 644 '{path}'")
 try:
  contract=run(f"cd {ROOT} && npm run test:core-contract")
 except Exception:
  for path,temp,rel,n,h in changed:run(f"cp -p '{backup}/{rel}' '{path}'",check=False)
  raise
 print('BACKUP='+backup);print('FILES='+str(len(changed)));print('REPLACEMENTS='+str(total));print(contract.strip())
 run('pm2 restart lhs-s1001 --update-env');run('pm2 save');ready=run("for i in $(seq 1 30); do c=$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/ready || true); [ \"$c\" = 200 ] && echo 200 && exit 0; sleep 1; done; exit 1").strip();print('READY_HTTP='+ready)
 print('STATUS='+run("pm2 jlist | python3 -c \"import sys,json;p=next(x for x in json.load(sys.stdin) if x.get('name')=='lhs-s1001');print(p['pm2_env']['status'],p['pid'],p['pm2_env']['restart_time'])\"").strip())
finally:ssh.close()
