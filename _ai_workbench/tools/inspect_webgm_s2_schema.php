<?php
declare(strict_types=1);

require_once $argv[1];
$tables = array(
    'giftcodes', 'giftcode_logs', 'giftcode_delivery_batches',
    'recharge_milestones', 'recharge_milestone_claims', 'sepay_logs', 'gm_logs',
    'webshop_items', 'webshop_orders', 'account', 'api_rate_limits'
);
$out = array();
foreach ($tables as $table) {
    $stmt = $conn_web->prepare(
        'SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA '
        . 'FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? ORDER BY ORDINAL_POSITION'
    );
    $stmt->execute(array($table));
    $out[$table] = $stmt->fetchAll(PDO::FETCH_ASSOC);
}
echo 'WEBGM_SCHEMA=' . json_encode($out, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL;
