<?php
// SELECT-only, no config bootstrap, no sessions, no gameplay calls.
error_reporting(E_ERROR | E_PARSE);
$base = '/linhhoasu/webgame/gm';
$auditEnv = array();
foreach (array('/.env', '/linhhoasu/.env', '/linhhoasu/webgame/.env', $base.'/.env') as $file) {
    if (!is_readable($file)) continue;
    foreach (file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $line = trim($line);
        if ($line === '' || $line[0] === '#' || strpos($line, '=') === false) continue;
        list($key, $value) = explode('=', $line, 2);
        $value = trim($value);
        if (strlen($value) > 1 && (($value[0] === '"' && substr($value, -1) === '"') || ($value[0] === "'" && substr($value, -1) === "'"))) $value = substr($value, 1, -1);
        $auditEnv[trim($key)] = $value;
    }
}
function vht6ur_env($key, $default = '') {
    global $auditEnv;
    $value = getenv($key);
    return $value !== false ? $value : (array_key_exists($key, $auditEnv) ? $auditEnv[$key] : $default);
}
$config = file_get_contents($base.'/config.php');
foreach (array('Host', 'Port', 'Name', 'User', 'Pass') as $key) {
    if (!preg_match('/^\$db'.$key.'\s*=\s*[^\r\n]+;\s*$/m', $config, $match)) throw new RuntimeException('DB_CONFIG_SHAPE_CHANGED');
    eval(trim($match[0]));
}
$pdo = new PDO("mysql:host={$dbHost};port={$dbPort};dbname={$dbName};charset=utf8mb4", $dbUser, $dbPass, array(PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC));
$pdo->exec('SET SESSION TRANSACTION READ ONLY');
$pdo->beginTransaction();
try {
    $out = array('readOnly' => true, 'writes' => 0, 'at' => gmdate('c'), 'databaseVersion' => $pdo->query('SELECT VERSION()')->fetchColumn(), 'tables' => array());
    foreach (array('account', 'daily_checkins', 'webshop_orders', 'sepay_logs', 'recharge_orders', 'recharge_milestone_claims', 'giftcode_logs', 'giftcode_delivery_batches', 'auth_codes', 'gm_logs') as $table) {
        $stmt = $pdo->prepare('SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? ORDER BY ORDINAL_POSITION');
        $stmt->execute(array($table));
        $columns = $stmt->fetchAll();
        if (!$columns) continue;
        $indexes = $pdo->query('SHOW INDEX FROM `'.$table.'`')->fetchAll();
        $out['tables'][$table] = array('columns' => $columns, 'indexes' => array_map(function($row) {return array_intersect_key($row, array_flip(array('Key_name','Non_unique','Seq_in_index','Column_name')));}, $indexes));
    }
    $dailyColumns = array_column($out['tables']['daily_checkins']['columns'], 'COLUMN_NAME');
    $out['dailyDateColumns'] = array_values(array_filter($dailyColumns, function($v) {return preg_match('/date|day|time|created/', $v);}));
    $out['dailyCountsByServer'] = $pdo->query('SELECT server_id, COUNT(*) AS rows_count FROM daily_checkins GROUP BY server_id')->fetchAll();
    $out['dailyRows'] = $pdo->query('SELECT COUNT(*) FROM daily_checkins')->fetchColumn();
    $out['dailyDuplicateSummary'] = $pdo->query('SELECT COUNT(*) AS account_days, COALESCE(SUM(n-1),0) AS extra_claims, COALESCE(SUM(total_reward-first_reward),0) AS extra_xu FROM (SELECT account_name,claim_date,COUNT(*) n,SUM(reward_xu) total_reward,MIN(reward_xu) first_reward FROM daily_checkins GROUP BY account_name,claim_date HAVING COUNT(*)>1) duplicates')->fetch();
    $out['dailySettings'] = $pdo->query("SELECT setting_key,setting_value FROM web_settings WHERE setting_key IN ('daily_checkin_enabled','daily_checkin_xu')")->fetchAll();
    $out['legacyGiftBatchStates'] = $pdo->query('SELECT status,COUNT(*) AS n FROM giftcode_delivery_batches GROUP BY status')->fetchAll();
    $out['legacyMilestoneClaims'] = $pdo->query('SELECT COUNT(*) FROM recharge_milestone_claims')->fetchColumn();
    $out['pendingWebshop'] = $pdo->query("SELECT status, COUNT(*) AS rows_count FROM webshop_orders GROUP BY status")->fetchAll();
    $pdo->rollBack();
    echo json_encode($out, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    throw $e;
}
