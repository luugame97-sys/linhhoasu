<?php
require_once '/linhhoasu/webgame/gm/config.php';

$ids = array(1101,21109,22001,22003,22014,23001,23003,24107,11200,11210,11405,11505,12002,13001,28042,28043,28049,28052,28053,28059);
$marks = implode(',', array_fill(0, count($ids), '?'));
$stmt = $conn_web->prepare("SELECT id, account_name, server_id, role_id, shop_item_id, item_id, quantity, unit_price, total_price, created_at FROM webshop_orders WHERE item_id IN ($marks) ORDER BY id ASC");
$stmt->execute($ids);
$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
$target = '/linhhoasu/_ai_workbench/temp/webshop_fashion_orders.json';
if (!is_dir(dirname($target))) mkdir(dirname($target), 0700, true);
file_put_contents($target, json_encode($rows, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), LOCK_EX);
chmod($target, 0600);
echo json_encode(array('orders'=>count($rows), 'target'=>$target), JSON_UNESCAPED_UNICODE), PHP_EOL;
