<?php
// Caller supplies PDO. Only connection-local TEMPORARY tables; no real mail.
if (!isset($pdo) || !isset($stage)) throw new RuntimeException('Fixture bootstrap required.');
$pdo->exec("SET time_zone='+07:00'");
foreach (array('donate_events','donate_event_claims','web_reward_deliveries') as $table) {
    $ddl = $pdo->query("SHOW CREATE TABLE `$table`")->fetch(PDO::FETCH_NUM)[1];
    $pdo->exec(preg_replace('/^CREATE TABLE /', 'CREATE TEMPORARY TABLE ', $ddl, 1));
}
$pdo->exec("CREATE TEMPORARY TABLE sepay_logs(account_name VARCHAR(64),server_id VARCHAR(32),action VARCHAR(32),amount BIGINT,created_at DATETIME) ENGINE=InnoDB");
$checks = 0;
function check_event($ok, $label) { global $checks; if (!$ok) throw new RuntimeException('FAIL: '.$label); $checks++; }
function reject_event($call, $label) { try { $call(); } catch (InvalidArgumentException $e) { check_event(true,$label); return; } throw new RuntimeException('Expected rejection: '.$label); }
function hk_reward_exists($id) { return in_array((int)$id,array(1,4,65),true); }
function donate_reward_amount_valid($id,$amount) { return $amount > 0 && $amount <= 10000000; }
function vht6ur_item_catalog() { return array(1=>'Nguyên bảo',4=>'Bánh bao',65=>'Đùi gà'); }
function item_icon_image_map($all) { return array(1=>'assets/1.png'); }
function site_asset_url($url) { return $url; }
function site_logo_image() { return 'assets/logo.png'; }
function gm_get_server($id) { return in_array((string)$id,array('1001','1002'),true); }
function gm_role_id($role) { return $role['role_id']; }
function gm_role_name($role) { return 'QA'; }
function lhs_find_role($id,$server,$account,$unused) { return array('role_id'=>$id,'server_id'=>$server,'account_id'=>$account); }
$audit_ok=true;
function gm_audit_log($role,$action,$details,$account,$server) { global $audit_ok; return $audit_ok; }
function parse_donate_reward_items($json) { return json_decode($json,true); }
$mails=array(); $mail_calls=0; $timeout_once=false;
function vht6ur_sdk_web_send_items($role,$name,$server,$items,&$error,$title,$content,$key,$scope) {
    global $mails,$mail_calls,$timeout_once;
    check_event($scope==='donate','uses supported donate bridge scope');
    $body=array($role,$server,$items,$title,$content);
    if(isset($mails[$key])) check_event($mails[$key]===$body,'retry immutable recipient and rewards');
    $mails[$key]=$body; $mail_calls++;
    if($timeout_once){$timeout_once=false;$error='lost response';return false;} return true;
}
require $stage.'/reward_delivery.php';
require $stage.'/donate_events.php';
$now='2026-09-22 12:00:00';
$tiers=array(array('amount'=>100,'items'=>array(array('item_id'=>1,'amount'=>5))),array('amount'=>150,'items'=>array(array('item_id'=>65,'amount'=>10))));
$input=array('id'=>'','title'=>'QA event','starts_at'=>'2026-09-23T00:00','ends_at'=>'2026-09-24T00:00','is_active'=>'0','banner_path'=>'','tiers_json'=>json_encode($tiers));
$id=lhs_event_save($pdo,$input,$now);
check_event($id>0,'create draft with empty HTML id');
$event=$pdo->query('SELECT * FROM donate_events WHERE id='.$id)->fetch();
check_event($event['edit_version']==1,'initial version');
$stale=$event;$stale['edit_version']=0;reject_event(function()use($pdo,$stale,$now){lhs_event_save($pdo,$stale,$now);},'stale edit rejected');
foreach(array('-1','1e5','1.2',true,array(),0,'9999999999999999999999') as $bad) reject_event(function()use($bad){lhs_event_int($bad);},'invalid integer');
reject_event(function(){lhs_event_date('2026-02-30T12:00');},'invalid date');
reject_event(function(){lhs_event_banner('../../evil.php');},'banner traversal');
reject_event(function(){lhs_event_banner('javascript:alert(1)');},'banner scheme');
reject_event(function(){lhs_event_tiers('[]');},'no tiers');
$bad=$tiers;$bad[1]['amount']=100;reject_event(function()use($bad){lhs_event_tiers(json_encode($bad));},'duplicate threshold');
$bad=$tiers;$bad[0]['items'][0]['item_id']=999;reject_event(function()use($bad){lhs_event_tiers(json_encode($bad));},'unknown item');
$bad=$tiers;$bad[0]['items'][0]['amount']='1.5';reject_event(function()use($bad){lhs_event_tiers(json_encode($bad));},'fractional quantity');
$bad=$tiers;$bad[0]['items'][]=$bad[0]['items'][0];reject_event(function()use($bad){lhs_event_tiers(json_encode($bad));},'duplicate item');
$active=$event;$active['is_active']=1;reject_event(function()use($pdo,$active,$now){lhs_event_save($pdo,$active,$now);},'activate requires uploaded banner');
$pdo->exec("UPDATE donate_events SET starts_at='2026-09-22 12:00:00',ends_at='2026-09-22 13:00:00',is_active=1,published_at='2026-09-22 11:59:00' WHERE id=$id");
$event=$pdo->query('SELECT * FROM donate_events WHERE id='.$id)->fetch();
check_event(lhs_event_active($event,$now),'start inclusive');
check_event(!lhs_event_active($event,'2026-09-22 13:00:00'),'end exclusive');
check_event(!lhs_event_active($event,'2026-09-22 11:59:59'),'before start');
$rows=array(array('qa','1001','topup_xu',50,'12:00:00'),array('qa','1002','vip',50,'12:00:01'),array('qa','1001','topup_xu',500,'11:59:59'),array('qa','1001','topup_xu',500,'13:00:00'),array('qa','1001','failed',500,'12:00:00'),array('other','1001','topup_xu',500,'12:00:00'));
$insert=$pdo->prepare('INSERT INTO sepay_logs VALUES(?,?,?,?,?)');foreach($rows as $row){$row[4]='2026-09-22 '.$row[4];$insert->execute($row);}
check_event(lhs_event_total($pdo,'qa',$event,'2026-09-22 12:00:00')===50,'future ledger entry excluded');
check_event(lhs_event_total($pdo,'qa',$event,'2026-09-22 12:01:00')===100,'shared Xu plus VIP, exact time bounds');
$role=array('role_id'=>'qa_role','server_id'=>'1001','account_id'=>'qa');
reject_event(function()use($pdo,$role,$id){lhs_event_reserve($pdo,'qa','1001',$id,2,$role,'2026-09-22 12:01:00');},'below threshold');
reject_event(function()use($pdo,$role,$id){lhs_event_reserve($pdo,'qa','1002',$id,1,$role,'2026-09-22 12:01:00');},'role server mismatch');
reject_event(function()use($pdo,$role,$id){lhs_event_reserve($pdo,'other','1001',$id,1,$role,'2026-09-22 12:01:00');},'role account mismatch');
reject_event(function()use($pdo,$role,$id){lhs_event_reserve($pdo,'qa','1001',$id,1,$role,'2026-09-22 13:00:00');},'no claim at deadline');
$delivery=lhs_event_reserve($pdo,'qa','1001',$id,1,$role,'2026-09-22 12:01:00');
check_event($delivery['claim_period']==='event:'.$id,'separate event namespace');
check_event((int)$pdo->query('SELECT COUNT(*) FROM donate_event_claims')->fetchColumn()===1,'one claim receipt');
$again=lhs_event_reserve($pdo,'qa','1001',$id,1,$role,'2026-09-22 12:01:00');
check_event($again['id']===$delivery['id'],'duplicate reuses delivery');
$role2=$role;$role2['server_id']='1002';
reject_event(function()use($pdo,$role2,$id){lhs_event_reserve($pdo,'qa','1002',$id,1,$role2,'2026-09-22 12:01:00');},'cross-server duplicate rejected');
$snapshot=lhs_event_public($pdo,'qa','1002','2026-09-22 12:01:00');
check_event($snapshot['events'][0]['total']===100,'public progress matches ledger');
check_event($snapshot['events'][0]['tiers'][0]['pending'] && $snapshot['events'][0]['tiers'][0]['server_id']==='1001','pending remembers original server');
$legacy=$delivery;$legacy['claim_period']='total';check_event(lhs_reward_event_key($legacy,1)!==lhs_reward_event_key($delivery,1),'legacy mail key does not collide');
$timeout_once=true;$result=lhs_reward_dispatch($pdo,$delivery);check_event($result['pending'],'ambiguous timeout keeps receipt');
$pdo->exec('UPDATE donate_events SET is_active=0 WHERE id='.$id);
$again=lhs_event_reserve($pdo,'qa','1001',$id,1,$role,'2026-09-23 12:00:00');
check_event($again['id']===$delivery['id'],'existing claim retry after end and disabled');
$audit_ok=false;$result=lhs_reward_dispatch($pdo,$again);check_event($result['pending'],'audit failure stays pending');
$calls=$mail_calls;$audit_ok=true;$result=lhs_reward_retry($pdo,$delivery['id'],'qa','1001','recharge');
check_event($result['delivered'] && $mail_calls===$calls,'audit retry no new mail call');
check_event(count($mails)===1,'one idempotent mail');
$result=lhs_reward_retry($pdo,$delivery['id'],'qa','1001','recharge');check_event($result['duplicate'],'sent retry no grant');
reject_event(function()use($pdo,$delivery){lhs_reward_retry($pdo,$delivery['id'],'other','1001','recharge');},'foreign delivery denied');
$edit=$pdo->query('SELECT * FROM donate_events WHERE id='.$id)->fetch();$edit['tiers_json']=json_encode(array($tiers[0]));
check_event(lhs_event_save($pdo,$edit,'2026-09-22 12:02:00')===$id,'published rewards editable');
$edit=$pdo->query('SELECT * FROM donate_events WHERE id='.$id)->fetch();$edit['ends_at']='2026-09-23 13:00:00';
check_event(lhs_event_save($pdo,$edit,'2026-09-22 12:02:00')===$id,'published time editable');
$original=lhs_reward_find($pdo,$delivery['id'],'qa','1001','recharge');
check_event($original['reward_snapshot']===$delivery['reward_snapshot'],'editing catalog preserves old delivery snapshot');
check_event((int)$pdo->query('SELECT COUNT(*) FROM donate_event_claims')->fetchColumn()===1,'editing catalog preserves claim history');
check_event(!$pdo->inTransaction(),'save closes transaction');
echo json_encode(array('result'=>'PASS','checks'=>$checks,'mail_keys'=>count($mails),'temporary_tables_only'=>true,'real_mail'=>false));
