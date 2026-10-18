import hashlib,json,shlex
from snapshot_web_multiserver_20260906 import connect,run
T='/linhhoasu/webgame/gm/config.php';B='/linhhoasu/_ai_workbench/backups/donate_item_milestones_reduce100_20260913/config.php.before';S='/linhhoasu/_ai_workbench/temp/donate_caps_reduce100_20260913.php'
OLD=b'function donate_reward_amount_limit($id) { $id=(int)$id;if($id===3)return 0;if($id===2)return 10000000000;if($id===1||$id===7||$id===20||$id===60)return 10000000;if($id===4||$id===5||$id===6)return 1000000;if($id===8||$id===61)return 100000;return 999999; }'
NEW=b'function donate_reward_amount_limit($id) { $id=(int)$id;if($id===3)return 0;if($id===2)return 10000000000;if($id===1)return 10000000;if($id===7||$id===8||$id===20||$id===60||$id===61)return 100000;if($id===4||$id===5||$id===6)return 1000000;return 999999; }'
ssh=connect()
try:
 run(ssh,'install -d -m 700 /linhhoasu/_ai_workbench/backups/donate_item_milestones_reduce100_20260913')
 with ssh.open_sftp() as s:
  before=s.open(T,'rb').read()
  if before.count(OLD)!=1:raise RuntimeError('CAP_DRIFT')
  cand=before.replace(OLD,NEW,1);st=s.stat(T)
  try:s.stat(B);raise RuntimeError('BACKUP_EXISTS')
  except FileNotFoundError:pass
  with s.open(S,'wb') as f:f.write(cand)
  s.chmod(S,st.st_mode&0o777);run(ssh,'php -l '+shlex.quote(S))
  with s.open(B,'wb') as f:f.write(before)
  s.chmod(B,0o600);s.posix_rename(S,T)
  if s.open(T,'rb').read()!=cand:raise RuntimeError('READBACK')
 print(json.dumps({'result':'PASS','beforeSha256':hashlib.sha256(before).hexdigest(),'afterSha256':hashlib.sha256(cand).hexdigest(),'backup':B}))
finally:ssh.close()
