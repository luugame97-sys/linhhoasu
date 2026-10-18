<?php
$root = dirname(__DIR__) . '/temp/web_multiserver_20260906/candidate';
$source = file_get_contents($root . '/api/sepay_webhook.php');
// Parse only the pure guards from the actual deploy input, never bootstrap a webhook.
$tokens=token_get_all($source);
foreach (array('webhook_transfer_amount','webhook_transfer_direction_allowed','webhook_legacy_transfer_id','webhook_transfer_identity','webhook_transfer_id') as $name) {
    $start=false;$code='';$depth=0;$body=false;
    for($i=0;$i<count($tokens);$i++) {
        $token=$tokens[$i];
        if(!$start && is_array($token) && $token[0]===T_FUNCTION) {
            $j=$i+1;while(is_array($tokens[$j])&&$tokens[$j][0]===T_WHITESPACE)$j++;
            if(is_array($tokens[$j])&&$tokens[$j][1]===$name)$start=true;
        }
        if($start) {
            $part=is_array($token)?$token[1]:$token;$code.=$part;
            if($part==='{'){$depth++;$body=true;}elseif($part==='}'){$depth--;if($body&&$depth===0)break;}
        }
    }
    if(!$code)throw new RuntimeException('Missing guard '.$name);
    eval($code);
}
$checks=0;
function verify($ok,$label){global$checks;if(!$ok)throw new RuntimeException($label);$checks++;}
foreach(array(5001,'5001',5001.0)as$value)verify(webhook_transfer_amount(array('transferAmount'=>$value))===5001,'valid integer amount');
foreach(array(-1,0,'-5','1e5','5.1',5.1,array(),null,true,'5xu','99999999999999999999')as$value)verify(webhook_transfer_amount(array('amount'=>$value))===0,'invalid amount rejected');
verify(webhook_transfer_direction_allowed(array('transferType'=>'in')),'incoming accepted');
foreach(array('out','other','',null,array())as$value)verify(!webhook_transfer_direction_allowed(array('transferType'=>$value)),'outgoing/invalid not credited');
verify(webhook_transfer_direction_allowed(array()),'legacy signed relay without optional direction unchanged');
$old='SEPAY-ABC123';verify(webhook_transfer_id(array('referenceCode'=>'ABC123','id'=>456))===$old,'existing reference id priority preserved');
verify(strpos($source,"webhook_json(false, 'Không thể ghi nhận Donate Xu lúc này.', array(), 500)")!==false,'topup DB failure retriable 500');
verify(strpos($source,"webhook_json(false, 'Không thể kích VIP lúc này.', array(), 500)")!==false,'VIP DB failure retriable 500');
verify(strpos($source,"if (\$wallet_update->rowCount() !== 1)")!==false,'missing wallet cannot consume transfer');
echo json_encode(array('result'=>'PASS','checks'=>$checks,'source_sha256'=>hash('sha256',$source),'livePayment'=>false),JSON_UNESCAPED_UNICODE);
