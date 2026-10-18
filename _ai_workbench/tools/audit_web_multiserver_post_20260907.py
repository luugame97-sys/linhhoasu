"""Fresh post-release counts without account names, credentials or money writes."""
import json
from datetime import datetime, timezone, timedelta
from snapshot_web_multiserver_20260906 import OUT, WB, connect, run

ssh=connect()
try:
    state=json.loads((OUT/'release.json').read_text())
    cutoff=datetime.fromisoformat(state['openedAt']).astimezone(timezone(timedelta(hours=7))).strftime('%Y-%m-%d %H:%M:%S')
    script=(WB/'tools/webshop_schema_probe_20260906.php').read_text(encoding='utf-8').split('$out=array(')[0]
    script+='\n$cut='+json.dumps(cutoff)+''';$pdo->exec("SET time_zone='+07:00'");$pdo->exec('SET SESSION TRANSACTION READ ONLY');$pdo->beginTransaction();$o=array();
$o['dailyRows']=$pdo->query('SELECT COUNT(*) FROM daily_checkins')->fetchColumn();
$o['canonicalRows']=$pdo->query('SELECT COUNT(*) FROM daily_checkin_account_claims')->fetchColumn();
$o['canonicalMissing']=$pdo->query('SELECT COUNT(*) FROM daily_checkins d LEFT JOIN daily_checkin_account_claims c ON c.account_name=d.account_name AND c.claim_date=d.claim_date WHERE c.account_name IS NULL')->fetchColumn();
$o['duplicateAccountDays']=$pdo->query('SELECT COUNT(*) FROM (SELECT account_name,claim_date FROM daily_checkins GROUP BY account_name,claim_date HAVING COUNT(*)>1) d')->fetchColumn();
$q=$pdo->prepare('SELECT COUNT(*) FROM daily_checkins WHERE created_at>=?');$q->execute(array($cut));$o['dailySinceOpen']=$q->fetchColumn();
$q=$pdo->prepare('SELECT COUNT(*) FROM giftcode_delivery_batches WHERE created_at>=?');$q->execute(array($cut));$o['legacyGiftBatchesSinceOpen']=$q->fetchColumn();
$q=$pdo->prepare('SELECT kind,status,COUNT(*) n FROM web_reward_deliveries WHERE created_at>=? GROUP BY kind,status');$q->execute(array($cut));$o['newDeliveriesSinceOpen']=$q->fetchAll();
$q=$pdo->prepare("SELECT action,COUNT(*) n FROM system_event_logs WHERE created_at>=? AND source='user_api' AND status='failed' GROUP BY action");$q->execute(array($cut));$o['userApiErrorsSinceOpen']=$q->fetchAll();
$q=$pdo->prepare("SELECT status,COUNT(*) n FROM system_event_logs WHERE created_at>=? AND source='sepay_webhook' GROUP BY status");$q->execute(array($cut));$o['paymentEventsSinceOpen']=$q->fetchAll();
$pdo->rollBack();echo json_encode($o);'''
    result=json.loads(run(ssh,'php',script));result['at']=datetime.now(timezone.utc).isoformat();result['cutoffGMT7']=cutoff
    (OUT/'post_release_counts.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(result))
finally:ssh.close()
