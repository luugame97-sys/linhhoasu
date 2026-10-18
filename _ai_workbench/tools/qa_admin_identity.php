<?php
// Private CLI-only probe; never place this file in the public document root.
if (PHP_SAPI !== 'cli') exit(1);
$root = $argv[1];
$mode = $argv[2];
$input = json_decode(stream_get_contents(STDIN), true) ?: array();
session_save_path(__DIR__ . '/sessions');
require $root . '/config.php';
register_shutdown_function(function () { if (session_status() === PHP_SESSION_ACTIVE) { $_SESSION=array(); session_destroy(); } });
if ($mode === 'migrate') {
    $q=$conn_web->query("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='login_attempts' AND COLUMN_NAME='server_id'");
    $added = !(int)$q->fetchColumn();
    if ($added) $conn_web->exec("ALTER TABLE login_attempts ADD COLUMN server_id VARCHAR(32) NOT NULL DEFAULT ''");
    echo json_encode(array('added'=>$added)); exit;
}
if ($mode === 'identity') {
    $source=file_get_contents($root . '/admin/admin_api.php');
    $start=strpos($source,'function admin_server_view(');
    $end=strpos($source,'function admin_game_ban_call(', $start);
    if ($start===false || $end===false) throw new RuntimeException('HELPER_BOUNDARY');
    eval(substr($source,$start,$end-$start));
    $cache=array(); $checks=0;
    foreach ($input['roles'] as $r) {
        $row=admin_enrich_player_identity(array('server_id'=>(string)$r['serverId'],'role_id'=>$r['userId'],'account_name'=>'operator_not_player','source'=>'gm'),$cache);
        if ($row['role_name']!==$r['name'] || $row['player_account']!==$r['accountId'] || $row['identity_verified']!==1) throw new RuntimeException('EXACT_UID_IDENTITY_FAILED');
        $wrong=admin_enrich_player_identity(array('server_id'=>(string)($r['serverId']==1001?1002:1001),'role_id'=>$r['userId'],'source'=>'gm'),$cache);
        if ($wrong['identity_verified']!==0) throw new RuntimeException('CROSS_SERVER_IDENTITY');
        $checks+=2;
    }
    $unknown=admin_enrich_player_identity(array('account_name'=>$input['account'],'source'=>'login'),$cache);
    if ($unknown['identity_verified']!==0) throw new RuntimeException('GUESSED_LEGACY_SERVER');
    $actor=admin_enrich_player_identity(array('server_id'=>'1001','account_name'=>$input['account'],'source'=>'gm'),$cache);
    if ($actor['identity_verified']!==0) throw new RuntimeException('ACTOR_MISIDENTIFIED_AS_TARGET');
    echo json_encode(array('result'=>'PASS','checks'=>$checks+2)); exit;
}
$_SESSION['logged_in']=true;
$_SESSION['role']='admin';
$_SESSION['username']=$conn_web->query('SELECT account_name FROM web_admins LIMIT 1')->fetchColumn();
$_SESSION['server_id']='1001';
$_SESSION['server_name']=gm_get_server('1001')['name'];
$_SERVER['REQUEST_METHOD']='POST';
$_POST=$input;
$_POST['csrf_token']=csrf_token();
if ($mode==='unauthorized') $_SESSION['role']='user';
if ($mode==='bad_csrf') $_POST['csrf_token']='invalid';
chdir($root . '/admin');
require 'admin_api.php';
