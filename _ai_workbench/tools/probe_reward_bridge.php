<?php
require '/linhhoasu/webgame/gm/config.php';

$fakeUser = 'audit_nonexistent_user_' . date('YmdHis');
$response = lhs_internal_mail_send(array(
    'userId' => $fakeUser,
    'title' => 'AUDIT_ONLY',
    'content' => 'AUDIT_ONLY Lô 1/1',
    'sender' => 'audit',
    'attachments' => array(array('id' => 4, 'count' => 1)),
    'eventKey' => 'audit-only-invalid-user-' . date('YmdHis'),
));
$replay = lhs_mail_items(
    '1001',
    'u_Wk_1001_4f8629_1788004891118',
    'Replay audit',
    'Replay audit',
    array(array('item_id' => 100043, 'amount' => 1)),
    $replayError,
    'webshop-reward-fix-v2-order-16'
);
$events = array();
try {
    $events = $conn_web->query("SELECT * FROM system_event_logs WHERE category IN ('giftcode','recharge','mail') OR action LIKE '%gift%' OR action LIKE '%recharge%' OR action LIKE '%mail%' ORDER BY id DESC LIMIT 100")->fetchAll(PDO::FETCH_ASSOC);
} catch (Exception $e) {
    $events = array('error' => $e->getMessage());
}
echo json_encode(array(
    'base' => lhs_api_base(),
    'fake_user_probe' => array(
        'success' => !empty($response['success']),
        'http_code' => isset($response['http_code']) ? (int)$response['http_code'] : 0,
        'data' => isset($response['data']) ? $response['data'] : array(),
        'error' => isset($response['error']) ? $response['error'] : '',
    ),
    'idempotent_replay_probe' => array(
        'success' => (bool)$replay,
        'error' => isset($replayError) ? $replayError : '',
    ),
    'events' => $events,
), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL;
