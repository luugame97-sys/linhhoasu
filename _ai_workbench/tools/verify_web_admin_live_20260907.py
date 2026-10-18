"""Read-only current admin helper/identity contract check; no login or GM send."""
import json,sys
from snapshot_web_multiserver_20260906 import WB,connect,run
ROOT=WB/'temp/web_admin_upgrade_20260907'
sys.stdout.reconfigure(encoding='utf-8');ssh=connect()
try:
    state=json.loads((ROOT/'release.json').read_text())
    code='''<?php
$_SERVER['REQUEST_METHOD']='GET';session_save_path('''+json.dumps(state['backup'])+''');session_id('qaverifyadmin'.bin2hex(random_bytes(8)));session_start();
require '/linhhoasu/webgame/gm/config.php';require '/linhhoasu/webgame/gm/admin_management.php';require '/linhhoasu/webgame/gm/web_experience.php';
$conn_web->exec('SET SESSION TRANSACTION READ ONLY');$conn_web->beginTransaction();$out=array('readOnly'=>true,'servers'=>array());
foreach(array('1001','1002')as$server){$out['servers'][$server]=array();foreach(array('all','locked','vip','nonvip')as$filter){$r=lhs_admin_users($conn_web,$server,array('account_filter'=>$filter));$out['servers'][$server][$filter]=array('total'=>$r['total'],'pageRows'=>count($r['data']));}}
$account=$conn_web->query('SELECT a.account FROM account a JOIN sepay_logs s ON s.account_name=a.account ORDER BY s.id DESC LIMIT 1')->fetchColumn();
$out['identity']=array();if($account){foreach(array('1001','1002')as$server){$roles=lhs_admin_resolve_roles($account,$server);$out['identity'][$server]=array('accountRoles'=>count($roles));if($roles){$uid=lhs_admin_resolve_roles($roles[0]['role_id'],$server);$name=lhs_admin_resolve_roles($roles[0]['role_name'],$server);$out['identity'][$server]['uidResolves']=count($uid)>0;$out['identity'][$server]['nameResolves']=count($name)>0;}}}
$range=array('start'=>'','end'=>'');$r=lhs_admin_sepay_summary($conn_web,'','',$range);$sum=$conn_web->query("SELECT COALESCE(SUM(amount),0) FROM sepay_logs WHERE action IN ('topup_xu','vip')")->fetchColumn();$out['financeAggregateMatches']=(string)$sum===(string)$r['lifetime']['total'];
$out['resetTimes']=lhs_web_reset_times();$conn_web->rollBack();session_destroy();echo json_encode($out,JSON_UNESCAPED_UNICODE);
'''
    result=json.loads(run(ssh,'php',code));(ROOT/'live_contract.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps(result,ensure_ascii=False))
finally:ssh.close()
