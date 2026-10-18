<?php
require '/linhhoasu/webgame/gm/config.php';
$pdo = $conn_web;
$pdo->beginTransaction();
try {
    $s=$pdo->prepare('SELECT * FROM giftcodes WHERE id=34 AND code=? AND giftcode=? FOR UPDATE');
    $s->execute(array('SKIN2026LHS','SKIN2026LHS'));
    $gift=$s->fetch(PDO::FETCH_ASSOC);
    if (!$gift) throw new Exception('Giftcode identity mismatch');
    $s=$pdo->query("SELECT * FROM web_reward_deliveries WHERE kind='giftcode' AND source_id=34 ORDER BY id");
    $deliveries=$s->fetchAll(PDO::FETCH_ASSOC);
    $logs=$pdo->query('SELECT * FROM giftcode_logs WHERE giftcode_id=34 ORDER BY id')->fetchAll(PDO::FETCH_ASSOC);
    $legacy=$pdo->query('SELECT * FROM giftcode_delivery_batches WHERE giftcode_id=34 ORDER BY id')->fetchAll(PDO::FETCH_ASSOC);
    $backup='/linhhoasu/_ai_workbench/backups/skin2026lhs_incident_'.gmdate('Ymd_His');
    if (!mkdir($backup,0700)) throw new Exception('Backup failed');
    $before=array('at'=>gmdate('c'),'gift'=>$gift,'deliveries'=>$deliveries,'logs'=>$logs,'legacy'=>$legacy);
    $json=json_encode($before,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_PRETTY_PRINT);
    if (file_put_contents($backup.'/web_preimage.json',$json,LOCK_EX)!==strlen($json)) throw new Exception('Backup write failed');
    chmod($backup.'/web_preimage.json',0600);
    $s=$pdo->prepare('UPDATE giftcodes SET hide=0,is_active=0 WHERE id=34 AND code=? AND hide=? AND is_active=?');
    $s->execute(array('SKIN2026LHS',$gift['hide'],$gift['is_active']));
    $pdo->commit();
    $after=$pdo->query('SELECT id,code,hide,is_active,used_count FROM giftcodes WHERE id=34')->fetch(PDO::FETCH_ASSOC);
    foreach ($deliveries as &$d) {
        $snapshot=json_decode($d['reward_snapshot'],true);
        $d['total_batches']=count($snapshot['batches']);
        $d['snapshot_hash']=hash('sha256',$d['reward_snapshot']);
        unset($d['reward_snapshot'],$d['lease_token']);
    }
    unset($d);
    echo json_encode(array('backup'=>$backup,'before_public'=>(int)$gift['hide'],'after'=>$after,'logs'=>$logs,'deliveries'=>$deliveries,'legacy_count'=>count($legacy)),JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_PRETTY_PRINT);
} catch (Exception $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    throw $e;
}
