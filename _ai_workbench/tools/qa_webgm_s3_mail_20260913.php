<?php
declare(strict_types=1);
// Review/stage explicitly. No account creation, ledger writes or cleanup here.
// Caller owns temporary Mongo fixture, readback and exact-ID cleanup.
if ($argc < 5) { fwrite(STDERR, "usage: script config.php qa_account qa_userid qa_marker [--apply]\n"); exit(2); }
require_once $argv[1];
$account=(string)$argv[2]; $uid=(string)$argv[3]; $marker=(string)$argv[4];
if (!preg_match('/^qa_s3_[a-z0-9_]{1,13}$/',$account)
    || !preg_match('/^qa_s3_[A-Za-z0-9_]{1,40}$/',$uid)
    || !preg_match('/^qa_s3_[A-Za-z0-9_]{1,40}$/',$marker)) throw new RuntimeException('QA_IDENTITY_GUARD');
if (lhs_game_server_id('1003')!==1003 || lhs_api_base('1003')!=='http://127.0.0.1:8084') throw new RuntimeException('S3_ROUTE_GUARD');
$role=lhs_find_role($uid,'1003',$account,false);
if(!$role)throw new RuntimeException('EXACT_QA_ROLE_NOT_FOUND');
$plan=array('server'=>1003,'account'=>$account,'uid'=>$uid,'events'=>array($marker.'_gift',$marker.'_donate'),'items'=>array(array('item_id'=>6,'amount'=>1)),'repeat'=>2);
if (!isset($argv[5]) || $argv[5]!=='--apply') { echo json_encode(array('dryRun'=>true,'plan'=>$plan),JSON_UNESCAPED_SLASHES).PHP_EOL;exit; }
foreach(array('gift','donate') as $scope){
    for($i=0;$i<2;$i++){
        $err='';
        if(!lhs_mail_items('1003',$uid,'QA S3 '.$scope,'Temporary isolated QA; no player reward.',$plan['items'],$err,$marker.'_'.$scope,$scope))throw new RuntimeException('QA_MAIL_FAILED:'.$scope.':'.$err);
    }
}
echo json_encode(array('sent'=>true,'plan'=>$plan,'requiresMongoReadback'=>true,'requiresExactFixtureCleanup'=>true),JSON_UNESCAPED_SLASHES).PHP_EOL;
