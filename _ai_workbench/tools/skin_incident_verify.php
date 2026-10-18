<?php
require '/linhhoasu/webgame/gm/config.php';
$g=$conn_web->query('SELECT id,code,hide,is_active,used_count FROM giftcodes WHERE id=34')->fetch(PDO::FETCH_ASSOC);
$d=$conn_web->query("SELECT id,account_name,server_id,role_id,status,delivered_batches FROM web_reward_deliveries WHERE kind='giftcode' AND source_id=34 ORDER BY id")->fetchAll(PDO::FETCH_ASSOC);
$l=$conn_web->query('SELECT account_name,server_id,claimed_at FROM giftcode_logs WHERE giftcode_id=34')->fetchAll(PDO::FETCH_ASSOC);
$shown=$conn_web->query('SELECT COUNT(*) FROM giftcodes WHERE id=34 AND hide=1 AND is_active=1')->fetchColumn();
echo json_encode(array('at'=>gmdate('c'),'gift'=>$g,'publicListingMatches'=>(int)$shown,'deliveries'=>$d,'logs'=>$l),JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT);
