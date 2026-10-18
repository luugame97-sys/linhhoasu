<?php
declare(strict_types=1);

if ($argc < 6) exit(2);
session_id('qa-s2-' . preg_replace('/[^A-Za-z0-9]/', '', (string)$argv[5]));
session_start();
$_SESSION = array(
    'logged_in' => true,
    'username' => (string)$argv[2],
    'uin' => (string)$argv[2],
    'server_id' => '1002',
    'server_name' => 'Linh Họa Sư - S2',
    'role' => 'user',
);
$_SERVER['REMOTE_ADDR'] = '127.0.0.1';
$_POST = array('action' => (string)$argv[3]);
if ($_POST['action'] === 'submit_giftcode') $_POST['giftcode'] = (string)$argv[4];
if ($_POST['action'] === 'claim_recharge_milestone') $_POST['milestone_id'] = (string)$argv[4];
if ($_POST['action'] === 'buy_shop_item') {
    $_POST['shop_item_id'] = (string)$argv[4];
    $_POST['quantity'] = '1';
}
require (string)$argv[1];
