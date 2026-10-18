<?php
declare(strict_types=1);
if ($argc < 6) exit(2);
require_once $argv[1];
$mode = (string)$argv[2];
$account = (string)$argv[3];
$marker = preg_replace('/[^A-Za-z0-9_]/', '', (string)$argv[4]);
$stateFile = (string)$argv[5];

function ws_scalar(PDO $db, string $sql, array $params = array()): int {
    $stmt = $db->prepare($sql); $stmt->execute($params); return (int)$stmt->fetchColumn();
}

if ($mode === 'setup') {
    $wallet = ws_scalar($conn_web, 'SELECT ptb FROM account WHERE account=?', array($account));
    if (!vht6ur_account($account)) throw new RuntimeException('WEBGM_ACCOUNT_NOT_FOUND');
    $credit = $wallet < 1 ? 1 - $wallet : 0;
    $rateMax = ws_scalar($conn_web, 'SELECT COALESCE(MAX(id),0) FROM api_rate_limits');
    $gmMax = ws_scalar($conn_web, 'SELECT COALESCE(MAX(id),0) FROM gm_logs');
    $createdAt = gmdate('Y-m-d\TH:i:s.000\Z');
    $conn_web->beginTransaction();
    try {
        if ($credit > 0) {
            $stmt = $conn_web->prepare('UPDATE account SET ptb=ptb+? WHERE account=? AND ptb=?');
            $stmt->execute(array($credit, $account, $wallet));
            if ($stmt->rowCount() !== 1) throw new RuntimeException('WALLET_CREDIT_CAS_FAILED');
        }
        $stmt = $conn_web->prepare('INSERT INTO webshop_items(item_id,item_name,image_url,price,item_amount,sort_order,is_active) VALUES(?,?,?,?,?,999999,1)');
        $stmt->execute(array('175', 'QA S2 ' . $marker, '', 1, 1));
        $shopId = (int)$conn_web->lastInsertId();
        $conn_web->commit();
    } catch (Throwable $e) {
        if ($conn_web->inTransaction()) $conn_web->rollBack(); throw $e;
    }
    $state = array('shop_id'=>$shopId,'wallet_before'=>$wallet,'credit'=>$credit,'rate_max'=>$rateMax,'gm_max'=>$gmMax,'created_at'=>$createdAt);
    file_put_contents($stateFile, json_encode($state)); chmod($stateFile, 0600);
    echo 'WEBGM_S2_WEBSHOP_SETUP=' . json_encode($state) . PHP_EOL; exit;
}

$state = json_decode((string)file_get_contents($stateFile), true);
if (!is_array($state)) throw new RuntimeException('WEBSHOP_STATE_INVALID');

if ($mode === 'verify') {
    $stmt = $conn_web->prepare('SELECT id,account_name,server_id,role_id,item_id,quantity,unit_price,total_price,status FROM webshop_orders WHERE account_name=? AND shop_item_id=? ORDER BY id DESC LIMIT 1');
    $stmt->execute(array($account, $state['shop_id']));
    $order = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$order) throw new RuntimeException('WEBSHOP_ORDER_MISSING');
    $s1 = ws_scalar($conn_web, 'SELECT COUNT(*) FROM webshop_orders WHERE account_name=? AND server_id=? AND shop_item_id=?', array($account, '1001', $state['shop_id']));
    $walletNow = ws_scalar($conn_web, 'SELECT ptb FROM account WHERE account=?', array($account));
    $expectedWallet = (int)$state['wallet_before'] + (int)$state['credit'] - 1;
    $result = array('order_id'=>(int)$order['id'],'server_id'=>(string)$order['server_id'],'role_hash'=>hash('sha256',(string)$order['role_id']),'item_id'=>(string)$order['item_id'],'status'=>(string)$order['status'],'s1_orders'=>$s1,'wallet_expected'=>$expectedWallet,'wallet_actual'=>$walletNow);
    if ($result['server_id'] !== '1002' || $result['item_id'] !== '175' || $result['status'] !== 'paid' || $s1 !== 0 || $walletNow !== $expectedWallet) throw new RuntimeException('WEBSHOP_VERIFY_FAILED');
    echo 'WEBGM_S2_WEBSHOP_QA=' . json_encode($result) . PHP_EOL; exit;
}

if ($mode === 'cleanup') {
    $orderCount = ws_scalar($conn_web, 'SELECT COUNT(*) FROM webshop_orders WHERE account_name=? AND shop_item_id=?', array($account, $state['shop_id']));
    $walletNow = ws_scalar($conn_web, 'SELECT ptb FROM account WHERE account=?', array($account));
    $expectedAfterPurchase = (int)$state['wallet_before'] + (int)$state['credit'] - ($orderCount > 0 ? 1 : 0);
    if ($walletNow !== $expectedAfterPurchase) throw new RuntimeException('WEBSHOP_CLEANUP_WALLET_DRIFT');
    $delta = (int)$state['wallet_before'] - $walletNow;
    $conn_web->beginTransaction();
    try {
        if ($delta !== 0) {
            $stmt = $conn_web->prepare('UPDATE account SET ptb=ptb+? WHERE account=? AND ptb=?');
            $stmt->execute(array($delta, $account, $walletNow));
            if ($stmt->rowCount() !== 1) throw new RuntimeException('WEBSHOP_WALLET_RESTORE_CAS_FAILED');
        }
        $conn_web->prepare('DELETE FROM webshop_orders WHERE account_name=? AND shop_item_id=?')->execute(array($account, $state['shop_id']));
        $conn_web->prepare("DELETE FROM gm_logs WHERE id>? AND account_name=? AND server_id='1002' AND action='webshop' AND details LIKE ?")->execute(array($state['gm_max'], $account, '175 x 1 = 1 Xu%'));
        $conn_web->prepare("DELETE FROM api_rate_limits WHERE id>? AND account_name=? AND ip='127.0.0.1' AND bucket='buy_shop_item'")->execute(array($state['rate_max'], $account));
        $conn_web->prepare('DELETE FROM webshop_items WHERE id=? AND item_name=?')->execute(array($state['shop_id'], 'QA S2 ' . $marker));
        $conn_web->commit();
    } catch (Throwable $e) {
        if ($conn_web->inTransaction()) $conn_web->rollBack(); throw $e;
    }
    $remaining = array('shop'=>ws_scalar($conn_web,'SELECT COUNT(*) FROM webshop_items WHERE id=?',array($state['shop_id'])),'orders'=>ws_scalar($conn_web,'SELECT COUNT(*) FROM webshop_orders WHERE shop_item_id=?',array($state['shop_id'])),'wallet_restored'=>ws_scalar($conn_web,'SELECT ptb FROM account WHERE account=?',array($account))===(int)$state['wallet_before']);
    if ($remaining['shop'] !== 0 || $remaining['orders'] !== 0 || !$remaining['wallet_restored']) throw new RuntimeException('WEBSHOP_CLEANUP_FAILED');
    @unlink($stateFile); echo 'WEBGM_S2_WEBSHOP_CLEANUP=' . json_encode($remaining) . PHP_EOL; exit;
}
throw new RuntimeException('WEBSHOP_MODE_INVALID');
