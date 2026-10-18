<?php
// All writes are connection-scoped TEMPORARY fixture tables. A caller may
// supply $pdo (connected to the database under test) without loading config.php.
// Local standalone mode is pinned to the disposable QA instance on port 33316.
if (!isset($pdo)) {
    if (!isset($argv[3]) || $argv[3] !== '--local-fixture') throw new RuntimeException('Supply isolated PDO or explicit --local-fixture.');
    $pdo = new PDO('mysql:host=127.0.0.1;port=33316;charset=utf8mb4', 'root', '', array(PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_EMULATE_PREPARES => false));
    $pdo->exec('CREATE DATABASE IF NOT EXISTS qa_web_delivery_20260906 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    $pdo->exec('USE qa_web_delivery_20260906');
}
$pdo->exec("SET time_zone='+07:00'");
$candidate = $argv[1];
$migration = $argv[2];
$checks = array();
function delivery_check($ok, $label) { global $checks; if (!$ok) throw new RuntimeException('ASSERT: ' . $label); $checks[] = $label; }
function delivery_rejected($call, $label) { try { $call(); } catch (InvalidArgumentException $e) { delivery_check(true, $label); return; } throw new RuntimeException('Expected rejection: ' . $label); }
function gm_get_server($id) { return in_array((string)$id, array('1001','1002'), true); }
function gm_role_id($role) { return (string)$role['role_id']; }
function gm_role_name($role) { return isset($role['role_name']) ? $role['role_name'] : 'QA'; }
$role_missing = false;
function lhs_find_role($id, $server, $account, $allow_any) { global $role_missing; return $role_missing ? false : array('role_id' => $id, 'server_id' => $server, 'account_id' => $account, 'role_name' => 'QA'); }
$qa_audit_failure = false;
function gm_audit_log($role, $action, $details, $account = '', $server = '') { global $qa_audit_failure; return !$qa_audit_failure; }
function parse_reward_items($raw, $limit = 20) { $items = json_decode($raw, true); if (!is_array($items) || !$items || count($items) > $limit) return array(); foreach ($items as $row) if (!isset($row['item_id'],$row['amount']) || $row['item_id'] < 1 || $row['amount'] < 1) return array(); return $items; }
function parse_donate_reward_items($raw) { return parse_reward_items($raw, 20); }
$qa_periods = array('total' => 'total', 'day' => 'day:2026-09-06', 'week' => 'week:2026-36', 'month' => 'month:2026-09');
function recharge_period_key($period) { global $qa_periods; return $qa_periods[$period]; }
function recharge_period_label($period) { return $period; }
function normalize_recharge_period($period) { return $period; }
$qa_recharge = array();
function account_total_recharge($account, $period, $server = null) { global $qa_recharge; if ($server === null) throw new RuntimeException('Missing explicit recharge server.'); return isset($qa_recharge[$account . '|' . $server]) ? $qa_recharge[$account . '|' . $server] : 0; }
$qa_mail = array(); $qa_calls = array(); $qa_fail_call = 0;
function vht6ur_sdk_web_send_items($role, $name, $server, $items, &$error, $title, $content, $event, $scope) {
    global $qa_mail, $qa_calls, $qa_fail_call;
    $payload = array('role' => $role, 'server' => $server, 'items' => $items, 'scope' => $scope);
    if (isset($qa_mail[$event]) && $qa_mail[$event] !== $payload) throw new RuntimeException('Event replay changed recipient/reward.');
    $qa_mail[$event] = $payload; $qa_calls[] = $event;
    // Simulate the game persisting mail but the HTTP reply being lost.
    if (count($qa_calls) === $qa_fail_call) { $error = 'fixture timeout'; return false; }
    return true;
}
function delivery_extract_function($source, $name) {
    $tokens = token_get_all($source); $found = false; $buffer = ''; $depth = 0; $started = false;
    for ($i=0; $i<count($tokens); $i++) {
        if (!$found && is_array($tokens[$i]) && $tokens[$i][0] === T_FUNCTION) {
            $j=$i+1; while (is_array($tokens[$j]) && $tokens[$j][0]===T_WHITESPACE) $j++;
            if (is_array($tokens[$j]) && $tokens[$j][1] === $name) $found=true;
        }
        if ($found) { $t=is_array($tokens[$i])?$tokens[$i][1]:$tokens[$i]; $buffer.=$t; if($t==='{'){$depth++;$started=true;}elseif($t==='}'){$depth--;if($started&&$depth===0)return$buffer;} }
    }
    throw new RuntimeException('Missing extracted function ' . $name);
}
require $candidate . '/reward_delivery.php';
eval(delivery_extract_function(file_get_contents($candidate . '/api/user_api.php'), 'recharge_status_snapshot'));
$conn_web = $pdo;
$pdo->exec("CREATE TEMPORARY TABLE giftcodes(id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,code VARCHAR(80),giftcode VARCHAR(80),reward_items TEXT,max_uses INT NOT NULL DEFAULT 0,used_count INT NOT NULL DEFAULT 0,is_active INT NOT NULL DEFAULT 1,expire_at DATETIME NULL,expires_at DATETIME NULL) ENGINE=InnoDB");
$pdo->exec("CREATE TEMPORARY TABLE giftcode_logs(id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,account_name VARCHAR(64),server_id VARCHAR(32),giftcode_id BIGINT UNSIGNED, UNIQUE KEY uq_claim(account_name,server_id,giftcode_id)) ENGINE=InnoDB");
$pdo->exec("CREATE TEMPORARY TABLE giftcode_delivery_batches(id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,account_name VARCHAR(64),server_id VARCHAR(32),giftcode_id BIGINT UNSIGNED,batch_no INT,items_json TEXT,status VARCHAR(32) DEFAULT 'pending') ENGINE=InnoDB");
$pdo->exec("CREATE TEMPORARY TABLE recharge_milestones(id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,period_type VARCHAR(32),milestone_amount BIGINT,title VARCHAR(255),reward_items TEXT,is_active INT NOT NULL DEFAULT 1,sort_order INT DEFAULT 0) ENGINE=InnoDB");
$pdo->exec("CREATE TEMPORARY TABLE recharge_milestone_claims(id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,account_name VARCHAR(64),server_id VARCHAR(32),milestone_id BIGINT UNSIGNED,claim_period VARCHAR(64),UNIQUE KEY uq_claim(account_name,server_id,milestone_id,claim_period)) ENGINE=InnoDB");
$sql = preg_replace('/CREATE TABLE IF NOT EXISTS web_reward_deliveries/', 'CREATE TEMPORARY TABLE web_reward_deliveries', file_get_contents($migration), 1);
$pdo->exec($sql);
$items=array(array('item_id'=>28041,'amount'=>1),array('item_id'=>28042,'amount'=>1));
$role1=array('role_id'=>'qa_role_s1','server_id'=>'1001','account_id'=>'qa_account');
$role2=array('role_id'=>'qa_role_s2','server_id'=>'1002','account_id'=>'qa_account');
$gift_insert=$pdo->prepare('INSERT INTO giftcodes(code,giftcode,reward_items,max_uses) VALUES(?,?,?,?)');
$gift_insert->execute(array('QAONE','QAONE',json_encode($items),1)); $gift_one=$pdo->lastInsertId();
$delivery=lhs_reward_reserve_gift($pdo,'qa_account','1001','QAONE',$role1);
delivery_check($delivery['role_id']==='qa_role_s1','gift stores original recipient');
delivery_check((int)$pdo->query('SELECT used_count FROM giftcodes WHERE id='.(int)$gift_one)->fetchColumn()===0,'reserve does not pretend delivered');
delivery_rejected(function()use($pdo,$role2){lhs_reward_reserve_gift($pdo,'qa_account','1002','QAONE',$role2);},'last gift slot blocks another server before dispatch');
$other=array('role_id'=>'qa_other_s1','server_id'=>'1001','account_id'=>'qa_other');
delivery_rejected(function()use($pdo,$other){lhs_reward_reserve_gift($pdo,'qa_other','1001','QAONE',$other);},'last gift slot blocks another account');
$qa_fail_call=count($qa_calls)+1; $result=lhs_reward_dispatch($pdo,$delivery);
delivery_check($result['pending']&&!$result['delivered'],'gift timeout remains pending');
$pdo->exec("UPDATE giftcodes SET reward_items='[]',code='QAEDIT',giftcode='QAEDIT',is_active=0,expire_at='2001-01-01',max_uses=1 WHERE id=".(int)$gift_one);
$result=lhs_reward_retry($pdo,$delivery['id'],'qa_account','1001','giftcode');
delivery_check($result['delivered'],'gift retry bypasses edited closed expired catalog');
delivery_check(count($qa_mail)===1&&count($qa_calls)===2,'gift ambiguous timeout reuses one event');
delivery_check(array_values($qa_mail)[0]['items']===$items,'gift retry preserves reward snapshot');
delivery_check((int)$pdo->query('SELECT used_count FROM giftcodes WHERE id='.(int)$gift_one)->fetchColumn()===1,'gift used_count once after confirmed delivery');
$result=lhs_reward_retry($pdo,$delivery['id'],'qa_account','1001','giftcode');
delivery_check($result['duplicate']&&count($qa_calls)===2,'gift confirmed retry sends nothing');
delivery_rejected(function()use($pdo,$delivery){lhs_reward_retry($pdo,$delivery['id'],'qa_account','1002','giftcode');},'retry rejects cross-server delivery id');
delivery_rejected(function()use($pdo,$delivery){lhs_reward_retry($pdo,$delivery['id'],'qa_other','1001','giftcode');},'retry rejects another account delivery id');
delivery_rejected(function()use($pdo,$delivery){lhs_reward_retry($pdo,$delivery['id'],'qa_account','1001','recharge');},'retry rejects different reward kind');
delivery_check(lhs_reward_event_key($delivery,1)==='webgm_gift_'.hash('sha256','qa_account|1001|'.$gift_one.'|1'),'gift event contract unchanged');

$many=array();for($i=1;$i<=25;$i++)$many[]=array('item_id'=>1000+$i,'amount'=>1);
$gift_insert->execute(array('QABATCH','QABATCH',json_encode($many),0));$gift_batch=$pdo->lastInsertId();
$delivery=lhs_reward_reserve_gift($pdo,'qa_account','1001','QABATCH',$role1);
$qa_fail_call=count($qa_calls)+2;$result=lhs_reward_dispatch($pdo,$delivery);
delivery_check($result['pending'],'partial multi-mail delivery remains pending');
$stored=lhs_reward_find($pdo,$delivery['id'],'qa_account','1001','giftcode');
delivery_check((int)$stored['delivered_batches']===1,'first mail persisted before second retry');
$calls_before=count($qa_calls);$mail_before=count($qa_mail);
$pdo->exec('DELETE FROM giftcodes WHERE id='.(int)$gift_batch);
$result=lhs_reward_retry($pdo,$delivery['id'],'qa_account','1001','giftcode');
delivery_check($result['delivered']&&count($qa_calls)===$calls_before+1&&count($qa_mail)===$mail_before,'deleted product recovers only remaining mail by original key');

$gift_insert->execute(array('QALEGACY','QALEGACY',json_encode($items),1));$legacy=$pdo->lastInsertId();
$pdo->prepare("INSERT INTO giftcode_delivery_batches(account_name,server_id,giftcode_id,batch_no,items_json,status) VALUES('qa_old','1001',?,1,?,'sent')")->execute(array($legacy,json_encode($items)));
delivery_rejected(function()use($pdo,$role1){lhs_reward_reserve_gift($pdo,'qa_account','1001','QALEGACY',$role1);},'legacy unresolved batches reserve capacity');
$legacy_role=array('role_id'=>'qa_old_role','server_id'=>'1001','account_id'=>'qa_old');
delivery_rejected(function()use($pdo,$legacy_role){lhs_reward_reserve_gift($pdo,'qa_old','1001','QALEGACY',$legacy_role);},'legacy unknown recipient never auto regrants');
$pdo->prepare("INSERT INTO giftcode_logs(account_name,server_id,giftcode_id) VALUES('qa_old','1001',?)")->execute(array($legacy));
delivery_rejected(function()use($pdo,$legacy_role){lhs_reward_reserve_gift($pdo,'qa_old','1001','QALEGACY',$legacy_role);},'legacy sent log remains claimed');

$qa_recharge['qa_account|1001']=5000;
$milestone_insert=$pdo->prepare('INSERT INTO recharge_milestones(period_type,milestone_amount,title,reward_items) VALUES(?,?,?,?)');
$milestone_insert->execute(array('day',1000,'Ngày',json_encode($items)));$milestone=$pdo->lastInsertId();
delivery_rejected(function()use($pdo,$role2,$milestone){lhs_reward_reserve_recharge($pdo,'qa_account','1002',$milestone,$role2);},'S1 recharge cannot unlock S2 milestone');
$delivery=lhs_reward_reserve_recharge($pdo,'qa_account','1001',$milestone,$role1);
$result=recharge_status_snapshot('qa_account','1001');
delivery_check($result['milestones'][0]['pending']&&!$result['milestones'][0]['claimed'],'snapshot distinguishes pending from claimed');
delivery_check((int)$result['milestones'][0]['delivery_id']===(int)$delivery['id'],'snapshot exposes retry id');
delivery_check(count(lhs_reward_pending_for_account($pdo,'qa_account','1001'))===1,'pending list exposes account-server delivery');
delivery_check(count(lhs_reward_pending_for_account($pdo,'qa_account','1002'))===0,'pending list excludes other server');
delivery_check(count(lhs_reward_pending_for_account($pdo,'qa_other','1001'))===0,'pending list excludes other account');
$qa_fail_call=count($qa_calls)+1;$result=lhs_reward_dispatch($pdo,$delivery);
delivery_check($result['pending'],'recharge lost response remains pending');
$expected_key='webgm_recharge_'.hash('sha256','qa_account|1001|'.$milestone.'|'.$qa_periods['day']);
delivery_check(lhs_reward_event_key($delivery,1)===$expected_key,'recharge event contract unchanged');
$qa_periods['day']='day:2026-09-07';$qa_recharge['qa_account|1001']=0;
$pdo->exec("UPDATE recharge_milestones SET is_active=0,reward_items='[]',milestone_amount=99999,period_type='month' WHERE id=".(int)$milestone);
$result=lhs_reward_retry($pdo,$delivery['id'],'qa_account','1001','recharge');
delivery_check($result['delivered']&&isset($qa_mail[$expected_key]),'recharge retry survives next day amount/period/reward edits');
delivery_check($qa_mail[$expected_key]['items']===$items&&$qa_mail[$expected_key]['role']==='qa_role_s1','recharge snapshot preserves original recipient and items');
delivery_check(count(lhs_reward_pending_for_account($pdo,'qa_account','1001'))===0,'confirmed reward leaves pending list');

$milestone_insert->execute(array('total',1000,'Legacy',json_encode($items)));$old_milestone=$pdo->lastInsertId();
$pdo->prepare("INSERT INTO recharge_milestone_claims(account_name,server_id,milestone_id,claim_period) VALUES('qa_account','1001',?,'total')")->execute(array($old_milestone));
$qa_recharge['qa_account|1001']=5000;
delivery_rejected(function()use($pdo,$old_milestone,$role1){lhs_reward_reserve_recharge($pdo,'qa_account','1001',$old_milestone,$role1);},'legacy milestone marker never auto regrants');
$status=recharge_status_snapshot('qa_account','1001');$last=end($status['milestones']);
delivery_check($last['claimed']&&!$last['pending'],'legacy milestone remains claimed unknown');

$gift_insert->execute(array('QALEASE','QALEASE',json_encode($items),0));
$delivery=lhs_reward_reserve_gift($pdo,'qa_account','1001','QALEASE',$role1);
$pdo->prepare("UPDATE web_reward_deliveries SET lease_token='other_worker',lease_until=DATE_ADD(NOW(),INTERVAL 2 MINUTE) WHERE id=?")->execute(array($delivery['id']));
$calls_before=count($qa_calls);$result=lhs_reward_dispatch($pdo,$delivery);
delivery_check($result['pending']&&count($qa_calls)===$calls_before,'active lease suppresses duplicate send');
$pdo->prepare("UPDATE web_reward_deliveries SET lease_until=DATE_SUB(NOW(),INTERVAL 3 MINUTE) WHERE id=?")->execute(array($delivery['id']));
$role_missing=true;$result=lhs_reward_retry($pdo,$delivery['id'],'qa_account','1001','giftcode');
delivery_check($result['pending']&&count($qa_calls)===$calls_before,'missing stored recipient fails safe without send');
$role_missing=false;$result=lhs_reward_retry($pdo,$delivery['id'],'qa_account','1001','giftcode');
delivery_check($result['delivered'],'expired lease and role lookup recover');

$gift_insert->execute(array('QAAUDIT','QAAUDIT',json_encode($items),1));
$audit_gift=$pdo->lastInsertId();
$delivery=lhs_reward_reserve_gift($pdo,'qa_account','1001','QAAUDIT',$role1);
$qa_audit_failure=true;$result=lhs_reward_dispatch($pdo,$delivery);
delivery_check($result['pending'],'audit failure keeps outbox pending after actual mail confirmation');
delivery_check((int)$pdo->query('SELECT used_count FROM giftcodes WHERE id='.(int)$audit_gift)->fetchColumn()===0,'audit failure rolls back used_count finalization');
$audit_calls=count($qa_calls);$qa_audit_failure=false;
$result=lhs_reward_retry($pdo,$delivery['id'],'qa_account','1001','giftcode');
delivery_check($result['delivered']&&count($qa_calls)===$audit_calls,'audit recovery finalizes without re-sending confirmed mail');
delivery_check((int)$pdo->query('SELECT used_count FROM giftcodes WHERE id='.(int)$audit_gift)->fetchColumn()===1,'audit recovery records gift exactly once');

echo json_encode(array('result'=>'PASS','checks'=>count($checks),'details'=>$checks,'database'=>'connection-scoped TEMPORARY fixture tables','databaseVersion'=>$pdo->query('SELECT VERSION()')->fetchColumn(),'productionRowsWritten'=>0,'networkDelivery'=>'fixture only','uniqueMailEvents'=>count($qa_mail)), JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT) . PHP_EOL;
