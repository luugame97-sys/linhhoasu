<?php
$period = isset($argv[1]) ? (string)$argv[1] : 'today';
$status = isset($argv[2]) ? (string)$argv[2] : 'all';
$date_from = isset($argv[3]) ? (string)$argv[3] : '';
$date_to = isset($argv[4]) ? (string)$argv[4] : '';

chdir('/linhhoasu/webgame/gm/api');
define('LHS_API_REQUEST', true);
require '../config.php';

$fixture = $conn_web->query("SELECT account_name,server_id,COUNT(*) AS order_count FROM webshop_orders GROUP BY account_name,server_id ORDER BY order_count DESC LIMIT 1")->fetch(PDO::FETCH_ASSOC);
if (!$fixture) throw new RuntimeException('FIXTURE_NOT_FOUND');

$_SESSION['logged_in'] = true;
$_SESSION['username'] = (string)$fixture['account_name'];
$_SESSION['server_id'] = (string)$fixture['server_id'];
$_SESSION['role'] = 'user';
$_SESSION['csrf_token'] = bin2hex(random_bytes(32));
$_SERVER['REQUEST_METHOD'] = 'POST';
$_POST = array(
    'action' => 'get_my_webshop_spend_history',
    'csrf_token' => $_SESSION['csrf_token'],
    'page' => 1,
    'period' => $period,
    'status_filter' => $status,
    'date_from' => $date_from,
    'date_to' => $date_to
);

$candidate = file_get_contents('/linhhoasu/_ai_workbench/temp/webgm_spend_history_lint/api/user_api.php');
if (!is_string($candidate) || $candidate === '') throw new RuntimeException('CANDIDATE_NOT_FOUND');
$candidate = preg_replace('/^<\?php\s*/', '', $candidate, 1);
$candidate = preg_replace("/define\('LHS_API_REQUEST', true\);\s*/", '', $candidate, 1);
$candidate = preg_replace("/require_once '\.\.\/config\.php';\s*/", '', $candidate, 1);
$candidate = preg_replace("/header\('Content-Type: application\/json; charset=utf-8'\);\s*/", '', $candidate, 1);
eval($candidate);
