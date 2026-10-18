<?php
require $argv[1];
$base=array('hide'=>1,'is_active'=>1,'claimed'=>0,'own_delivery'=>0,'own_legacy'=>0,'expire_at'=>null,'expires_at'=>null,'max_uses'=>0,'used_count'=>100,'reserved'=>0,'legacy_reserved'=>0);
$cases=array(array(array(),true),array(array('hide'=>0),false),array(array('is_active'=>0),false),array(array('claimed'=>1),false),array(array('own_delivery'=>1),false),array(array('own_legacy'=>1),false),array(array('max_uses'=>101,'reserved'=>1),false),array(array('max_uses'=>102,'reserved'=>1),true),array(array('expire_at'=>'2020-01-01'),false),array(array('expire_at'=>'2040-01-01','expires_at'=>'2020-01-01'),true));
foreach($cases as $case) if(lhs_public_giftcode_row_available(array_merge($base,$case[0]),strtotime('2026-09-30'))!==$case[1])throw new Exception('FAILED');
echo 'GIFT_NOTICE_10_PASS';
