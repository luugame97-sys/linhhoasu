<?php
// Retry only existing deterministic compensation deliveries; never creates new rows.
if (PHP_SAPI !== 'cli') exit(1);
require_once '/linhhoasu/webgame/gm/config.php';
require_once '/linhhoasu/webgame/gm/web_context.php';
require_once '/linhhoasu/webgame/gm/reward_delivery.php';
if (!isset($pdo) || !($pdo instanceof PDO)) {
    $pdo = new PDO("mysql:host={$dbHost};port={$dbPort};dbname={$dbName};charset=utf8mb4", $dbUser, $dbPass,
        array(PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC));
}
$ids = array(920, 921, 922); $out = array();
foreach ($ids as $id) {
    $stmt = $pdo->prepare("SELECT * FROM web_reward_deliveries WHERE id=? AND kind='recharge' AND claim_period='comp-20260912-v1' LIMIT 1");
    $stmt->execute(array($id)); $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) throw new RuntimeException('COMP_DELIVERY_NOT_FOUND_' . $id);
    $_SESSION['username'] = $row['account_name'];
    $_SESSION['server_id'] = $row['server_id'];
    $out[] = array('id' => $id, 'result' => lhs_reward_dispatch($pdo, $row));
}
echo json_encode($out, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
