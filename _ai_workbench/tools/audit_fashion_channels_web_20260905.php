<?php
// CLI SELECT-only inventory. Do not bootstrap config.php (sessions/actions).
error_reporting(E_ERROR | E_PARSE);
$base = '/linhhoasu/webgame/gm';
$auditEnv = array();
foreach (array('/.env', '/linhhoasu/.env', '/linhhoasu/webgame/.env', $base.'/.env') as $file) {
    if (!is_readable($file)) continue;
    foreach (file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $line = trim($line);
        if ($line === '' || $line[0] === '#' || strpos($line, '=') === false) continue;
        list($key,$value) = explode('=', $line, 2);
        $value = trim($value);
        if (strlen($value)>1 && (($value[0]==='"' && substr($value,-1)==='"') || ($value[0]==="'" && substr($value,-1)==="'"))) $value=substr($value,1,-1);
        $auditEnv[trim($key)]=$value;
    }
}
function vht6ur_env($key, $default='') {
    global $auditEnv;
    $value=getenv($key);
    return $value!==false ? $value : (array_key_exists($key,$auditEnv)?$auditEnv[$key]:$default);
}
$config=file_get_contents($base.'/config.php');
foreach (array('Host','Port','Name','User','Pass') as $key) {
    if (!preg_match('/^\$db'.$key.'\s*=\s*[^\r\n]+;\s*$/m', $config, $match)) throw new RuntimeException('DB configuration shape changed');
    eval(trim($match[0]));
}
$pdo=new PDO("mysql:host={$dbHost};port={$dbPort};dbname={$dbName};charset=utf8mb4",$dbUser,$dbPass,array(PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC));
$pdo->exec('SET SESSION TRANSACTION READ ONLY');
$pdo->beginTransaction();
try {
    $out=array('readOnly'=>true,'databaseWrites'=>0,'sessionBootstrap'=>false,'tables'=>array());
    foreach(array(
      'webshop_items'=>array('id','item_id','item_name','name','category','item_amount','price','is_active'),
      'giftcodes'=>array('id','is_active','reward_items','expires_at','max_uses','used_count'),
      'recharge_milestones'=>array('id','is_active','reward_items'),
    ) as $table=>$allowed) {
        $q=$pdo->prepare('SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?');$q->execute(array($table));
        $columns=$q->fetchAll(PDO::FETCH_COLUMN);$selected=array_values(array_intersect($allowed,$columns));
        if(!$selected){$out['tables'][$table]=array();continue;}
        $out['tables'][$table]=$pdo->query('SELECT `'.implode('`,`',$selected).'` FROM `'.$table.'` ORDER BY id')->fetchAll();
    }
    $out['orders']=$pdo->query('SELECT item_id,server_id,status,COUNT(*) AS orders,SUM(quantity) AS quantity,MIN(created_at) AS first_at,MAX(created_at) AS last_at FROM webshop_orders GROUP BY item_id,server_id,status')->fetchAll();
    $out['generatedAt']=gmdate('c');
    $pdo->rollBack();
    echo json_encode($out,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
} catch(Throwable $e) {
    if($pdo->inTransaction())$pdo->rollBack();
    throw $e;
}
