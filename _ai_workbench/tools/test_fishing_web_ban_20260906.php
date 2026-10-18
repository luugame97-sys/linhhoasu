<?php
// Execute only the extracted candidate function, with no production PDO connection.
function vht6ur_clean_account($v){return strtolower(trim($v));}
function vht6ur_account($v){global $fixtureAccount;return $fixtureAccount;}
class QueryFixture {
    public function execute($args){return true;}
    public function fetch($mode){global $fixtureBan;return $fixtureBan;}
}
class ConnectionFixture { public function prepare($sql){return new QueryFixture();} }
$conn_web=new ConnectionFixture();
eval(file_get_contents($argv[1]));
$checks=array();
foreach(array(false,array('status'=>'active')) as $account){
    $fixtureAccount=$account;$fixtureBan=array('active'=>1,'ban_until'=>(int)round(microtime(true)*1000)+600000,'reason'=>'Nhận vượt gói miễn phí','ban_code'=>'FISH_FREE_20260906','banned_at'=>'','banned_by'=>'test','metadata_json'=>'{}');
    $state=vht6ur_web_ban_state('candidate',false);
    if(empty($state['banned'])||$state['permanent'])throw new Exception('MISSING_WEB_ACCOUNT_BYPASS');
    $checks[]=$account?'existing_account_banned':'missing_account_banned';
}
$fixtureAccount=false;$fixtureBan=false;
if(vht6ur_web_ban_state('candidate',false)['banned'])throw new Exception('UNRELATED_ACCOUNT_BLOCKED');
$checks[]='unrelated_missing_account_unblocked';
$fixtureAccount=array('status'=>'locked');$fixtureBan=false;
if(!vht6ur_web_ban_state('candidate',false)['permanent'])throw new Exception('LEGACY_LOCK_BYPASS');
$checks[]='legacy_lock_preserved';
echo json_encode(array('result'=>'PASS','count'=>count($checks),'checks'=>$checks,'productionWrites'=>0));
