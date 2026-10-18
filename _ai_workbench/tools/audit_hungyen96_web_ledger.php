<?php
// Read only. Does not call claim/buy/send/login actions.
define('LHS_API_REQUEST', true);
require '/linhhoasu/webgame/gm/config.php';
$conn_web->exec('SET TRANSACTION READ ONLY');
$conn_web->beginTransaction();
try {
    $out=array();
    $tables=array(
        'account'=>array('account','ptb','vip_level','status','created_at'),
        'webshop_orders'=>array('id','account_name','server_id','role_id','shop_item_id','item_id','quantity','unit_price','total_price','status','refund_amount','refunded','created_at','updated_at'),
        'giftcode_logs'=>array('id','account_name','server_id','giftcode_id','created_at'),
        'giftcode_delivery_batches'=>array('id','account_name','server_id','giftcode_id','batch_no','items_json','status','attempts','last_error','created_at','updated_at'),
        'recharge_milestone_claims'=>array('id','account_name','server_id','milestone_id','claim_period','created_at'),
        'sepay_logs'=>array('id','account_name','server_id','amount','action','created_at'),
        'system_event_logs'=>array('id','account_name','server_id','level','status','action','message','created_at')
    );
    foreach($tables as $name=>$wanted) {
        $cols=$conn_web->query('SHOW COLUMNS FROM `'.$name.'`')->fetchAll(PDO::FETCH_COLUMN);
        $select=array_values(array_intersect($wanted,$cols));
        $key=$name==='account'?'account':'account_name';
        if(!in_array($key,$cols,true)) {$out[$name]=array('columns'=>$cols);continue;}
        $query='SELECT `'.implode('`,`',$select).'` FROM `'.$name.'` WHERE `'.$key.'` = ?';
        if(in_array('id',$cols,true))$query.=' ORDER BY id DESC';
        $q=$conn_web->prepare($query.' LIMIT 300');$q->execute(array('hungyen96'));
        $out[$name]=$q->fetchAll(PDO::FETCH_ASSOC);
    }
    $out['servers']=array();
    foreach($quarr as $id=>$value)$out['servers'][]=array('key'=>$id,'game_id'=>$value['game_id'],'name'=>$value['name'],'api'=>lhs_api_base((string)$id));
    $conn_web->rollBack();
    echo 'HUNGYEN_WEB='.json_encode($out,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES).PHP_EOL;
} catch(Throwable $e) {if($conn_web->inTransaction())$conn_web->rollBack();throw $e;}
