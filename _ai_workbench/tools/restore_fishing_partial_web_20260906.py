"""Restore only the 16 status changes from the failed 16:17Z attempt."""
import json,shlex,sys
from pathlib import Path
import paramiko
from release_huyenvu_daily_20260906 import run
WB=Path(__file__).resolve().parents[1];ROOT=WB/'temp/fishing_recovery_20260906'
PHP=r'''define('LHS_API_REQUEST',true);require '/linhhoasu/webgame/gm/config.php';
$conn_web->setAttribute(PDO::ATTR_ERRMODE,PDO::ERRMODE_EXCEPTION);
$dir='/linhhoasu/_ai_workbench/backups/fishing_recovery_20260906_161711';
$before=json_decode(file_get_contents($dir.'/web-before.json'),true);$apply=json_decode(file_get_contents($dir.'/web-apply.json'),true);
if($before['incident']!=='fishing_free_20260906'||count($apply['applied'])!==16)throw new Exception('WRONG_ATTEMPT');
$ids=array_column($apply['applied'],'account');if(in_array('vanduc97',$ids,true))throw new Exception('ADMIN_INCLUDED');
$oldBy=array();foreach($before['accounts'] as $a)$oldBy[$a['account']]=$a;
$oldBan=array();foreach($before['bans'] as $a)$oldBan[$a['account_name']]=$a;
$check=$conn_web->prepare('SELECT account,status FROM account WHERE account=? FOR UPDATE');
$ban=$conn_web->prepare('SELECT account_name,active,ban_until,reason,ban_code,banned_at,banned_by,metadata_json FROM web_account_bans WHERE account_name=?');
$fixed=array();$conn_web->beginTransaction();try{foreach($ids as $id){
 if(!isset($oldBy[$id])||$oldBy[$id]['status']!=='active')throw new Exception('BASELINE_NOT_ACTIVE');
 $check->execute(array($id));$a=$check->fetch(PDO::FETCH_ASSOC);if(!$a||!in_array($a['status'],array('active','locked'),true))throw new Exception('STATUS_DRIFT');
 $ban->execute(array($id));$b=$ban->fetch(PDO::FETCH_ASSOC);$expected=isset($oldBan[$id])?$oldBan[$id]:false;
 if($b!=$expected)throw new Exception('BAN_DRIFT_'.$id);
 if($a['status']==='locked'){$u=$conn_web->prepare("UPDATE account SET status='active' WHERE account=? AND status='locked'");$u->execute(array($id));if($u->rowCount()!==1)throw new Exception('RESTORE_FAILED');$fixed[]=$id;}
 }$conn_web->commit();}catch(Throwable $e){if($conn_web->inTransaction())$conn_web->rollBack();throw $e;}
echo json_encode(array('result'=>'RESTORED','count'=>count($fixed),'accounts'=>$fixed,'adminUntouched'=>true),JSON_UNESCAPED_UNICODE);'''
def main():
 sys.stdout.reconfigure(encoding='utf-8');c=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(c[0].strip(),username='root',password=c[2],look_for_keys=False,allow_agent=False,timeout=20)
 try:
  r=json.loads(run(s,'php -r '+shlex.quote(PHP),timeout=30));(ROOT/'partial-web-restored.json').write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps(r,ensure_ascii=False))
 finally:s.close()
if __name__=='__main__':main()
