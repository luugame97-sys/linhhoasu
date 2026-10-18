<?php
// Owned CLI migration. No wallet writes, no existing milestone/claim rewrites.
if(PHP_SAPI!=='cli')exit(1);
$dir=$argv[1];$mode=$argv[2];$out=array('mode'=>$mode,'checks'=>0);
if(strpos($dir,'/linhhoasu/_ai_workbench/')!==0||!in_array($mode,array('test','preview','apply','verify'),true))throw new RuntimeException('SCOPE');
$plan=json_decode(file_get_contents($dir.'/plan.json'),true);$baseline=json_decode(file_get_contents($dir.'/catalog.json'),true)['allRows'];
function monthly_check($condition,$name){global$out;if(!$condition)throw new RuntimeException($name);$out['checks']++;}
function monthly_extract($source,$name){$tokens=token_get_all($source);$found=false;$buf='';$depth=0;$body=false;for($i=0;$i<count($tokens);$i++){if(!$found&&is_array($tokens[$i])&&$tokens[$i][0]===T_FUNCTION){$j=$i+1;while(is_array($tokens[$j])&&$tokens[$j][0]===T_WHITESPACE)$j++;if(is_array($tokens[$j])&&$tokens[$j][1]===$name)$found=true;}if($found){$t=is_array($tokens[$i])?$tokens[$i][1]:$tokens[$i];$buf.=$t;if($t==='{'){$depth++;$body=true;}elseif($t==='}'){$depth--;if($body&&$depth===0)return$buf;}}}throw new RuntimeException('PARSER_NOT_FOUND');}
function vht6ur_item_catalog(){static$c=null;if($c!==null)return$c;$c=array();foreach(file('/linhhoasu/webgame/gm/assets/item/gmitem.txt',FILE_IGNORE_NEW_LINES)as$l){$r=explode(';',$l,2);if(count($r)===2)$c[(int)$r[0]]=$r[1];}return$c;}
$config=file_get_contents('/linhhoasu/webgame/gm/config.php');
foreach(array('hk_clean_reward_id','vht6ur_item_allowed','hk_reward_exists','donate_reward_amount_limit','donate_reward_amount_valid','parse_donate_reward_items')as$f)eval(monthly_extract($config,$f));
$prev=array();foreach($baseline as$r)if($r['period_type']==='month'&&(int)$r['milestone_amount']===10000000&&(int)$r['is_active']===1)$prev=json_decode($r['reward_items'],true);
monthly_check((bool)$prev,'BASE_10M_MISSING');
monthly_check(count($plan['rows'])===5,'FIVE_THRESHOLDS_REQUIRED');
foreach($plan['rows']as$i=>&$r){
    monthly_check($r['milestone_amount']===12000000+$i*2000000&&$r['amount_required']===$r['milestone_amount'],'EVEN_THRESHOLDS');
    monthly_check($r['period_type']==='month'&&$r['is_active']===1&&strpos($r['preset_code'],'donate_month_')===0,'NEW_ROW_SCOPE');
    foreach($r['rewards']as$id=>$qty)monthly_check(is_int($qty)&&$qty>0&&donate_reward_amount_valid($id,$qty)&&hk_reward_exists((string)$id),'REWARD_VALID_'.$id);
    monthly_check(!isset($r['rewards']['5']),'NO_LEGACY_SKILL');
    foreach(array(1,2,4,6,8,15,65,72)as$id)monthly_check($r['rewards'][$id]>=$prev[$id],'REWARD_NOT_DECREASING');
    $raw=json_encode($r['rewards'],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);$parsed=parse_donate_reward_items($raw);
    monthly_check(count($parsed)===count($r['rewards'])&&count($parsed)<=20,'ACTUAL_PARSER');
    $r['reward_items']=$raw;$prev=$r['rewards'];
}unset($r);
if($mode==='test'){
    $ddl=$pdo->query('SHOW CREATE TABLE recharge_milestones')->fetch(PDO::FETCH_NUM)[1];$pdo->exec(preg_replace('/^CREATE TABLE /','CREATE TEMPORARY TABLE ',$ddl));
    $keys=array_keys($baseline[0]);$s=$pdo->prepare('INSERT INTO recharge_milestones(`'.implode('`,`',$keys).'`)VALUES('.implode(',',array_fill(0,count($keys),'?')).')');foreach($baseline as$r)$s->execute(array_values($r));
}
$pdo->beginTransaction();
try{
    $current=$pdo->query('SELECT * FROM recharge_milestones ORDER BY id FOR UPDATE')->fetchAll(PDO::FETCH_ASSOC);
    $keys=array_column($plan['rows'],'preset_code');$old=array_values(array_filter($current,function($r)use($keys){return!in_array($r['preset_code'],$keys,true);}));
    monthly_check($old===$baseline,'EXISTING_CATALOG_DRIFT');
    $existing=array_values(array_filter($current,function($r)use($keys){return in_array($r['preset_code'],$keys,true);}));
    if($mode==='verify')monthly_check(count($existing)===5,'NEW_ROWS_MISSING');
    else monthly_check(count($existing)===0,'NEW_KEYS_ALREADY_EXIST');
    $ids=array();
    if($mode==='apply'){
        monthly_check(!is_file($dir.'/before.json'),'BACKUP_ALREADY_EXISTS');
        monthly_check(file_put_contents($dir.'/before.json',json_encode(array('rows'=>$current,'at'=>gmdate('c')),JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE),LOCK_EX)!==false,'BACKUP_WRITE');chmod($dir.'/before.json',0600);
    }
    if($mode==='test'||$mode==='apply'){
        $insert=$pdo->prepare('INSERT INTO recharge_milestones(preset_code,period_type,title,milestone_amount,amount_required,reward_items,is_active,sort_order)VALUES(?,?,?,?,?,?,?,?)');
        foreach($plan['rows']as$r){$insert->execute(array($r['preset_code'],$r['period_type'],$r['title'],$r['milestone_amount'],$r['amount_required'],$r['reward_items'],$r['is_active'],$r['sort_order']));$ids[]=(int)$pdo->lastInsertId();}
        $existing=$pdo->query("SELECT * FROM recharge_milestones WHERE preset_code IN ('".implode("','",$keys)."') ORDER BY milestone_amount")->fetchAll(PDO::FETCH_ASSOC);
    }
    if($mode!=='preview'){
        usort($existing,function($a,$b){return(int)$a['milestone_amount']<=>(int)$b['milestone_amount'];});
        foreach($plan['rows']as$i=>$r){$actual=$existing[$i];monthly_check($actual['preset_code']===$r['preset_code']&&(int)$actual['milestone_amount']===$r['milestone_amount']&&$actual['reward_items']===$r['reward_items'],'INSERT_READBACK');}
        monthly_check((int)$pdo->query("SELECT COUNT(*) FROM recharge_milestones WHERE period_type='month' AND is_active=1")->fetchColumn()===25,'MONTHLY_25_THRESHOLDS');
    }
    if($mode==='apply'){$pdo->commit();$out['committed']=true;}else{$pdo->rollBack();$out['committed']=false;}
    $out['result']='PASS';$out['ids']=$ids?:array_map('intval',array_column($existing,'id'));$out['productionRowsWritten']=$mode==='apply'?5:0;$out['existingRowsChanged']=0;$out['claimRowsChanged']=0;$out['php']=PHP_VERSION;$out['mysql']=$pdo->query('SELECT VERSION()')->fetchColumn();
    echo json_encode($out,JSON_UNESCAPED_UNICODE);
}catch(Throwable$e){if($pdo->inTransaction())$pdo->rollBack();throw$e;}
