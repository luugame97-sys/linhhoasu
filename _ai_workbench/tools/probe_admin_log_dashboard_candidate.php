<?php
$action_name = isset($argv[1]) ? (string)$argv[1] : 'get_monitor_logs';
$period = isset($argv[2]) ? (string)$argv[2] : 'today';
$source = isset($argv[3]) ? (string)$argv[3] : '';
$status = isset($argv[4]) ? (string)$argv[4] : '';
$level = isset($argv[5]) ? (string)$argv[5] : '';
$date_from = isset($argv[6]) ? (string)$argv[6] : '';
$date_to = isset($argv[7]) ? (string)$argv[7] : '';

chdir('/linhhoasu/webgame/gm/admin');
define('LHS_API_REQUEST', true);
require '../config.php';
$_SESSION['logged_in'] = true;
$_SESSION['role'] = 'admin';
$_SESSION['username'] = (string)$conn_web->query('SELECT account_name FROM web_admins ORDER BY account_name LIMIT 1')->fetchColumn();
$_SESSION['server_id'] = '1001';
$_SESSION['csrf_token'] = bin2hex(random_bytes(32));
$_SERVER['REQUEST_METHOD'] = 'POST';
$_POST = array(
    'action' => $action_name,
    'csrf_token' => $_SESSION['csrf_token'],
    'page' => 1,
    'period' => $period,
    'source_filter' => $source,
    'status_filter' => $status,
    'level_filter' => $level,
    'date_from' => $date_from,
    'date_to' => $date_to,
    'search' => '',
    'action_filter' => ''
);

$candidate_path = getenv('ADMIN_LOG_CANDIDATE_PATH');
if (!$candidate_path) $candidate_path = '/linhhoasu/_ai_workbench/temp/admin_log_dashboard_lint/admin/admin_api.php';
$candidate = file_get_contents($candidate_path);
if (!is_string($candidate) || $candidate === '') throw new RuntimeException('CANDIDATE_NOT_FOUND');
$candidate = preg_replace('/^<\?php\s*/', '', $candidate, 1);
$candidate = preg_replace("/require_once '\.\.\/config\.php';\s*/", '', $candidate, 1);
$candidate = preg_replace("/header\('Content-Type: application\/json; charset=utf-8'\);\s*/", '', $candidate, 1);
eval($candidate);
