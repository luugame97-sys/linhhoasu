<?php
define('LHS_API_REQUEST', true);
require '/linhhoasu/webgame/gm/config.php';
$conn_web->exec('SET TRANSACTION READ ONLY');$conn_web->beginTransaction();
try{
 $shops=$conn_web->query('SELECT id,item_id,item_name,item_amount,price,is_active FROM webshop_items ORDER BY id')->fetchAll(PDO::FETCH_ASSOC);
 $orders=$conn_web->query("SELECT item_id,server_id,status,COUNT(*) orders,SUM(quantity) qty,SUM(total_price) spent FROM webshop_orders GROUP BY item_id,server_id,status")->fetchAll(PDO::FETCH_ASSOC);
 $gift=$conn_web->query('SELECT id,is_active,reward_items FROM giftcodes')->fetchAll(PDO::FETCH_ASSOC);
 $milestones=$conn_web->query('SELECT id,is_active,reward_items FROM recharge_milestones')->fetchAll(PDO::FETCH_ASSOC);
 $conn_web->rollBack();echo 'FASHION_WEB='.json_encode(array('shops'=>$shops,'orders'=>$orders,'gift'=>$gift,'milestones'=>$milestones),JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
}catch(Throwable $e){if($conn_web->inTransaction())$conn_web->rollBack();throw $e;}
