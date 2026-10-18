<?php
// No incoming webhook/auth bypass/network: actual business code + isolated SQL.
$candidate=$argv[1];$local=!isset($pdo);$schema='qa_web_payment_'.getmypid();
if($local){
    $pdo=new PDO('mysql:host=127.0.0.1;port=33316;charset=utf8mb4','root','',array(PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_EMULATE_PREPARES=>false));
    $pdo->exec('CREATE DATABASE `'.$schema.'`');$pdo->exec('USE `'.$schema.'`');
}
$conn_web=$pdo;$checks=array();
function pcheck($ok,$label){global$checks;if(!$ok)throw new RuntimeException($label);$checks[]=$label;}
function pvalue($sql){global$pdo;return$pdo->query($sql)->fetchColumn();}
function payment_function($source,$name){
    $tokens=token_get_all($source);$found=false;$code='';$depth=0;$body=false;
    for($i=0;$i<count($tokens);$i++){$t=$tokens[$i];if(!$found&&is_array($t)&&$t[0]===T_FUNCTION){$j=$i+1;while(is_array($tokens[$j])&&$tokens[$j][0]===T_WHITESPACE)$j++;if(is_array($tokens[$j])&&$tokens[$j][1]===$name)$found=true;}
        if($found){$v=is_array($t)?$t[1]:$t;$code.=$v;if($v==='{'){$depth++;$body=true;}elseif($v==='}'){$depth--;if($body&&$depth===0)return$code;}}}
    throw new RuntimeException('Missing '.$name);
}
class PaymentExit extends Error {public $response;function __construct($r){$this->response=$r;}}
function webhook_json($success,$message='',$extra=array(),$status=200){throw new PaymentExit(array('success'=>$success,'status'=>$status));}
function system_event_log(){}
$source=file_get_contents($candidate.'/api/sepay_webhook.php');
foreach(array('webhook_legacy_transfer_id','webhook_transfer_identity','webhook_transfer_id','webhook_receipt_amount','webhook_receipt_matches','webhook_receipt_state','webhook_log_event')as$name)eval(payment_function($source,$name));
$start=strpos($source,"    try {\n        \$conn_web->beginTransaction();",strpos($source,"if (preg_match('/(?:DONATE|THEMXU)"));
$end=strpos($source,"\n}\n\nif (preg_match('/(?:DONATE|UNGHO)",$start);
if($start===false||$end===false)throw new RuntimeException('Actual topup body shape changed');
$business=substr($source,$start,$end-$start);
function topup($data,$account='qa_pay',$server='1001',$amount=5001){
    global$business,$conn_web;$server_id=$server;$receipt_identity=webhook_transfer_identity($data,'fixture');$tran_id=$receipt_identity['id'];$content='QA fixture';
    try{eval($business);}catch(PaymentExit$e){return$e->response;}
    throw new RuntimeException('Missing webhook response');
}
try{
    if(!$local){foreach(array('account','sepay_logs')as$t){$ddl=$pdo->query('SHOW CREATE TABLE `'.$t.'`')->fetch(PDO::FETCH_NUM)[1];$pdo->exec(preg_replace('/^CREATE TABLE /','CREATE TEMPORARY TABLE ',$ddl));}}
    else{
        $pdo->exec('CREATE TEMPORARY TABLE account(account VARCHAR(64) PRIMARY KEY,password_hash VARCHAR(255),ptb BIGINT NOT NULL) ENGINE=InnoDB');
        $pdo->exec('CREATE TEMPORARY TABLE sepay_logs(id BIGINT PRIMARY KEY AUTO_INCREMENT,tran_id VARCHAR(120) UNIQUE,external_id VARCHAR(120) UNIQUE,account_name VARCHAR(64),server_id VARCHAR(32),amount DECIMAL(15,2),action VARCHAR(32),content TEXT) ENGINE=InnoDB');
    }
    $pdo->exec("INSERT INTO account(account,password_hash,ptb)VALUES('qa_pay','fixture',0),('qa_other','fixture',0)");
    $a=array('id'=>100,'code'=>'SAME_ORDER');$b=array('id'=>101,'code'=>'SAME_ORDER');
    pcheck(webhook_transfer_id($a)!==webhook_transfer_id($b),'provider ids beat reused merchant code');
    pcheck(topup($a)['success']&&topup($b,'qa_pay','1002')['success'],'two distinct transfers on two servers accepted');
    pcheck((int)pvalue("SELECT ptb FROM account WHERE account='qa_pay'")===10002,'two genuine transfers credit exactly twice');
    pcheck(topup($a)['success']&&(int)pvalue("SELECT ptb FROM account WHERE account='qa_pay'")===10002,'identical retry no extra credit');
    foreach(array(array('qa_other','1001',5001),array('qa_pay','1002',5001),array('qa_pay','1001',6000))as$bind){$r=topup($a,$bind[0],$bind[1],$bind[2]);pcheck(!$r['success']&&$r['status']===409,'receipt rejects altered account/server/amount');}
    $pdo->exec("INSERT INTO sepay_logs(tran_id,account_name,server_id,amount,action)VALUES('SEPAY-LEGACY','qa_pay','1001',5001,'topup_xu')");
    $r=topup(array('id'=>200,'code'=>'LEGACY'));pcheck(!$r['success']&&$r['status']===409,'legacy merchant receipt requires reconciliation');
    pcheck((int)pvalue("SELECT ptb FROM account WHERE account='qa_pay'")===10002,'legacy conflict never credits');
    $ref=array('referenceCode'=>'BANKREF','id'=>201,'code'=>'shared');
    pcheck(webhook_transfer_id($ref)==='SEPAY-BANKREF','existing reference namespace preserved');
    pcheck(topup($ref)['success']&&topup($ref)['success'],'reference duplicate accepted idempotently');
    pcheck((int)pvalue("SELECT ptb FROM account WHERE account='qa_pay'")===15003,'reference transfer credits once');
    $r=topup(array('code'=>'ONLYMERCHANT'));pcheck(!$r['success']&&$r['status']===409,'merchant-only payload cannot create financial receipt');
    $pdo->exec("INSERT INTO sepay_logs(tran_id,external_id,account_name,server_id,amount,action)VALUES('SEPAY-ID-300',NULL,'qa_pay','1001',5001,'topup_xu')");
    $r=topup(array('id'=>300));pcheck(!$r['success']&&$r['status']===409,'old code collision with new namespace requires marker');
    pcheck(webhook_transfer_id(array('transactionId'=>'relay_1'))==='SEPAY-TXN-relay_1','explicit relay transactionId supported');
    pcheck(webhook_transfer_id(array('tranId'=>'relay_2'))==='SEPAY-TRAN-relay_2','explicit relay tranId supported');
    $r=topup(array('id'=>400),'missing_wallet');pcheck(!$r['success']&&$r['status']===500,'missing wallet returns retryable failure');
    pcheck((int)pvalue("SELECT COUNT(*) FROM sepay_logs WHERE tran_id='SEPAY-ID-400'")===0,'missing wallet leaves no receipt');
    $pdo->exec("INSERT INTO sepay_logs(tran_id,external_id,account_name,server_id,amount,action)VALUES('SEPAY-ID-500','SEPAY-ID-500','qa_pay','1001',5001,'vip')");
    $r=topup(array('id'=>500));pcheck(!$r['success']&&$r['status']===409,'receipt cannot change VIP into topup');
    pcheck((int)pvalue("SELECT ptb FROM account WHERE account='qa_pay'")===15003,'all conflicts leave balance unchanged');
    echo json_encode(array('result'=>'PASS','checks'=>count($checks),'passedChecks'=>$checks,'php'=>PHP_VERSION,'databaseVersion'=>$pdo->query('SELECT VERSION()')->fetchColumn(),'productionRowsWritten'=>0,'network'=>'none; extracted actual topup business code','source_sha256'=>hash('sha256',$source)),JSON_UNESCAPED_UNICODE);
}finally{if($pdo->inTransaction())$pdo->rollBack();if($local){$pdo->exec('DROP DATABASE `'.$schema.'`');}}
