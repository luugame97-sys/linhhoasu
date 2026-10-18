<?php
require '/linhhoasu/webgame/gm/config.php';

function fetchRows($conn, $sql, $params = array()) {
    $statement = $conn->prepare($sql);
    $statement->execute($params);
    return $statement->fetchAll(PDO::FETCH_ASSOC);
}

$out = array('result' => 'ok', 'giftcodes' => array(), 'activeDonate' => array(), 'donateClaims' => array(), 'donateLogs' => array(), 'systemEvents' => array());
$codes = fetchRows($conn_web, 'SELECT id,code,giftcode,is_active,used_count,max_uses,reward_items FROM giftcodes ORDER BY id');
foreach ($codes as $code) {
    $raw = json_decode((string)$code['reward_items'], true);
    if (!is_array($raw)) $raw = array();
    $items = array();
    foreach ($raw as $key => $value) {
        if (is_array($value)) {
            $id = (int)(isset($value['item_id']) ? $value['item_id'] : (isset($value['id']) ? $value['id'] : 0));
            $amount = (int)(isset($value['amount']) ? $value['amount'] : (isset($value['count']) ? $value['count'] : 0));
        } else {
            $id = (int)$key;
            $amount = (int)$value;
        }
        $items[] = array('id' => $id, 'amount' => $amount, 'allowed' => hk_reward_exists((string)$id), 'giftAmountValid' => gift_reward_amount_valid($id, $amount));
    }
    $out['giftcodes'][] = array('id' => (int)$code['id'], 'code' => $code['code'], 'is_active' => (int)$code['is_active'], 'used_count' => (int)$code['used_count'], 'max_uses' => (int)$code['max_uses'], 'items' => $items);
}

$active = fetchRows($conn_web, "SELECT id,period_type,title,milestone_amount,reward_items,is_active,sort_order FROM recharge_milestones WHERE is_active=1 ORDER BY period_type,sort_order,id");
foreach ($active as $row) {
    $raw = json_decode((string)$row['reward_items'], true);
    if (!is_array($raw)) $raw = array();
    $items = array();
    $valid = true;
    foreach ($raw as $key => $value) {
        if (is_array($value)) {
            $id = (int)(isset($value['item_id']) ? $value['item_id'] : (isset($value['id']) ? $value['id'] : 0));
            $amount = (int)(isset($value['amount']) ? $value['amount'] : (isset($value['count']) ? $value['count'] : 0));
        } else {
            $id = (int)$key;
            $amount = (int)$value;
        }
        $ok = hk_reward_exists((string)$id) && donate_reward_amount_valid($id, $amount);
        if (!$ok) $valid = false;
        $items[] = array('id' => $id, 'amount' => $amount, 'allowed' => hk_reward_exists((string)$id), 'donateAmountValid' => donate_reward_amount_valid($id, $amount));
    }
    $out['activeDonate'][] = array('id' => (int)$row['id'], 'period_type' => $row['period_type'], 'title' => $row['title'], 'milestone_amount' => (int)$row['milestone_amount'], 'valid' => $valid && count($items) > 0, 'items' => $items);
}

$out['donateClaims'] = fetchRows($conn_web, 'SELECT id,account_name,server_id,milestone_id,claim_period,created_at FROM recharge_milestone_claims ORDER BY id');
$out['donateLogs'] = fetchRows($conn_web, "SELECT id,account_name,server_id,target_role_id,action,details,created_at FROM gm_logs WHERE action='recharge_milestone' ORDER BY id");
try {
    $out['systemEvents'] = fetchRows($conn_web, 'SELECT * FROM system_event_logs ORDER BY id DESC LIMIT 100');
} catch (Exception $e) {
    $out['systemEvents'] = array('error' => $e->getMessage());
}
echo json_encode($out, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL;
