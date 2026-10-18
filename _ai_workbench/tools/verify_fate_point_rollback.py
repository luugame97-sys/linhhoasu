import getpass, hashlib, json, os
import paramiko

HOST='103.116.105.154';ROOT='/linhhoasu';LOCAL_ROOT=r'I:\Linhhoasu\server\server'
FILES={
 'lhs/newServer/src/handlers/fate.js':os.path.join(LOCAL_ROOT,'linhhoasu','lhs','newServer','src','handlers','fate.js'),
 'webgame/game/js/main.min_a6195824.js':os.path.join(LOCAL_ROOT,'linhhoasu','webgame','game','js','main.min_a6195824.js'),
 'webgame/game/index.html':os.path.join(LOCAL_ROOT,'linhhoasu','webgame','game','index.html'),
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
try:
 hashes={}
 for rel,local in FILES.items():hashes[rel]={'local':sha(local),'remote':run(f"sha256sum {ROOT}/{rel} | cut -d' ' -f1").strip()}
 token=run("curl -fsS http://127.0.0.1:81/ | grep -o '20260830_freeze_guard5' | head -1 || true").strip();new_token=run("curl -fsS http://127.0.0.1:81/ | grep -o '20260830_fate_point_fix6' | head -1 || true").strip();marker=run("curl -fsS http://127.0.0.1:81/js/main.min_a6195824.js | grep -o 'n+=Y.ItemModel.GetItemCount(99)' | head -1 || true").strip();core=run('cd /linhhoasu/lhs/newServer && npm run test:core-contract').strip().splitlines()[-1];ready=run("curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/ready").strip();health=json.loads(run('curl -fsS http://127.0.0.1:9200/health'));print(json.dumps({'result':'ok','hashes':hashes,'oldToken':token,'newToken':new_token,'patchMarker':marker,'core':core,'ready':ready,'pid':health['runtime']['pid'],'bots':health['runtime'].get('bots',{}).get('botCount')},ensure_ascii=False,indent=2))
finally:s.close()
