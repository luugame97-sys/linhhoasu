<?php
define('LHS_API_REQUEST', true);
require '/linhhoasu/webgame/gm/config.php';

$account = isset($argv[1]) ? trim((string)$argv[1]) : '';
$server = isset($argv[2]) ? trim((string)$argv[2]) : '';
if ($account === '' || $server === '') {
    fwrite(STDERR, "ACCOUNT_AND_SERVER_REQUIRED\n");
    exit(2);
}

$today_start = (new DateTimeImmutable('today', new DateTimeZone(date_default_timezone_get())))->format('Y-m-d H:i:s');
$today_end = (new DateTimeImmutable('tomorrow', new DateTimeZone(date_default_timezone_get())))->format('Y-m-d H:i:s');
$stmt = $conn_web->prepare("SELECT COUNT(*) AS order_count,
        COALESCE(SUM(CASE WHEN o.status='paid' THEN o.total_price ELSE 0 END),0) AS paid_spend,
        COALESCE(SUM(CASE WHEN o.status='refunded' THEN o.total_price ELSE 0 END),0) AS refunded_spend,
        MIN(o.created_at) AS first_order, MAX(o.created_at) AS last_order
    FROM webshop_orders o WHERE o.account_name=? AND o.server_id=?");
$stmt->execute(array($account, $server));
$all = $stmt->fetch(PDO::FETCH_ASSOC);

$today_stmt = $conn_web->prepare("SELECT COUNT(*) AS order_count,
        COALESCE(SUM(CASE WHEN status='paid' THEN total_price ELSE 0 END),0) AS paid_spend
    FROM webshop_orders WHERE account_name=? AND server_id=? AND created_at>=? AND created_at<?");
$today_stmt->execute(array($account, $server, $today_start, $today_end));
$today = $today_stmt->fetch(PDO::FETCH_ASSOC);

$rows_stmt = $conn_web->prepare("SELECT o.id,o.created_at,o.item_id,o.quantity,o.unit_price,o.total_price,o.status,COALESCE(si.item_name,'') AS item_name,COALESCE(si.item_amount,1) AS item_amount
    FROM webshop_orders o LEFT JOIN webshop_items si ON si.id=o.shop_item_id
    WHERE o.account_name=? AND o.server_id=? ORDER BY o.created_at DESC,o.id DESC LIMIT 3");
$rows_stmt->execute(array($account, $server));

echo json_encode(array('all' => $all, 'today' => $today, 'rows' => $rows_stmt->fetchAll(PDO::FETCH_ASSOC)), JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
