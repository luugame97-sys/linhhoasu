<?php
require '/linhhoasu/webgame/gm/config.php';
$q = $conn_web->prepare('SELECT * FROM webshop_orders WHERE item_id=? ORDER BY id');
$q->execute(array(50));
$orders = $q->fetchAll(PDO::FETCH_ASSOC);
$logs = array();
try {
    $q = $conn_web->prepare("SELECT * FROM gm_logs WHERE target_role_id=? OR details LIKE ? ORDER BY id");
    $q->execute(array('u_Wk_1001_7a948e_1788008560635', '%50%'));
    $logs = $q->fetchAll(PDO::FETCH_ASSOC);
} catch (Exception $e) { $logs = array('error' => $e->getMessage()); }
echo json_encode(array('orders'=>$orders,'logs'=>$logs), JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES), PHP_EOL;
