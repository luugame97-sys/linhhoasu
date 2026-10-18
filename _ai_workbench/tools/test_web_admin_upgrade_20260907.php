<?php
// $pdo comes from remote credential bootstrap. TEMPORARY clones shadow every
// table modified below; no real user/login/payment/game mutations occur.
$candidate=$argv[1];$conn_web=$pdo;$checks=array();
function check_upgrade($value,$label){global$checks;if(!$value)throw new RuntimeException('ASSERT: '.$label);$checks[]=$label;}
function rejects_upgrade($f,$label){try{$f();}catch(InvalidArgumentException$e){check_upgrade(true,$label);return;}throw new RuntimeException('Expected invalid: '.$label);}
function gm_get_server($key){return in_array((string)$key,array('1001','1002'),true)?array('name'=>'QA S'.$key,'game_id'=>(int)$key):false;}
function lhs_game_server_id($key){return gm_get_server($key)?(int)$key:0;}
function vht6ur_clean_account($text){$text=strtolower(trim((string)$text));return preg_match('/^[a-z][a-z0-9_]{3,19}$/',$text)?$text:'';}
function gm_role_id($r){return$r['role_id'];}function gm_role_name($r){return$r['role_name'];}
$fakeRoles=array(
array('account_id'=>'alice','role_id'=>'uid-alice','role_name'=>'Đại Đế','server_id'=>'1001','player_id'=>'999'),
array('account_id'=>'alice','role_id'=>'uid-alice-s2','role_name'=>'Alice S2','server_id'=>'1002','player_id'=>'998'),
array('account_id'=>'bob01','role_id'=>'uid-bob','role_name'=>'Đại Đế','server_id'=>'1001','player_id'=>'997'));
function hk_roles_for_account($id,$account,$server){global$fakeRoles;return array_values(array_filter($fakeRoles,function($r)use($account,$server){return$r['account_id']===$account&&$r['server_id']===$server;}));}
function lhs_internal_read($path,$q,$method,$server){global$fakeRoles;$found=array();foreach($fakeRoles as$r){if($r['server_id']!==$server)continue;$key=isset($q['accountId'])?'account_id':(isset($q['userId'])?'role_id':'role_name');$value=isset($q['accountId'])?$q['accountId']:(isset($q['userId'])?$q['userId']:$q['name']);if($r[$key]!==$value)continue;$found[]=array('userId'=>$r['role_id'],'name'=>$r['role_name'],'accountId'=>$r['account_id'],'serverId'=>(int)$server,'playerId'=>$r['player_id']);}return$found?array('success'=>true,'data'=>array('roles'=>$found)):array('success'=>false,'data'=>array('error'=>'PLAYER_NOT_FOUND'));}
function account_total_recharge($a,$p,$s){return 0;}
foreach(array('account','auth_codes','web_account_bans','sepay_logs')as$t){$ddl=$pdo->query('SHOW CREATE TABLE `'.$t.'`')->fetch(PDO::FETCH_NUM)[1];$pdo->exec(preg_replace('/^CREATE TABLE /','CREATE TEMPORARY TABLE ',$ddl));}
$pdo->exec("SET time_zone='+07:00'");
$insert=$pdo->prepare('INSERT INTO account(account,password_hash,sdk_user_id,ptb,status) VALUES(?,?,?,?,?)');
foreach(array(array('alice','fixture','101',10,'active'),array('bob01','fixture','102',20,'locked'),array('charlie','fixture','103',30,'locked'),array('under_score','fixture','104',0,'active'),array('underXscore','fixture','105',0,'active'))as$r)$insert->execute($r);
$pdo->exec("INSERT INTO auth_codes(code,vip_type,is_used,is_active,used_by_account,used_server_id) VALUES('QA-A',2,1,1,'alice','1001'),('QA-A2',1,1,1,'alice','1002'),('QA-B',2,1,0,'bob01','1001')");
$pdo->exec("INSERT INTO web_account_bans(account_name,active,ban_until,metadata_json) VALUES('charlie',1,1,'{}')");
require$candidate.'/admin_management.php';require$candidate.'/web_experience.php';
$r=lhs_admin_users($pdo,'1001',array('account_filter'=>'vip2'));check_upgrade(count($r['data'])===1&&$r['data'][0]['AccountName']==='alice','VIP2 only current server');
$r=lhs_admin_users($pdo,'1002',array('account_filter'=>'vip2'));check_upgrade(count($r['data'])===0,'S2 cannot borrow S1 VIP');
$r=lhs_admin_users($pdo,'1002',array('account_filter'=>'vip1'));check_upgrade(count($r['data'])===1,'S2 VIP1 filter');
$r=lhs_admin_users($pdo,'1001',array('account_filter'=>'locked'));check_upgrade(count($r['data'])===1&&$r['data'][0]['AccountName']==='bob01','expired timed ban not shown as active lock');
$r=lhs_admin_users($pdo,'1001',array('account_filter'=>'active'));check_upgrade(count($r['data'])===4,'active filter includes expired timed lock without mutation');
foreach(array('alice','101','uid-alice')as$q){$r=lhs_admin_users($pdo,'1001',array('search'=>$q));check_upgrade(count($r['data'])===1&&$r['data'][0]['AccountName']==='alice','auto detect identity '.$q);}
$r=lhs_admin_users($pdo,'1001',array('search'=>'Đại Đế'));check_upgrade(count($r['data'])===2,'duplicate character name lists all choices');
$r=lhs_admin_users($pdo,'1001',array('search'=>'under_score'));check_upgrade(count($r['data'])===1&&$r['data'][0]['AccountName']==='under_score','LIKE underscores treated literally');
$r=lhs_admin_users($pdo,'1001',array('search'=>"%' OR 1=1 --"));check_upgrade(count($r['data'])===0,'SQL injection literal rejected safely');
$r=lhs_admin_users($pdo,'1001',array('page'=>9999));check_upgrade($r['current_page']===1,'clamp pagination beyond total');
rejects_upgrade(function()use($pdo){lhs_admin_users($pdo,'9999',array());},'unknown server rejected');
rejects_upgrade(function()use($pdo){lhs_admin_users($pdo,'1001',array('account_filter'=>'all OR 1'));},'unknown filter rejected');
$range=array('start'=>'2026-09-07 00:00:00','end'=>'2026-09-08 00:00:00');
$s=$pdo->prepare('INSERT INTO sepay_logs(tran_id,account_name,server_id,amount,action,created_at) VALUES(?,?,?,?,?,?)');
foreach(array(array('p1','alice','1001',10000,'topup_xu','2026-09-07 10:00:00'),array('p2','alice','1001',20000,'vip','2026-09-06 10:00:00'),array('p3','alice','1002',30000,'topup_xu','2026-09-07 10:00:00'),array('p4','bob01','1001',40000,'topup_xu','2026-09-07 10:00:00'))as$row)$s->execute($row);
$r=lhs_admin_sepay_summary($pdo,'alice','1001',$range);check_upgrade((int)$r['lifetime']['total']===30000&&(int)$r['period']['total']===10000,'account summary alltime versus period server scoped');
$r=lhs_admin_sepay_summary($pdo,'101','',$range);check_upgrade($r['account']==='alice'&&(int)$r['lifetime']['total']===60000,'summary understands WebGM id');
$r=lhs_admin_sepay_summary($pdo,'','',$range);check_upgrade((int)$r['lifetime']['total']===100000&&(int)$r['period']['total']===80000,'total sepay aggregates ledger once');
$r=lhs_admin_sepay_summary($pdo,'ali','',$range);check_upgrade(!$r['available'],'partial account cannot masquerade as single account summary');
check_upgrade(lhs_gift_expiry('')===null,'unlimited expiry preserved');
check_upgrade(lhs_gift_expiry('2026-09-30T23:59')==='2026-09-30 23:59:00','gift expiry valid format');
rejects_upgrade(function(){lhs_gift_expiry('2026-02-30T10:00');},'invalid calendar date rejected');
rejects_upgrade(function(){lhs_gift_expiry(array());},'invalid expiry type rejected');
$times=lhs_web_reset_times(new DateTimeImmutable('2026-09-06T23:59:59+07:00'));
check_upgrade(($times['day']-$times['server_now'])===1000&&$times['week']===$times['day'],'day and Monday reset align GMT7');
$times=lhs_web_reset_times(new DateTimeImmutable('2026-12-31T23:59:59+07:00'));check_upgrade(($times['month']-$times['server_now'])===1000,'month/year reset rollover');
echo json_encode(array('result'=>'PASS','checks'=>count($checks),'details'=>$checks,'php'=>PHP_VERSION,'mysql'=>$pdo->query('SELECT VERSION()')->fetchColumn(),'productionRowsWritten'=>0,'fixture'=>'TEMPORARY clones; game identity API stubbed'),JSON_UNESCAPED_UNICODE);
