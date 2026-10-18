<?php
/* Local isolated MariaDB only. Evaluates the actual scoped admin action bodies. */
if (PHP_SAPI !== 'cli') exit(1);
$candidate = isset($argv[1]) ? $argv[1] : dirname(__DIR__) . '/temp/web_multiserver_20260906/candidate';
$conn_web = new PDO('mysql:host=127.0.0.1;port=33316;charset=utf8mb4', 'root', '', array(PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION));
$schema = 'qa_web_admin_scope_' . getmypid();
$conn_web->exec('CREATE DATABASE `' . $schema . '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
$conn_web->exec('USE `' . $schema . '`');
$conn_web->exec("CREATE TABLE account(account VARCHAR(64) PRIMARY KEY,vip_level INT NOT NULL DEFAULT 0,sdk_user_id VARCHAR(64)) ENGINE=InnoDB");
$conn_web->exec("CREATE TABLE auth_codes(id INT AUTO_INCREMENT PRIMARY KEY,code VARCHAR(64),vip_type INT,source VARCHAR(64),is_used INT,is_active INT,used_by_account VARCHAR(64),used_server_id VARCHAR(32),used_at DATETIME) ENGINE=InnoDB");
$conn_web->exec('CREATE TABLE giftcodes(id INT PRIMARY KEY,is_active INT) ENGINE=InnoDB');
$conn_web->exec('CREATE TABLE giftcode_logs(id INT PRIMARY KEY,giftcode_id INT) ENGINE=InnoDB');
$conn_web->exec('INSERT INTO giftcodes VALUES(1,1)');
$conn_web->exec('INSERT INTO giftcode_logs VALUES(1,1)');
$conn_web->exec("INSERT INTO account VALUES('qa_scope_user',2,'qa_scope_user')");
$conn_web->exec("INSERT INTO auth_codes(code,vip_type,is_used,is_active,used_by_account,used_server_id) VALUES('S1-active',1,1,1,'qa_scope_user','1001'),('S2-active',2,1,1,'qa_scope_user','1002'),('S2-inactive',2,1,0,'qa_scope_user','1002'),('unknown',1,1,1,'qa_scope_user','9999')");
class TestAdminResponse extends Exception { public $data; function __construct($data) { parent::__construct('response'); $this->data=$data; } }
function admin_exit($status,$message='',$extra=array()) { throw new TestAdminResponse(array_merge(array('status'=>$status,'message'=>$message),$extra)); }
function admin_require_rate() {}
function admin_log() {}
function admin_log_error($scope,$e) { throw $e; }
function admin_random_bytes($n) { return random_bytes($n); }
function vht6ur_clean_account($a) { return strtolower(trim($a)); }
function hk_find_account($account) { global $conn_web; $s=$conn_web->prepare('SELECT * FROM account WHERE account=?');$s->execute(array($account));return $s->fetch(PDO::FETCH_ASSOC); }
function vht6ur_account($a) { return hk_find_account($a); }
function vht6ur_sdk_sync_vip() { return true; }
function system_event_log() {}
function gm_get_server($s) { return in_array((string)$s,array('1001','1002'),true) ? array('name'=>'QA '.$s) : false; }
$lookups = array();
function hk_roles_for_account($id,$account,$server) { global $lookups;$lookups[]=(string)$server;return array(array('role_id'=>'same_uid','role_name'=>'Name-'.$server)); }
function gm_role_id($r) { return $r['role_id']; }
function gm_role_name($r,$default='') { return $r['role_name']; }
$config = file_get_contents(dirname($candidate).'/config.redacted.php');
if (!preg_match('/^function vht6ur_recalculate_account_vip\([^\n]+/m',$config,$match)) throw new Exception('recalculate helper missing');
eval($match[0]);
$source=file_get_contents($candidate.'/admin/admin_api.php');
function action_body($source,$name,$next) {
    $start=strpos($source,"    case '".$name."':");$end=strpos($source,"    case '".$next."':",$start+1);
    if($start===false||$end===false)throw new Exception('action missing');
    return "switch ('".$name."') {".substr($source,$start,$end-$start).'}';
}
function run_body($body) { global $conn_web,$current_server_id; try{eval($body);}catch(TestAdminResponse $r){return $r->data;}throw new Exception('No response'); }
$passed=0;
function check($condition,$label) { global $passed;if(!$condition)throw new Exception('FAIL '.$label);$passed++;echo 'PASS '.$label.PHP_EOL; }
try {
    $vip_body=action_body($source,'set_user_vip','update_xu');
    $current_server_id='1001';$_POST=array('account'=>'qa_scope_user','vip_type'=>0);
    $r=run_body($vip_body);check($r['status']==='success','revoke S1 succeeds');
    check((int)$conn_web->query("SELECT is_active FROM auth_codes WHERE code='S1-active'")->fetchColumn()===0,'S1 is revoked');
    check((int)$conn_web->query("SELECT is_active FROM auth_codes WHERE code='S2-active'")->fetchColumn()===1,'S2 remains active');
    check((int)$conn_web->query("SELECT vip_level FROM account WHERE account='qa_scope_user'")->fetchColumn()===2,'global compatibility VIP retains highest other server');
    $current_server_id='1002';$_POST=array('account'=>'qa_scope_user','vip_type'=>1);$r=run_body($vip_body);
    check($r['status']==='success','set S2 VIP1 succeeds');
    check((int)$conn_web->query("SELECT COUNT(*) FROM auth_codes WHERE used_server_id='1002' AND is_active=1 AND vip_type=1")->fetchColumn()===1,'new entitlement bound S2');
    check((int)$conn_web->query("SELECT is_active FROM auth_codes WHERE code='S2-active'")->fetchColumn()===0,'old S2 entitlement revoked');
    check((int)$conn_web->query("SELECT is_active FROM auth_codes WHERE code='unknown'")->fetchColumn()===1,'unrelated server row untouched');
    $current_server_id='1001';$_POST=array('search'=>'');$lookups=array();
    $r=run_body(action_body($source,'get_auth_codes','create_auth_code'));
    check($r['status']==='success','VIP catalog lookup succeeds');
    foreach($r['data'] as $row){$sid=(string)$row['used_server_id'];check($row['char_info']['name']===($sid==='9999'?'':'Name-'.$sid),'row '.$row['code'].' resolves its own server');}
    sort($lookups);check($lookups===array('1001','1002'),'lookup cached once per account and server; unknown skipped');
    $_POST=array('id'=>1);$r=run_body(action_body($source,'delete_giftcode','get_recharge_milestones'));
    check($r['status']==='success' && (int)$conn_web->query('SELECT is_active FROM giftcodes WHERE id=1')->fetchColumn()===0,'delete giftcode disables while preserving source');
    check((int)$conn_web->query('SELECT COUNT(*) FROM giftcode_logs WHERE giftcode_id=1')->fetchColumn()===1,'delete giftcode preserves claim history');
    echo json_encode(array('status'=>'PASS','checks'=>$passed,'schema'=>$schema,'scope'=>'isolated local MariaDB; no network game calls')).PHP_EOL;
} finally {
    $conn_web->exec('DROP DATABASE `' . $schema . '`');
}
