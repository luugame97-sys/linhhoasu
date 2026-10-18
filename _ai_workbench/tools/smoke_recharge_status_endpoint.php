<?php
// Read-only smoke test for the authenticated WebGM Donate-status endpoint.
// Usage on the VPS: php smoke_recharge_status_endpoint.php account_name
$account = isset($argv[1]) ? strtolower(trim((string)$argv[1])) : '';
if (!preg_match('/^[a-z][a-z0-9_]{3,19}$/', $account)) {
    fwrite(STDERR, "Valid account name is required.\n");
    exit(2);
}

chdir('/linhhoasu/webgame/gm/api');
require_once '../config.php';
$_SESSION['logged_in'] = true;
$_SESSION['username'] = $account;
$_SESSION['server_id'] = '1001';
$_SESSION['csrf_token'] = 'local-smoke-recharge-status';
$_SERVER['REQUEST_METHOD'] = 'POST';
$_SERVER['REMOTE_ADDR'] = '127.0.0.1';
$_POST = array(
    'action' => 'get_recharge_status',
    'csrf_token' => $_SESSION['csrf_token']
);
require './user_api.php';
