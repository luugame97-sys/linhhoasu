<?php
throw new RuntimeException('WITHDRAWN: placeholder mismatch and silent PDO failure. Use verified transactional per-account writer.');
// Incident-only WebGM account lock. Uses an exact allowlist and an idempotent event key.
define('LHS_API_REQUEST', true);
require '/linhhoasu/webgame/gm/config.php';
$action = (string)($argv[1] ?? '');
$planPath = (string)($argv[2] ?? '');
$backupDir = (string)($argv[3] ?? '');
$plan = json_decode(file_get_contents($planPath), true);
$rows = is_array($plan['rows'] ?? null) ? $plan['rows'] : array();
$incident = (string)($plan['incident'] ?? '');
$code = 'FISH_FREE_20260906';
if ($incident !== 'fishing_free_20260906' || count($rows) !== 19) throw new RuntimeException('PLAN_INVALID');
$targets = array(); foreach ($rows as $row) { $account = strtolower((string)($row['accountId'] ?? '')); if ($account !== 'vanduc97') $targets[$account] = $row; }
if (count($targets) !== 18) throw new RuntimeException('TARGET_COUNT_INVALID');
function dbrows($conn, $sql, $ids) { $marks = implode(',', array_fill(0, count($ids), '?')); $q = $conn->prepare(str_replace(':marks', $marks, $sql)); $q->execute(array_values($ids)); return $q->fetchAll(PDO::FETCH_ASSOC); }
function metaFor($row, $incident, $code) { return array('source'=>'fishing-remediation','eventId'=>6006,'shopId'=>11001400,'exploitCount'=>(int)$row['recordedClaims']-1,'exploitBaozi'=>(int)$row['amount'],'evidenceId'=>$incident,'title'=>'Thiên Đạo Ban Lệnh','banCode'=>$code); }
if ($action === 'preflight') {
  $ids = array_keys($targets); $accounts = dbrows($conn_web, 'SELECT account,status FROM account WHERE account IN (:marks)', $ids); $bans = dbrows($conn_web, 'SELECT account_name,active,ban_until,reason,ban_code,metadata_json FROM web_account_bans WHERE account_name IN (:marks)', $ids);
  $found = array(); foreach ($accounts as $r) $found[strtolower((string)$r['account'])] = $r;
  $banFound = array(); foreach ($bans as $r) $banFound[strtolower((string)$r['account_name'])] = $r;
  $missing = array(); $active = array(); foreach ($ids as $id) { if (!isset($found[$id])) $missing[]=$id; if (isset($banFound[$id]) && (int)$banFound[$id]['active']===1 && (int)$banFound[$id]['ban_until'] > (int)round(microtime(true)*1000)) $active[]=$id; }
  echo json_encode(array('result'=>'PASS','action'=>'preflight','accounts'=>$accounts,'bans'=>$bans,'missingWebAccounts'=>$missing,'activeUnrelated'=>$active,'vanduc97Excluded'=>true,'productionWrites'=>0), JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT); exit;
}
if (!in_array($action, array('apply','rollback','verify'), true)) throw new RuntimeException('ACTION_INVALID');
if (!is_dir($backupDir) && !mkdir($backupDir, 0700, true)) throw new RuntimeException('BACKUP_CREATE_FAILED');
$ids = array_keys($targets);
if ($action === 'apply') {
  $accounts = dbrows($conn_web, 'SELECT account,status FROM account WHERE account IN (:marks)', $ids);
  $bans = dbrows($conn_web, 'SELECT account_name,active,ban_until,reason,ban_code,banned_at,banned_by,metadata_json FROM web_account_bans WHERE account_name IN (:marks)', $ids);
  file_put_contents($backupDir.'/web-before.json', json_encode(array('incident'=>$incident,'accounts'=>$accounts,'bans'=>$bans), JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT), LOCK_EX);
  $conn_web->beginTransaction(); $now=(int)round(microtime(true)*1000); $applied=array(); $missing=array();
  try {
    $q=$conn_web->prepare('SELECT account,status FROM account WHERE account=? LIMIT 1');
    $bq=$conn_web->prepare('SELECT account_name,active,ban_until,metadata_json FROM web_account_bans WHERE account_name=? LIMIT 1');
    $up=$conn_web->prepare('INSERT INTO web_account_bans(account_name,active,ban_until,reason,ban_code,banned_at,banned_by,metadata_json,updated_at) VALUES(?,?,?,?,?,NOW(),?,?,NOW()) ON DUPLICATE KEY UPDATE active=VALUES(active),ban_until=VALUES(ban_until),reason=VALUES(reason),ban_code=VALUES(ban_code),banned_at=VALUES(banned_at),banned_by=VALUES(banned_by),metadata_json=VALUES(metadata_json),updated_at=NOW()');
    $hist=$conn_web->prepare('INSERT INTO web_account_ban_history(account_name,action,ban_until,reason,ban_code,operator_name,metadata_json) VALUES(?,?,?,?,?,?,?)');
    foreach ($targets as $account=>$row) {
      $q->execute(array($account)); $acct=$q->fetch(PDO::FETCH_ASSOC); if (!$acct) { $missing[]=$account; continue; }
      $bq->execute(array($account)); $old=$bq->fetch(PDO::FETCH_ASSOC); $oldMeta=json_decode((string)($old['metadata_json']??''),true);
      if ($old && (int)$old['active']===1 && (string)($oldMeta['evidenceId']??'')!==$incident) throw new RuntimeException('WEB_UNRELATED_ACTIVE_BAN_'.$account);
      $m=metaFor($row,$incident,$code);$mj=json_encode($m,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);$until=$now+((int)$row['penaltySeconds']*1000);$reason='Nhận vượt giới hạn gói miễn phí Đại hội câu cá.';
      $conn_web->prepare("UPDATE account SET status='locked' WHERE account=? AND status<>'locked'")->execute(array($account));
      $up->execute(array($account,1,$until,$reason,$code,date('Y-m-d H:i:s',(int)floor($now/1000)),'owner-approved',$mj));
      $already=$old && (string)($oldMeta['evidenceId']??'')===$incident;
      if (!$already) $hist->execute(array($account,'ban',$until,$reason,$code,'owner-approved',$mj));
      $applied[]=array('account'=>$account,'until'=>$until,'replayed'=>$already,'missingWeb'=>false);
    }
    $conn_web->commit(); file_put_contents($backupDir.'/web-apply.json',json_encode(array('incident'=>$incident,'applied'=>$applied,'missingWebAccounts'=>$missing,'appliedAt'=>date('c')),JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT),LOCK_EX);
    echo json_encode(array('result'=>'PASS','action'=>'apply','applied'=>$applied,'missingWebAccounts'=>$missing,'targets'=>count($targets),'productionWrites'=>count($applied)),JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT); exit;
  } catch (Throwable $e) { if ($conn_web->inTransaction()) $conn_web->rollBack(); throw $e; }
}
if ($action === 'rollback') {
  $before=json_decode(@file_get_contents($backupDir.'/web-before.json'),true);$oldAccounts=array();foreach(($before['accounts']??array()) as $r)$oldAccounts[strtolower((string)$r['account'])]=$r;$oldBans=array();foreach(($before['bans']??array()) as $r)$oldBans[strtolower((string)$r['account_name'])]=$r;
  $conn_web->beginTransaction();$restored=0;try{$q=$conn_web->prepare('SELECT metadata_json FROM web_account_bans WHERE account_name=? LIMIT 1');foreach($targets as $account=>$row){$q->execute(array($account));$cur=$q->fetch(PDO::FETCH_ASSOC);$m=json_decode((string)($cur['metadata_json']??''),true);if((string)($m['evidenceId']??'')!==$incident)continue;if(isset($oldAccounts[$account]))$conn_web->prepare('UPDATE account SET status=? WHERE account=?')->execute(array($oldAccounts[$account]['status'],$account));if(isset($oldBans[$account])){$o=$oldBans[$account];$conn_web->prepare('UPDATE web_account_bans SET active=?,ban_until=?,reason=?,ban_code=?,banned_at=?,banned_by=?,metadata_json=?,updated_at=NOW() WHERE account_name=?')->execute(array($o['active'],$o['ban_until'],$o['reason'],$o['ban_code'],$o['banned_at'],$o['banned_by'],$o['metadata_json'],$account));}else$conn_web->prepare('DELETE FROM web_account_bans WHERE account_name=?')->execute(array($account));$conn_web->prepare('INSERT INTO web_account_ban_history(account_name,action,ban_until,reason,ban_code,operator_name,metadata_json) VALUES(?,?,?,?,?,?,?)')->execute(array($account,'rollback',0,'Rollback incident '.$incident,$code,'owner-approved',json_encode(array('evidenceId'=>$incident),JSON_UNESCAPED_UNICODE)));$restored++;}$conn_web->commit();echo json_encode(array('result'=>'PASS','action'=>'rollback','restored'=>$restored),JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT);exit;}catch(Throwable $e){if($conn_web->inTransaction())$conn_web->rollBack();throw $e;}
}
$accounts=dbrows($conn_web,'SELECT account,status FROM account WHERE account IN (:marks)',$ids);$bans=dbrows($conn_web,'SELECT account_name,active,ban_until,reason,ban_code,metadata_json FROM web_account_bans WHERE account_name IN (:marks)',$ids);$bad=array();foreach($targets as $account=>$row){$a=null;foreach($accounts as $x)if(strtolower($x['account'])===$account)$a=$x;$b=null;foreach($bans as $x)if(strtolower($x['account_name'])===$account)$b=$x;$m=$b?json_decode((string)$b['metadata_json'],true):array();if(!$a||$a['status']!=='locked'||!$b||(int)$b['active']!==1||(string)($m['evidenceId']??'')!==$incident)$bad[]=$account;}echo json_encode(array('result'=>count($bad)?'FAIL':'PASS','action'=>'verify','targets'=>count($targets),'issues'=>$bad,'vanduc97'=>array('excluded'=>true), 'productionWrites'=>0),JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT);
?>
