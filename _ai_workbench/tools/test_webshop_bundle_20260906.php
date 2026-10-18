<?php
// Connection is supplied by the read-only bootstrap; TEMPORARY tables shadow
// production names only for this connection and disappear on disconnect.
function check($value,$label){global$checks;if(!$value)throw new Exception('ASSERT: '.$label);$checks++;}
function extracted_function($source,$name){$tokens=token_get_all($source);$found=false;$buffer='';$depth=0;$started=false;for($i=0;$i<count($tokens);$i++){if(!$found&&is_array($tokens[$i])&&$tokens[$i][0]===T_FUNCTION){$j=$i+1;while(is_array($tokens[$j])&&$tokens[$j][0]===T_WHITESPACE)$j++;if(is_array($tokens[$j])&&$tokens[$j][1]===$name){$found=true;}}if($found){$t=is_array($tokens[$i])?$tokens[$i][1]:$tokens[$i];$buffer.=$t;if($t==='{'){$depth++;$started=true;}elseif($t==='}'){$depth--;if($started&&$depth===0)return$buffer;}}}throw new Exception('Missing function '.$name);}
$checks=0;$dir=$argv[1];$source=file_get_contents('/linhhoasu/webgame/gm/config.php');
foreach(array('webshop_int_value','webshop_positive_int','webshop_price_valid','webshop_split_reward_amount','gift_reward_amount_limit','gift_reward_amount_valid','hk_clean_reward_id')as$name)eval(extracted_function($source,$name));
function vht6ur_item_catalog(){static$c=null;if($c!==null)return$c;$c=array();global$dir;foreach(file($dir.'/assets/item/gmitem.txt',FILE_IGNORE_NEW_LINES)as$l){$r=explode(';',$l,2);if(count($r)===2)$c[(int)$r[0]]=$r[1];}return$c;}
function hk_reward_exists($id){return ctype_digit((string)$id)&&isset(vht6ur_item_catalog()[(int)$id]);}
function webshop_item_sale_enabled($id){return (int)$id!==999999999;}
function gm_role_id($role){return$role['role_id'];}function gm_role_name($role){return'fixture';}
$sent=array();$failDelivery=false;
function vht6ur_sdk_web_send_items($role,$name,$server,$items,&$error,$title,$content,$event,$scope){global$sent,$failDelivery;$sent[$event]=$items;if($failDelivery){$failDelivery=false;return false;}return true;}
require $dir.'/webshop_bundle.php';
foreach(array('account','webshop_items','webshop_orders')as$table){$schema=$pdo->query('SHOW CREATE TABLE `'.$table.'`')->fetch(PDO::FETCH_NUM);$pdo->exec(preg_replace('/^CREATE TABLE /','CREATE TEMPORARY TABLE ',$schema[1]));}
if(!$pdo->query("SHOW COLUMNS FROM webshop_items LIKE 'reward_items'")->fetch())$pdo->exec('ALTER TABLE webshop_items ADD COLUMN reward_items LONGTEXT NULL');
if(!$pdo->query("SHOW COLUMNS FROM webshop_orders LIKE 'request_key'")->fetch())$pdo->exec("ALTER TABLE webshop_orders ADD COLUMN request_key VARCHAR(64) NULL,ADD COLUMN reward_snapshot LONGTEXT NULL,ADD UNIQUE KEY uq_shop_request(account_name,request_key),MODIFY status ENUM('paid','failed','refunded','pending_delivery') NOT NULL DEFAULT 'paid'");
$pdo->exec("INSERT INTO account(account,password_hash,ptb) VALUES('bundle_test','not-a-password',1000000)");
$role=array('role_id'=>'fixture_role','server_id'=>'1001');$parts=array(array('id'=>28041,'amount'=>1),array('id'=>28042,'amount'=>1),array('id'=>28043,'amount'=>1),array('id'=>28049,'amount'=>1));
$s=$pdo->prepare('INSERT INTO webshop_items(item_id,item_name,price,item_amount,is_active,reward_items)VALUES(?,?,?,?,?,?)');$s->execute(array('28041','four',100,1,1,json_encode($parts)));$four=$pdo->lastInsertId();
$result=lhs_shop_purchase($pdo,'bundle_test','1001',$role,$four,2,'fixture_order_four_001');check($result['delivered'],'4-item delivered');check($result['xu_web']==='999800','debit full bundle price once');$mail=array_values($sent)[0];check(count($mail)===4,'4 attachments');check(array_sum(array_column($mail,'amount'))===8,'quantity multiplies each item');
$result=lhs_shop_purchase($pdo,'bundle_test','1001',$role,$four,2,'fixture_order_four_001');check($result['duplicate'],'retry duplicate');check(count($sent)===1,'one event key');check((int)$pdo->query("SELECT ptb FROM account WHERE account='bundle_test'")->fetchColumn()===999800,'no second debit');
$ten=array();foreach(array(1,2,4,6,19,24,50,55,60,65)as$id)$ten[]=array('id'=>$id,'amount'=>3);$s->execute(array('1','ten',200,1,1,json_encode($ten)));$tenId=$pdo->lastInsertId();$failDelivery=true;
$r=lhs_shop_purchase($pdo,'bundle_test','1001',$role,$tenId,1,'fixture_order_ten_001');check(!$r['delivered']&&$r['pending'],'unknown delivery stays pending');check(count(array_values($sent)[1])===10,'ten attachments preserved');$wallet=(int)$pdo->query("SELECT ptb FROM account WHERE account='bundle_test'")->fetchColumn();
$pdo->exec("UPDATE webshop_items SET reward_items='[]',price=9999 WHERE id=".(int)$tenId);$r=lhs_shop_purchase($pdo,'bundle_test','1001',$role,$tenId,1,'fixture_order_ten_001');check($r['delivered'],'reconcile from snapshot');check((int)$pdo->query("SELECT ptb FROM account WHERE account='bundle_test'")->fetchColumn()===$wallet,'pending retry no debit');check(count(array_values($sent)[1])===10,'edited catalog cannot alter old order');
function rejected($call,$label){try{$call();}catch(InvalidArgumentException$e){check(true,$label);return;}throw new Exception('Expected rejection '.$label);}
rejected(function()use($pdo,$role,$four){lhs_shop_purchase($pdo,'bundle_test','1001',$role,$four,3,'fixture_order_four_001');},'request binding');
rejected(function()use($pdo,$role,$four){lhs_shop_purchase($pdo,'bundle_test','1002',$role,$four,1,'fixture_wrong_server_01');},'server ownership');
rejected(function()use($pdo,$role,$four){lhs_shop_purchase($pdo,'bundle_test','1001',$role,$four,999999,'fixture_no_money_0001');},'insufficient funds');
foreach(array('[]','bad-json',json_encode(array(array('id'=>999999999,'amount'=>1))),json_encode(array(array('id'=>1,'amount'=>-1))),json_encode(array(array('id'=>1,'amount'=>1.1))))as$bad)rejected(function()use($bad){lhs_shop_parse_bundle($bad);},'bad bundle');
$tooMany=array_fill(0,21,array('id'=>1,'amount'=>1));rejected(function()use($tooMany){lhs_shop_parse_bundle($tooMany);},'over20');
$m=lhs_shop_parse_bundle(array(array('id'=>1,'amount'=>2),array('id'=>1,'amount'=>3)));check(count($m)===1&&$m[0]['amount']===5,'duplicate ID merging');
$s->execute(array('4','legacy',7,5,1,null));$legacy=$pdo->lastInsertId();$r=lhs_shop_purchase($pdo,'bundle_test','1001',$role,$legacy,2,'fixture_legacy_000001');check($r['delivered'],'legacy single item works');$last=end($sent);check(count($last)===1&&$last[0]['amount']===10,'legacy amount preserved');
check((int)$pdo->query('SELECT COUNT(*) FROM webshop_orders')->fetchColumn()===3,'only three durable orders');
echo json_encode(array('result'=>'PASS','checks'=>$checks,'database'=>'connection-scoped TEMPORARY tables','productionRowsWritten'=>0,'networkDelivery'=>'fake','bundle4'=>true,'bundle10'=>true,'pendingRecovery'=>true,'idempotentDebit'=>true,'legacyPreserved'=>true));
