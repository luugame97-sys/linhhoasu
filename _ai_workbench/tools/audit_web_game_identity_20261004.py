"""Read live identity routes and recent delivery metadata; never expose credentials."""
import json,hashlib
from pathlib import Path
from skin_incident_remote import connect,run

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'_ai_workbench/temp/web_game_identity_20261004'
WEB='/linhhoasu/webgame/gm'
FILES=['web_context.php','login.php','index.php','api/user_api.php','reward_delivery.php','assets/js/web-context.js','assets/js/login.js','assets/js/index.js']
PHP=r'''<?php
require '/linhhoasu/webgame/gm/config.php';
$out=array('at'=>gmdate('c'),'servers'=>array(),'deliveries'=>array());
foreach($quarr as $key=>$s)$out['servers'][]=array('key'=>$key,'name'=>$s['name'],'gameId'=>$s['game_id'],'apiBase'=>lhs_api_base($key));
$q=$conn_web->query("SELECT id,kind,account_name,server_id,role_id,source_id,claim_period,status,delivered_batches,attempts,last_error,created_at,sent_at,reward_snapshot FROM web_reward_deliveries WHERE kind='giftcode' AND created_at>=DATE_SUB(NOW(),INTERVAL 2 DAY) ORDER BY id DESC LIMIT 500");
foreach($q->fetchAll(PDO::FETCH_ASSOC) as $d){$snapshot=json_decode($d['reward_snapshot'],true);unset($d['reward_snapshot']);$d['batchCount']=isset($snapshot['batches'])?count($snapshot['batches']):0;$out['deliveries'][]=$d;}
$out['totals']=$conn_web->query("SELECT status,server_id,COUNT(*) total FROM web_reward_deliveries WHERE kind='giftcode' AND created_at>=DATE_SUB(NOW(),INTERVAL 2 DAY) GROUP BY status,server_id")->fetchAll(PDO::FETCH_ASSOC);
echo json_encode($out,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
?>'''
with connect() as c,c.open_sftp() as s:
 OUT.mkdir(parents=True,exist_ok=True)
 hashes={}
 for rel in FILES:
  try:b=s.open(WEB+'/'+rel,'rb').read()
  except FileNotFoundError:continue
  p=OUT/'source'/rel;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b);hashes[rel]=hashlib.sha256(b).hexdigest()
 # The config contains no need to copy its initialization/secret-bearing lines.
 text=s.open(WEB+'/config.php','rb').read().decode('utf8')
 lines=text.splitlines();selected=[]
 for i,line in enumerate(lines):
  if any(marker in line for marker in ['function lhs_api_base','function lhs_roles_for_account','function lhs_find_role','function hk_default_session_role','function lhs_mail_items','function vht6ur_sdk_web_send_items','function vht6ur_sdk_login','function gm_get_server','$quarr = array()']):
   end=min(len(lines),i+100)
   for j in range(i+1,end):
    if lines[j].startswith('function ') or lines[j].startswith('$quarr = '):end=j;break
   selected.append({'start':i+1,'text':'\n'.join(lines[i:end])})
 (OUT/'config_selected.json').write_text(json.dumps(selected,ensure_ascii=False,indent=2),encoding='utf8')
 raw=run(c,'php',PHP)
 evidence=json.loads(raw)
 (OUT/'web.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2),encoding='utf8')
 (OUT/'hashes.json').write_text(json.dumps(hashes,indent=2),encoding='utf8')
 print(json.dumps({'at':evidence['at'],'servers':evidence['servers'],'totals':evidence['totals'],'sampled':len(evidence['deliveries']),'files':hashes},ensure_ascii=False,indent=2))
