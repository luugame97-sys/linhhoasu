<?php
// One account at a time. Do not import/run the withdrawn batch writer.
define('LHS_API_REQUEST',true);
require '/linhhoasu/webgame/gm/config.php';
$conn_web->setAttribute(PDO::ATTR_ERRMODE,PDO::ERRMODE_EXCEPTION);
$mode=$argv[1];$plan=json_decode(file_get_contents($argv[2]),true);$id=strtolower($argv[3]);
$target=null;foreach($plan['rows'] as $row)if($row['accountId']===$id)$target=$row;
if(!$target||$id==='vanduc97'||$target['penaltySeconds']<=0||$plan['incident']!=='fishing_free_20260906')throw new Exception('TARGET_NOT_ALLOWED');
$q=$conn_web->prepare('SELECT account,status FROM account WHERE account=?');$q->execute(array($id));$account=$q->fetch(PDO::FETCH_ASSOC);
$q=$conn_web->prepare('SELECT * FROM web_account_bans WHERE account_name=?');$q->execute(array($id));$before=$q->fetch(PDO::FETCH_ASSOC);
if($mode==='preview'){echo json_encode(array('result'=>'PASS','account'=>$account,'ban'=>$before,'state'=>vht6ur_web_ban_state($id,false)),JSON_UNESCAPED_UNICODE);exit;}
if($mode!=='apply')throw new Exception('MODE_INVALID');
$game=json_decode(file_get_contents($argv[4]),true);$result=$game['result']['result'];
if($game['result']['accountId']!==$id||$game['result']['action']!=='ban'||empty($game['result']['success'])||$result['penaltySeconds']!=$target['penaltySeconds'])throw new Exception('GAME_RECEIPT_INVALID');
$until=(int)$result['until'];$now=(int)round(microtime(true)*1000);
if($until<=0||$until>$now+($target['penaltySeconds']+30)*1000)throw new Exception('BAN_UNTIL_INVALID');
$dir='/linhhoasu/_ai_workbench/backups/fishing_free_recovery_20260906';
if(!is_dir($dir)&&!mkdir($dir,0700,true))throw new Exception('BACKUP_FAILED');
$backup=$dir.'/'.$id.'-web-before.json';
if(!file_exists($backup)){if(file_put_contents($backup,json_encode(array('account'=>$account,'ban'=>$before),JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT),LOCK_EX)===false)throw new Exception('BACKUP_FAILED');chmod($backup,0600);}
$meta=array('source'=>'fishing-remediation','eventId'=>6006,'shopId'=>11001400,'exploitCount'=>$target['recordedClaims']-1,'exploitBaozi'=>$target['amount'],'evidenceId'=>$plan['incident']);
$mj=json_encode($meta,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);$reason=$result['reason'];$code='FISH_FREE_20260906';
$conn_web->beginTransaction();try{
 $q=$conn_web->prepare('SELECT * FROM web_account_bans WHERE account_name=? FOR UPDATE');$q->execute(array($id));$current=$q->fetch(PDO::FETCH_ASSOC);$currentMeta=$current?json_decode($current['metadata_json'],true):array();
 $same=$current&&($currentMeta['evidenceId']??'')===$plan['incident'];
 if($current&&!$same&&(int)$current['active']===1&&((int)$current['ban_until']===0||(int)$current['ban_until']>$now))throw new Exception('UNRELATED_ACTIVE_BAN');
 if($same){if((int)$current['ban_until']!==$until||$current['ban_code']!==$code)throw new Exception('WEB_RECEIPT_MISMATCH');}
 else{
  $sql='INSERT INTO web_account_bans(account_name,active,ban_until,reason,ban_code,banned_at,banned_by,metadata_json,updated_at) VALUES(?,?,?,?,?,NOW(),?,?,NOW()) ON DUPLICATE KEY UPDATE active=VALUES(active),ban_until=VALUES(ban_until),reason=VALUES(reason),ban_code=VALUES(ban_code),banned_at=VALUES(banned_at),banned_by=VALUES(banned_by),metadata_json=VALUES(metadata_json),updated_at=NOW()';
  $q=$conn_web->prepare($sql);$q->execute(array($id,$until>$now?1:0,$until,$reason,$code,'owner-approved',$mj));
  $q=$conn_web->prepare('INSERT INTO web_account_ban_history(account_name,action,ban_until,reason,ban_code,operator_name,metadata_json) VALUES(?,?,?,?,?,?,?)');$q->execute(array($id,'ban',$until,$reason,$code,'owner-approved',$mj));
 }
 if($account&&$until>$now){$q=$conn_web->prepare("UPDATE account SET status='locked' WHERE account=?");$q->execute(array($id));}
 $q=$conn_web->prepare('SELECT active,ban_until,ban_code,metadata_json FROM web_account_bans WHERE account_name=?');$q->execute(array($id));$saved=$q->fetch(PDO::FETCH_ASSOC);
 if(!$saved||(int)$saved['ban_until']!==$until||$saved['ban_code']!==$code)throw new Exception('WEB_WRITE_NOT_CONFIRMED');
 $conn_web->commit();
}catch(Throwable $e){if($conn_web->inTransaction())$conn_web->rollBack();throw $e;}
$state=vht6ur_web_ban_state($id,false);if($until>$now&&empty($state['banned']))throw new Exception('WEB_ENFORCEMENT_FAILED');
echo json_encode(array('result'=>'PASS','accountId'=>$id,'until'=>$until,'replayed'=>$same,'webAccountExists'=>(bool)$account,'state'=>$state,'message'=>vht6ur_web_ban_message($state)),JSON_UNESCAPED_UNICODE);
