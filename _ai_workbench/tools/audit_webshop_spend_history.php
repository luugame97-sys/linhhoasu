<?php
define('LHS_API_REQUEST', true);
require '/linhhoasu/webgame/gm/config.php';

$columns = $conn_web->query('SHOW COLUMNS FROM webshop_orders')->fetchAll(PDO::FETCH_ASSOC);
$indexes = $conn_web->query('SHOW INDEX FROM webshop_orders')->fetchAll(PDO::FETCH_ASSOC);
$item_columns = $conn_web->query('SHOW COLUMNS FROM webshop_items')->fetchAll(PDO::FETCH_ASSOC);
$item_indexes = $conn_web->query('SHOW INDEX FROM webshop_items')->fetchAll(PDO::FETCH_ASSOC);
$summary = $conn_web->query("SELECT COUNT(*) AS order_count, COALESCE(SUM(total_price),0) AS total_spend, MIN(created_at) AS first_order, MAX(created_at) AS last_order FROM webshop_orders")->fetch(PDO::FETCH_ASSOC);
$statuses = array();
$column_names = array_map(function ($row) { return (string)$row['Field']; }, $columns);
if (in_array('status', $column_names, true)) {
    $statuses = $conn_web->query("SELECT COALESCE(status,'') AS status, COUNT(*) AS order_count, COALESCE(SUM(total_price),0) AS total_spend FROM webshop_orders GROUP BY status ORDER BY status")->fetchAll(PDO::FETCH_ASSOC);
}
$daily = $conn_web->query("SELECT DATE(created_at) AS spend_date, COUNT(*) AS order_count, COALESCE(SUM(total_price),0) AS total_spend FROM webshop_orders GROUP BY DATE(created_at) ORDER BY spend_date DESC LIMIT 10")->fetchAll(PDO::FETCH_ASSOC);

echo json_encode(array(
    'columns' => $columns,
    'indexes' => $indexes,
    'item_columns' => $item_columns,
    'item_indexes' => $item_indexes,
    'summary' => $summary,
    'statuses' => $statuses,
    'daily' => $daily,
), JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
