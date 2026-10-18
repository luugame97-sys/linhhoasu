<?php
// CLI only; credentials/connection supplied by owning-host bootstrap.
if(PHP_SAPI!=='cli')exit(1);
$mode=$argv[1];$backup=$argv[2];
if(!in_array($mode,array('preview','apply','verify'),true)||strpos($backup,'/linhhoasu/_ai_workbench/backups/donate_revision_20260907_')!==0)throw new RuntimeException('INVALID_SCOPE');
$pdo->beginTransaction();
try{
    $rows=$pdo->query('SELECT * FROM recharge_milestones ORDER BY id FOR UPDATE')->fetchAll(PDO::FETCH_ASSOC);
    $stateFile=$backup.'/catalog-before.json';
    if($mode==='apply'&&is_file($stateFile))throw new RuntimeException('CATALOG_ALREADY_CHECKPOINTED');
    if($mode==='verify'){
        $state=json_decode(file_get_contents($stateFile),true);$expect=$state['changes'];
        $current=array();foreach($rows as$r)$current[(string)$r['id']]=$r;
        foreach($expect as$r)if($current[(string)$r['id']]['reward_items']!==$r['after'])throw new RuntimeException('CATALOG_VERIFY_MISMATCH');
        $pdo->rollBack();echo json_encode(array('result'=>'PASS','changedRows'=>count($expect)));exit;
    }
    $changes=array();$skill=0;$weekly=0;
    foreach($rows as$r){
        if((int)$r['is_active']!==1||!in_array($r['period_type'],array('day','week','month'),true))continue;
        $items=json_decode($r['reward_items'],true);if(!is_array($items))throw new RuntimeException('INVALID_REWARD_JSON');
        $next=$items;$didSkill=false;$didWeek=false;
        if(isset($next['5'])){
            $qty=$next['5'];if(!is_int($qty)||$qty<=0||$qty%10!==0)throw new RuntimeException('SKILL_RATIO_NOT_INTEGER');
            $next['65']=(isset($next['65'])?(int)$next['65']:0)+intdiv($qty,10);unset($next['5']);$skill++;$didSkill=true;
        }
        if($r['period_type']==='week'&&(int)$r['milestone_amount']>=400000){
            if(!isset($next['4'])||!is_int($next['4'])||$next['4']<1||$next['4']>100000)throw new RuntimeException('WEEKLY_BAOZI_BASELINE_CHANGED');
            $next['4']*=10;$weekly++;$didWeek=true;
        }
        if(!$didSkill&&!$didWeek)continue;
        foreach($next as$id=>$qty){if(!is_int($qty)||$qty<1)throw new RuntimeException('INVALID_NEW_AMOUNT');}
        if((int)(isset($next['65'])?$next['65']:0)>999999||(int)(isset($next['4'])?$next['4']:0)>1000000)throw new RuntimeException('REWARD_CAP_EXCEEDED');
        $changes[]=array('id'=>(int)$r['id'],'period'=>$r['period_type'],'amount'=>(int)$r['milestone_amount'],'before'=>$r['reward_items'],'after'=>json_encode($next,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES),'skillChanged'=>$didSkill,'baoziChanged'=>$didWeek);
    }
    if($skill!==50||$weekly!==15)throw new RuntimeException('UNEXPECTED_CATALOG_COUNTS');
    $cutoff=(int)$pdo->query('SELECT COALESCE(MAX(id),0) FROM recharge_milestone_claims')->fetchColumn();
    $out=array('mode'=>$mode,'skillRows'=>$skill,'weeklyRows'=>$weekly,'changedRows'=>count($changes),'cutoffClaimId'=>$cutoff,'changes'=>$changes,'at'=>date('c'));
    if($mode==='apply'){
        if(!is_dir($backup))throw new RuntimeException('BACKUP_DIR_MISSING');
        file_put_contents($stateFile,json_encode(array('rows'=>$rows,'changes'=>$changes,'cutoffClaimId'=>$cutoff,'at'=>date('c')),JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT),LOCK_EX);chmod($stateFile,0600);
        $update=$pdo->prepare('UPDATE recharge_milestones SET reward_items=? WHERE id=? AND reward_items=?');
        foreach($changes as$c){$update->execute(array($c['after'],$c['id'],$c['before']));if($update->rowCount()!==1)throw new RuntimeException('CATALOG_DRIFT');}
        $pdo->commit();$out['committed']=true;
    }else{$pdo->rollBack();$out['committed']=false;}
    echo json_encode($out,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
}catch(Throwable$e){if($pdo->inTransaction())$pdo->rollBack();throw$e;}
