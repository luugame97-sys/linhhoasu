"""Read-only current box handlers/catalog snapshot; no player data."""
from pathlib import Path
import hashlib,json,datetime as dt,paramiko
from rollback_role_lian_manifest_20260930 import ssh_config
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'_ai_workbench/temp/item_boxes_20261002'
FILES={
 'server/handlers/item.js':'/linhhoasu/lhs/newServer/src/handlers/item.js',
 **{'server/handlers/'+name:'/linhhoasu/lhs/newServer/src/handlers/'+name for name in ['artifact.js','curios.js','elf.js','valhalla-formation.js','pet.js','gem.js','bloodline.js','valhalla.js','raid.js']},
 **{'server/services/'+name:'/linhhoasu/lhs/newServer/src/services/'+name for name in ['RandomUsableItemRewardService.js','RewardGrantService.js','NativeItemRewardService.js','ConfigService.js','FashionBoxService.js','FixedEmojiItemService.js','ItemPillService.js']},
 'client/index.html':'/linhhoasu/webgame/game/index.html',
 'client/lhs-petsoul-fix-v1.js':'/linhhoasu/webgame/game/js/lhs-petsoul-fix-v1.js',
 'gmitem.txt':'/linhhoasu/webgame/gm/assets/item/gmitem.txt',
}
args,kw=ssh_config();assert args[0]=='103.116.104.165'
c=paramiko.SSHClient();c.set_missing_host_key_policy(paramiko.AutoAddPolicy());c.connect(*args,**kw)
report={'at':dt.datetime.now(dt.timezone.utc).isoformat(),'directPlayerWrites':0,'files':{}}
try:
 with c.open_sftp() as s:
  for key,remote in FILES.items():
   data=s.open(remote,'rb').read();h=hashlib.sha256(data).hexdigest();p=OUT/'baseline'/key
   p.parent.mkdir(parents=True,exist_ok=True)
   if p.exists() and hashlib.sha256(p.read_bytes()).hexdigest()!=h:raise RuntimeError('SNAPSHOT_DRIFT:'+key)
   if not p.exists():p.write_bytes(data)
   st=s.stat(remote);report['files'][remote]={'sha256':h,'bytes':len(data),'local':str(p),'uid':st.st_uid,'gid':st.st_gid,'mode':oct(st.st_mode&0o777)}
  remote='/linhhoasu/lhs/update/resource/assets/excel/config_fashion_20260909.bin';data=s.open(remote,'rb').read();h=hashlib.sha256(data).hexdigest()
  reuse=ROOT/'_ai_workbench/temp/petsoul_release_20261002/baseline/config.bin'
  if reuse.exists() and hashlib.sha256(reuse.read_bytes()).hexdigest()==h:p=reuse
  else:p=OUT/'baseline/config.bin';p.write_bytes(data)
  report['config']={'remote':remote,'local':str(p),'sha256':h}
 command="pm2 jlist | node -e \"let b='';process.stdin.on('data',x=>b+=x).on('end',()=>console.log(JSON.stringify(JSON.parse(b).map(p=>({name:p.name,pid:p.pid,status:p.pm2_env.status,restarts:p.pm2_env.restart_time})))));\""
 _,o,e=c.exec_command(command,timeout=15);text=o.read().decode('utf8');err=e.read().decode('utf8');rc=o.channel.recv_exit_status()
 if rc:raise RuntimeError('PM2_PROBE:'+err[-300:])
 report['processes']=json.loads(text)
finally:c.close()
(OUT/'snapshot.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps(report,ensure_ascii=False,indent=2))
