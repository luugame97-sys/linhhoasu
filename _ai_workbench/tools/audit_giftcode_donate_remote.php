<?php
require '/linhhoasu/webgame/gm/config.php';

function rows($conn, $sql, $params = array()) {
    $stmt = $conn->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

$tables = rows($conn_web, 'SHOW TABLES');
$tableNames = array();
foreach ($tables as $row) {
    foreach ($row as $value) $tableNames[] = (string)$value;
}
$wanted = array();
foreach ($tableNames as $name) {
    if (stripos($name, 'gift') !== false || stripos($name, 'donate') !== false || stripos($name, 'recharge') !== false || stripos($name, 'milestone') !== false) $wanted[] = $name;
}

$out = array('result' => 'ok', 'tables' => array(), 'giftcodes' => array(), 'gift_batches' => array(), 'gift_logs' => array(), 'donate_rows' => array(), 'donate_claims' => array(), 'gm_logs' => array());
foreach ($wanted as $name) {
    try {
        $out['tables'][$name] = rows($conn_web, 'DESCRIBE `' . str_replace('`', '``', $name) . '`');
    } catch (Exception $e) {
        $out['tables'][$name] = array('error' => $e->getMessage());
    }
}

if (in_array('giftcodes', $tableNames, true)) {
    $out['giftcodes'] = rows($conn_web, 'SELECT id,code,giftcode,is_active,used_count,max_uses,expire_at,expires_at,reward_items FROM giftcodes ORDER BY id');
}
if (in_array('giftcode_delivery_batches', $tableNames, true)) {
    $out['gift_batches'] = rows($conn_web, 'SELECT id,account_name,server_id,giftcode_id,batch_no,status,attempts,last_error,items_json,created_at,updated_at FROM giftcode_delivery_batches ORDER BY id');
}
if (in_array('giftcode_logs', $tableNames, true)) {
    $out['gift_logs'] = rows($conn_web, 'SELECT * FROM giftcode_logs ORDER BY id');
}
foreach (array('donate_milestones', 'donate_rewards', 'recharge_milestones', 'recharge_rewards', 'donate_claims', 'recharge_claims', 'recharge_milestone_claims', 'recharge_orders') as $name) {
    if (!in_array($name, $tableNames, true)) continue;
    try {
        $out['donate_rows'][$name] = rows($conn_web, 'SELECT * FROM `' . $name . '` ORDER BY 1');
    } catch (Exception $e) {
        $out['donate_rows'][$name] = array('error' => $e->getMessage());
    }
}
if (in_array('gm_logs', $tableNames, true)) {
    $out['gm_logs'] = rows($conn_web, 'SELECT * FROM gm_logs ORDER BY id DESC LIMIT 250');
}

echo json_encode($out, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL;
