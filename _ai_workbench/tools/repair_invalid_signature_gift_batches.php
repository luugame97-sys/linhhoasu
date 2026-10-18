<?php
declare(strict_types=1);

require '/linhhoasu/webgame/gm/config.php';

$commit = in_array('--commit', $argv, true);
$backupDir = '';
foreach ($argv as $arg) {
    if (strpos((string)$arg, '--backup=') === 0) $backupDir = substr((string)$arg, 9);
}

$query = $conn_web->query(
    "SELECT b.id,b.account_name,b.server_id,b.giftcode_id,b.batch_no,b.status,b.attempts,b.last_error,b.items_json,b.created_at,b.updated_at,"
    . "COALESCE(NULLIF(g.code,''),g.giftcode) AS giftcode "
    . "FROM giftcode_delivery_batches b JOIN giftcodes g ON g.id=b.giftcode_id "
    . "WHERE b.status='failed' AND b.last_error='INVALID_SIGNATURE' ORDER BY b.id"
);
$rows = $query->fetchAll(PDO::FETCH_ASSOC);
if ($backupDir !== '') {
    @mkdir($backupDir, 0750, true);
    file_put_contents($backupDir . '/invalid_signature_batches_before.json', json_encode($rows, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT));
}

$results = array();
foreach ($rows as $row) {
    $result = array(
        'id' => (int)$row['id'],
        'account_name' => (string)$row['account_name'],
        'giftcode_id' => (int)$row['giftcode_id'],
        'giftcode' => (string)$row['giftcode'],
        'batch_no' => (int)$row['batch_no'],
        'status' => $commit ? 'pending-repair' : 'dry-run',
    );
    $items = parse_reward_items($row['items_json'], 20);
    if (!$items) {
        $result['status'] = 'invalid-items';
        $results[] = $result;
        continue;
    }
    $roles = lhs_roles_for_account((string)$row['account_name'], (string)$row['server_id']);
    if (!is_array($roles) || count($roles) < 1) {
        $result['status'] = 'role-not-found';
        $results[] = $result;
        continue;
    }
    $role = $roles[0];
    $roleId = gm_role_id($role);
    if ($roleId === '') {
        $result['status'] = 'role-id-empty';
        $results[] = $result;
        continue;
    }
    $eventKey = 'webgm_gift_' . hash('sha256', $row['account_name'] . '|' . $row['server_id'] . '|' . $row['giftcode_id'] . '|' . $row['batch_no']);
    $result['role_id'] = $roleId;
    $result['event_key'] = $eventKey;
    $result['items'] = $items;
    if (!$commit) {
        $results[] = $result;
        continue;
    }

    $claim = $conn_web->prepare("UPDATE giftcode_delivery_batches SET status='sending', attempts=attempts+1, last_error='' WHERE id=? AND status='failed' AND last_error='INVALID_SIGNATURE'");
    $claim->execute(array((int)$row['id']));
    if ($claim->rowCount() !== 1) {
        $result['status'] = 'not-claimed';
        $results[] = $result;
        continue;
    }

    $error = '';
    $title = 'Giftcode ' . strtoupper((string)$row['giftcode']);
    $content = 'Mã giftcode: ' . strtoupper((string)$row['giftcode']) . ' · Lô ' . (int)$row['batch_no'] . '/1';
    $sent = lhs_mail_items((string)$row['server_id'], $roleId, $title, $content, $items, $error, $eventKey, 'gift');
    if ($sent) {
        $conn_web->prepare("UPDATE giftcode_delivery_batches SET status='sent', last_error='' WHERE id=? AND status='sending'")->execute(array((int)$row['id']));
        $result['status'] = 'sent';
    } else {
        $message = $error !== '' ? $error : 'Gửi giftcode thất bại.';
        $conn_web->prepare("UPDATE giftcode_delivery_batches SET status='failed', last_error=? WHERE id=? AND status='sending'")->execute(array(substr($message, 0, 1000), (int)$row['id']));
        $result['status'] = 'failed';
        $result['error'] = $message;
    }
    $results[] = $result;
}

$statusRows = $conn_web->query("SELECT status,COUNT(*) AS count FROM giftcode_delivery_batches GROUP BY status ORDER BY status")->fetchAll(PDO::FETCH_ASSOC);
echo json_encode(array(
    'result' => 'ok',
    'commit' => $commit,
    'target_count' => count($rows),
    'results' => $results,
    'status_counts' => $statusRows,
), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT) . PHP_EOL;
