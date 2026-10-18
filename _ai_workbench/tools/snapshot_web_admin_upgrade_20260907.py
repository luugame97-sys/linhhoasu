"""Fresh WebGM snapshot and SELECT-only rewards/configuration inventory."""
import json
from pathlib import Path
import snapshot_web_multiserver_20260906 as snapshot

snapshot.OUT=snapshot.WB/'temp/web_admin_upgrade_20260907'
snapshot.FILES += ['daily_checkin.php','reward_delivery.php','web_context.php','assets/js/web-context.js','assets/js/webshop-admin.js','assets/js/webshop-buyer.js','assets/css/admin.css','assets/css/style.css','assets/css/login.css','assets/item/gmitem.txt']
if __name__=='__main__':
    snapshot.main()
    ssh=snapshot.connect()
    try:
        bootstrap=(snapshot.WB/'tools/webshop_schema_probe_20260906.php').read_text(encoding='utf-8').split('$out=array(')[0]
        code=bootstrap+'''\n$pdo->exec("SET time_zone='+07:00'");$pdo->exec('SET SESSION TRANSACTION READ ONLY');$pdo->beginTransaction();$o=array();
foreach(array('giftcodes','recharge_milestones','web_account_bans','sepay_logs','system_event_logs','gm_logs')as$t){$o['schema'][$t]=$pdo->query('SHOW CREATE TABLE `'.$t.'`')->fetch(PDO::FETCH_NUM)[1];}
$o['milestones']=$pdo->query('SELECT id,period_type,title,milestone_amount,reward_items,is_active,sort_order FROM recharge_milestones ORDER BY period_type,milestone_amount,id')->fetchAll();
$o['claims']=$pdo->query('SELECT c.milestone_id,m.period_type,m.milestone_amount,c.server_id,COUNT(*) n FROM recharge_milestone_claims c JOIN recharge_milestones m ON m.id=c.milestone_id GROUP BY c.milestone_id,m.period_type,m.milestone_amount,c.server_id')->fetchAll();
$o['giftTimeCoverage']=$pdo->query('SELECT COUNT(*) total,SUM(expires_at IS NULL AND expire_at IS NULL) no_expiry FROM giftcodes')->fetch();
$pdo->rollBack();echo json_encode($o,JSON_UNESCAPED_UNICODE);'''
        result=json.loads(snapshot.run(ssh,'php',code))
        (snapshot.OUT/'management_inventory.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        print(json.dumps({'milestoneRows':len(result['milestones']),'claimGroups':len(result['claims']),'giftTimeCoverage':result['giftTimeCoverage']}))
    finally:ssh.close()
