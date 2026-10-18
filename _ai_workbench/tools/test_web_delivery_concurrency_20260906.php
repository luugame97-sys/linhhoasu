<?php
// True contention on the LOCAL disposable MySQL instance only. No remote mode.
$candidate = $argv[1]; $schema_file = $argv[2];
$worker = isset($argv[3]) && $argv[3] === '--worker';
$schema = $worker ? $argv[4] : ('qa_web_delivery_concurrency_' . bin2hex(random_bytes(5)));
if (!preg_match('/^qa_web_delivery_concurrency_[a-f0-9]{10}$/D', $schema)) throw new RuntimeException('Unsafe fixture schema.');
$pdo = new PDO('mysql:host=127.0.0.1;port=33316;charset=utf8mb4', 'root', '', array(PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_EMULATE_PREPARES=>false));
if (!$worker) $pdo->exec('CREATE DATABASE `' . $schema . '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
$pdo->exec('USE `' . $schema . '`');
function gm_get_server($id) { return in_array((string)$id,array('1001','1002'),true); }
function gm_role_id($role) { return $role['role_id']; }
function parse_reward_items($raw,$limit=20) { return json_decode($raw,true); }
require $candidate . '/reward_delivery.php';
if ($worker) {
    $number = (int)$argv[5]; $gate = (float)$argv[6];
    while (microtime(true) < $gate) usleep(1000);
    $account = 'qa_worker_' . $number; $server = $number % 2 === 0 ? '1001' : '1002';
    $role = array('role_id'=>'qa_role_'.$number,'account_id'=>$account,'server_id'=>$server);
    try { $row=lhs_reward_reserve_gift($pdo,$account,$server,'QALIMITONE',$role); echo json_encode(array('result'=>'reserved','id'=>(int)$row['id'])); }
    catch (InvalidArgumentException $e) { echo json_encode(array('result'=>'rejected')); }
    exit;
}
$pdo->exec("CREATE TABLE giftcodes(id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,code VARCHAR(80),giftcode VARCHAR(80),reward_items TEXT,max_uses INT DEFAULT 1,used_count INT DEFAULT 0,is_active INT DEFAULT 1,expire_at DATETIME NULL,expires_at DATETIME NULL) ENGINE=InnoDB");
$pdo->exec("CREATE TABLE giftcode_logs(id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,account_name VARCHAR(64),server_id VARCHAR(32),giftcode_id BIGINT UNSIGNED,UNIQUE KEY uq_claim(account_name,server_id,giftcode_id)) ENGINE=InnoDB");
$pdo->exec("CREATE TABLE giftcode_delivery_batches(id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,account_name VARCHAR(64),server_id VARCHAR(32),giftcode_id BIGINT UNSIGNED) ENGINE=InnoDB");
$pdo->exec(file_get_contents($schema_file));
$stmt=$pdo->prepare("INSERT INTO giftcodes(code,giftcode,reward_items) VALUES('QALIMITONE','QALIMITONE',?)");$stmt->execute(array(json_encode(array(array('item_id'=>28041,'amount'=>1)))));
$workers=array();$start=microtime(true)+1.5;
for($i=0;$i<12;$i++) {
    $command=array(PHP_BINARY,__FILE__,$candidate,$schema_file,'--worker',$schema,(string)$i,(string)$start);
    $pipes=array();$process=proc_open($command,array(0=>array('pipe','r'),1=>array('pipe','w'),2=>array('pipe','w')),$pipes);
    if(!is_resource($process))throw new RuntimeException('Worker start failed.');
    fclose($pipes[0]);$workers[]=array($process,$pipes);
}
$reserved=0;$rejected=0;
foreach($workers as $entry) {
    $raw=stream_get_contents($entry[1][1]);$err=stream_get_contents($entry[1][2]);fclose($entry[1][1]);fclose($entry[1][2]);$exit=proc_close($entry[0]);
    $result=json_decode($raw,true);
    if($exit!==0||!is_array($result))throw new RuntimeException('Worker failed: '.$raw.' '.$err);
    if($result['result']==='reserved')$reserved++;elseif($result['result']==='rejected')$rejected++;
}
$rows=(int)$pdo->query('SELECT COUNT(*) FROM web_reward_deliveries')->fetchColumn();
if($reserved!==1||$rejected!==11||$rows!==1)throw new RuntimeException('Quota race: '.json_encode(array($reserved,$rejected,$rows)));
echo json_encode(array('result'=>'PASS','databaseVersion'=>$pdo->query('SELECT VERSION()')->fetchColumn(),'schema'=>$schema,'workers'=>12,'reserved'=>1,'rejected'=>11,'durableRows'=>1,'productionRowsWritten'=>0,'cleanup'=>'Isolated local QA schema retained for review; no live data.')) . PHP_EOL;
