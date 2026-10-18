<?php
declare(strict_types=1);

if (session_status() === PHP_SESSION_NONE) session_start();
require_once $argv[1];

$tables = array(
    'auth_codes', 'giftcode_logs', 'daily_checkins', 'sepay_logs',
    'recharge_milestone_claims', 'webshop_orders', 'gm_logs'
);
$tableColumns = array();
foreach ($tables as $table) {
    $stmt = $conn_web->prepare(
        'SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION'
    );
    $stmt->execute(array($table));
    $tableColumns[$table] = $stmt->fetchAll(PDO::FETCH_COLUMN);
}

$features = array();
foreach (array('webshop_enabled', 'recharge_rewards_enabled', 'giftcode_enabled', 'daily_checkin_enabled') as $key) {
    $features[$key] = web_setting_enabled($key);
}

$servers = array();
foreach ($quarr as $key => $server) {
    $servers[(string)$key] = array(
        'game_id' => (int)$server['game_id'],
        'name' => (string)$server['name'],
        'api_base' => lhs_api_base((string)$key),
    );
}

$serverScoped = array();
foreach ($tableColumns as $table => $columns) {
    $serverScoped[$table] = $table === 'auth_codes'
        ? in_array('used_server_id', $columns, true)
        : in_array('server_id', $columns, true);
}

$missingRoles = array();
foreach (array_keys($servers) as $serverKey) {
    $missingRoles[$serverKey] = count(lhs_roles_for_account('qa_missing_account', (string)$serverKey));
}

echo 'WEBGM_S2_AUDIT=' . json_encode(array(
    'servers' => $servers,
    'features' => $features,
    'server_scoped' => $serverScoped,
    'missing_role_counts' => $missingRoles,
), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL;
