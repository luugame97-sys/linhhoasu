"""Reconcile organically received new WebGM rewards against Mongo mail, read-only."""
import hashlib
import json
import shlex
from datetime import datetime,timezone
from snapshot_web_multiserver_20260906 import OUT,WB,connect,run

ssh=connect()
try:
    script=(WB/'tools/webshop_schema_probe_20260906.php').read_text(encoding='utf-8').split('$out=array(')[0]
    script+='''\n$pdo->exec('SET SESSION TRANSACTION READ ONLY');$pdo->beginTransaction();
$rows=$pdo->query("SELECT id,kind,account_name,server_id,role_id,source_id,claim_period,reward_snapshot,delivered_batches FROM web_reward_deliveries WHERE status='sent' ORDER BY id LIMIT 100")->fetchAll();
$pdo->rollBack();echo json_encode($rows);'''
    rows=json.loads(run(ssh,'php',script));entries=[]
    for row in rows:
        if row['server_id'] not in ['1001','1002']:raise RuntimeError('UNKNOWN_SERVER')
        snapshot=json.loads(row['reward_snapshot'])
        for batch_number,items in enumerate(snapshot['batches'],1):
            suffix=str(batch_number) if row['kind']=='giftcode' else row['claim_period']
            value='|'.join([row['account_name'],row['server_id'],str(row['source_id']),suffix])
            key=('webgm_gift_' if row['kind']=='giftcode' else 'webgm_recharge_')+hashlib.sha256(value.encode()).hexdigest()
            expression='JSON.stringify(db.mails.find('+json.dumps({'userId':row['role_id'],'eventKey':key})+',{_id:0,attachments:1,claimed:1,targetServerId:1}).toArray())'
            mails=json.loads(run(ssh,'mongosh --quiet mongodb://127.0.0.1:27017/lhs_s'+row['server_id']+' --eval '+shlex.quote(expression)))
            # No user ids, titles, account names or reward payloads in output.
            entries.append({'deliveryId':int(row['id']),'kind':row['kind'],'serverId':row['server_id'],'batch':batch_number,'mailCount':len(mails),'claimed':bool(mails and mails[0].get('claimed')),'attachmentCount':len(mails[0].get('attachments',[])) if mails else 0,'expectedAttachmentCount':len(items)})
    result={'readOnly':True,'at':datetime.now(timezone.utc).isoformat(),'outboxRows':len(rows),'batches':len(entries),'onePersistedMailPerBatch':all(e['mailCount']==1 for e in entries),'entries':entries,'initiatedRewards':0}
    (OUT/'live_mail_reconciliation.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:v for k,v in result.items() if k!='entries'}))
finally:ssh.close()
