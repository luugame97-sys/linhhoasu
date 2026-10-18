<?php
declare(strict_types=1);

if ($argc < 6) exit(2);
require_once $argv[1];
$mode = (string)$argv[2];
$account = (string)$argv[3];
$marker = preg_replace('/[^A-Za-z0-9_]/', '', (string)$argv[4]);
$stateFile = (string)$argv[5];

function qa_scalar(PDO $db, string $sql, array $params = array()): int {
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    return (int)$stmt->fetchColumn();
}

if ($mode === 'setup') {
    $reward = json_encode(array(array('item_id' => 6, 'amount' => 1, 'name' => 'Bùa tăng tốc')), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $giftCode = 'QA_S2_' . strtoupper(substr(hash('sha256', $marker), 0, 16));
    $tranId = 'qa_s2_' . substr(hash('sha256', $marker . '|recharge'), 0, 32);
    $rateMax = qa_scalar($conn_web, 'SELECT COALESCE(MAX(id),0) FROM api_rate_limits');
    $gmMax = qa_scalar($conn_web, 'SELECT COALESCE(MAX(id),0) FROM gm_logs');
    $walletBefore = qa_scalar($conn_web, 'SELECT ptb FROM account WHERE account=?', array($account));
    if (!vht6ur_account($account)) throw new RuntimeException('WEBGM_ACCOUNT_NOT_FOUND');
    $conn_web->beginTransaction();
    try {
        $stmt = $conn_web->prepare('INSERT INTO giftcodes(code,giftcode,reward_items,max_uses,used_count,is_active,hide) VALUES(?,?,?,?,0,1,0)');
        $stmt->execute(array($giftCode, $giftCode, $reward, 1));
        $giftId = (int)$conn_web->lastInsertId();
        $stmt = $conn_web->prepare('INSERT INTO recharge_milestones(preset_code,period_type,title,milestone_amount,amount_required,reward_items,is_active,sort_order) VALUES(?,?,?,?,?,?,1,999999)');
        $stmt->execute(array($marker, 'total', 'QA S2 ' . $marker, 1, 1, $reward));
        $milestoneId = (int)$conn_web->lastInsertId();
        $stmt = $conn_web->prepare("INSERT INTO sepay_logs(tran_id,external_id,account_name,server_id,amount,action,content) VALUES(?,?,?,?,1,'topup_xu',?)");
        $stmt->execute(array($tranId, $tranId, $account, '1002', 'QA S2 rollback-only'));
        $sepayId = (int)$conn_web->lastInsertId();
        $conn_web->commit();
    } catch (Throwable $e) {
        if ($conn_web->inTransaction()) $conn_web->rollBack();
        throw $e;
    }
    $state = array(
        'gift_code' => $giftCode,
        'gift_id' => $giftId,
        'milestone_id' => $milestoneId,
        'tran_id' => $tranId,
        'sepay_id' => $sepayId,
        'rate_max' => $rateMax,
        'gm_max' => $gmMax,
        'wallet_before' => $walletBefore,
    );
    file_put_contents($stateFile, json_encode($state, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    chmod($stateFile, 0600);
    echo 'WEBGM_S2_SETUP=' . json_encode($state, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL;
    exit;
}

$state = json_decode((string)file_get_contents($stateFile), true);
if (!is_array($state)) throw new RuntimeException('QA_STATE_INVALID');

if ($mode === 'verify') {
    $giftEvent = 'webgm_gift_' . hash('sha256', $account . '|1002|' . $state['gift_id'] . '|1');
    $rechargeEvent = 'webgm_recharge_' . hash('sha256', $account . '|1002|' . $state['milestone_id'] . '|total');
    $result = array(
        'gift_log_s2' => qa_scalar($conn_web, 'SELECT COUNT(*) FROM giftcode_logs WHERE account_name=? AND server_id=? AND giftcode_id=?', array($account, '1002', $state['gift_id'])),
        'gift_log_s1' => qa_scalar($conn_web, 'SELECT COUNT(*) FROM giftcode_logs WHERE account_name=? AND server_id=? AND giftcode_id=?', array($account, '1001', $state['gift_id'])),
        'gift_batch_sent_s2' => qa_scalar($conn_web, "SELECT COUNT(*) FROM giftcode_delivery_batches WHERE account_name=? AND server_id=? AND giftcode_id=? AND status='sent'", array($account, '1002', $state['gift_id'])),
        'gift_used_count' => qa_scalar($conn_web, 'SELECT used_count FROM giftcodes WHERE id=?', array($state['gift_id'])),
        'recharge_claim_s2' => qa_scalar($conn_web, 'SELECT COUNT(*) FROM recharge_milestone_claims WHERE account_name=? AND server_id=? AND milestone_id=? AND claim_period=?', array($account, '1002', $state['milestone_id'], 'total')),
        'recharge_claim_s1' => qa_scalar($conn_web, 'SELECT COUNT(*) FROM recharge_milestone_claims WHERE account_name=? AND server_id=? AND milestone_id=?', array($account, '1001', $state['milestone_id'])),
        'gift_gm_log_s2' => qa_scalar($conn_web, "SELECT COUNT(*) FROM gm_logs WHERE id>? AND account_name=? AND server_id=? AND action='giftcode'", array($state['gm_max'], $account, '1002')),
        'recharge_gm_log_s2' => qa_scalar($conn_web, "SELECT COUNT(*) FROM gm_logs WHERE id>? AND account_name=? AND server_id=? AND action='recharge_milestone'", array($state['gm_max'], $account, '1002')),
        'wallet_unchanged' => qa_scalar($conn_web, 'SELECT ptb FROM account WHERE account=?', array($account)) === (int)$state['wallet_before'],
        'gift_event_key' => $giftEvent,
        'recharge_event_key' => $rechargeEvent,
    );
    $expectedOne = array('gift_log_s2','gift_batch_sent_s2','gift_used_count','recharge_claim_s2','gift_gm_log_s2','recharge_gm_log_s2');
    foreach ($expectedOne as $key) if ((int)$result[$key] !== 1) throw new RuntimeException('VERIFY_FAILED:' . $key);
    if ($result['gift_log_s1'] !== 0 || $result['recharge_claim_s1'] !== 0 || !$result['wallet_unchanged']) throw new RuntimeException('VERIFY_CROSS_SERVER_OR_WALLET_FAILED');
    echo 'WEBGM_S2_LEDGER_QA=' . json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL;
    exit;
}

if ($mode === 'cleanup') {
    $conn_web->beginTransaction();
    try {
        $conn_web->prepare('DELETE FROM giftcode_logs WHERE account_name=? AND giftcode_id=?')->execute(array($account, $state['gift_id']));
        $conn_web->prepare('DELETE FROM giftcode_delivery_batches WHERE account_name=? AND giftcode_id=?')->execute(array($account, $state['gift_id']));
        $conn_web->prepare('DELETE FROM recharge_milestone_claims WHERE account_name=? AND milestone_id=?')->execute(array($account, $state['milestone_id']));
        $conn_web->prepare("DELETE FROM gm_logs WHERE id>? AND account_name=? AND server_id=? AND ((action='giftcode' AND details=?) OR (action='recharge_milestone' AND details LIKE ?))")->execute(array($state['gm_max'], $account, '1002', $state['gift_code'], 'QA S2 ' . $marker . ' =>%'));
        $conn_web->prepare('DELETE FROM api_rate_limits WHERE id>? AND account_name=? AND ip=? AND bucket IN (\'giftcode\',\'claim_recharge_milestone\')')->execute(array($state['rate_max'], $account, '127.0.0.1'));
        $conn_web->prepare('DELETE FROM sepay_logs WHERE id=? AND tran_id=?')->execute(array($state['sepay_id'], $state['tran_id']));
        $conn_web->prepare('DELETE FROM recharge_milestones WHERE id=? AND preset_code=?')->execute(array($state['milestone_id'], $marker));
        $conn_web->prepare('DELETE FROM giftcodes WHERE id=? AND code=?')->execute(array($state['gift_id'], $state['gift_code']));
        $conn_web->commit();
    } catch (Throwable $e) {
        if ($conn_web->inTransaction()) $conn_web->rollBack();
        throw $e;
    }
    $remaining = array(
        'gift' => qa_scalar($conn_web, 'SELECT COUNT(*) FROM giftcodes WHERE id=?', array($state['gift_id'])),
        'gift_logs' => qa_scalar($conn_web, 'SELECT COUNT(*) FROM giftcode_logs WHERE giftcode_id=?', array($state['gift_id'])),
        'gift_batches' => qa_scalar($conn_web, 'SELECT COUNT(*) FROM giftcode_delivery_batches WHERE giftcode_id=?', array($state['gift_id'])),
        'milestone' => qa_scalar($conn_web, 'SELECT COUNT(*) FROM recharge_milestones WHERE id=?', array($state['milestone_id'])),
        'claims' => qa_scalar($conn_web, 'SELECT COUNT(*) FROM recharge_milestone_claims WHERE milestone_id=?', array($state['milestone_id'])),
        'sepay' => qa_scalar($conn_web, 'SELECT COUNT(*) FROM sepay_logs WHERE id=?', array($state['sepay_id'])),
        'wallet_unchanged' => qa_scalar($conn_web, 'SELECT ptb FROM account WHERE account=?', array($account)) === (int)$state['wallet_before'],
    );
    foreach ($remaining as $key => $value) if ($key !== 'wallet_unchanged' && (int)$value !== 0) throw new RuntimeException('CLEANUP_FAILED:' . $key);
    if (!$remaining['wallet_unchanged']) throw new RuntimeException('CLEANUP_WALLET_CHANGED');
    @unlink($stateFile);
    echo 'WEBGM_S2_CLEANUP=' . json_encode($remaining, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL;
    exit;
}

throw new RuntimeException('QA_MODE_INVALID');
