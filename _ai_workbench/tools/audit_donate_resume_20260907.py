"""Resume only by auditing durable receipts; never call convert/send again."""
import json,sys,hashlib
from datetime import datetime,timezone
from snapshot_web_multiserver_20260906 import WB,connect,run
from snapshot_donate_revision_20260907 import ROOT,APP
from release_huyenvu_daily_20260906 import hashes,pm2,ready

def main():
    sys.stdout.reconfigure(encoding='utf-8');ssh=connect()
    try:
        deploy=json.loads((ROOT/'service-deploy.json').read_text())
        expected=deploy['expected'];actual=hashes(ssh,list(expected))
        script='const plan='+json.dumps(json.loads((ROOT/'recovery-plan.json').read_text(encoding='utf-8')))+r''';const fs=require('fs'),crypto=require('crypto'),{MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');
(async()=>{const c=new MongoClient('mongodb://127.0.0.1:27017');await c.connect();try{const out={roles:0,skill:0,chicken:0,baozi:0,mailPresent:0,mailClaimed:0,deletedConsumed:0,mailMissingUnknown:0,backupCount:0,held:[]};
for(const t of plan.rows){const db=c.db('lhs_s'+t.serverId),p=await db.collection('players').findOne({userId:t.userId}),r=p?.moderation?.donateRevision20260907;
if(!r||r.skill!==t.skill||r.chicken!==t.chicken||r.baoziDelta!==t.baoziDelta||r.evidenceSha256!==plan.evidenceSha256||r.before-r.after!==t.skill)throw Error('RECEIPT_MISMATCH');
const mails=await db.collection('mails').find({userId:t.userId,eventKey:r.mailEventKey}).toArray();if(mails.length>1)throw Error('DUPLICATE_COMPENSATION_MAIL');
if(mails.length){const m=mails[0],map=Object.fromEntries(m.attachments.map(i=>[i.id,i.count]));if(String(m._id)!==r.mailId||map[65]!==t.chicken||Number(map[4]||0)!==t.baoziDelta)throw Error('MAIL_MISMATCH');out.mailPresent++;if(m.claimed)out.mailClaimed++;}
else if((p.mailClaimLedger||[]).includes(r.mailId))out.deletedConsumed++;else out.mailMissingUnknown++;
const file='/linhhoasu/_ai_workbench/backups/donate_conversion_20260907/'+t.serverId+'-'+crypto.createHash('sha256').update(t.userId).digest('hex')+'.json';if(!fs.existsSync(file))throw Error('BACKUP_MISSING');out.backupCount++;
out.roles++;out.skill+=r.skill;out.chicken+=r.chicken;out.baozi+=r.baoziDelta;}
for(const h of plan.held){const db=c.db('lhs_s'+h.serverId),p=await db.collection('players').findOne({userId:h.userId});out.held.push({claimId:h.claimId,serverId:h.serverId,skill:h.skill,reason:h.reason,currentSkill:p?.items?.[5]||0});}
console.log(JSON.stringify(out));}finally{await c.close()}})().catch(e=>{console.error(e.message);process.exitCode=1;});'''
        data=json.loads(run(ssh,'node -',script))
        bootstrap=(WB/'tools/webshop_schema_probe_20260906.php').read_text(encoding='utf-8').split('$out=array(')[0]
        sql=json.loads(run(ssh,'php',bootstrap+'''\n$pdo->exec('SET SESSION TRANSACTION READ ONLY');$pdo->beginTransaction();$o=array();$o['monthly']=$pdo->query("SELECT * FROM recharge_milestones WHERE period_type='month' ORDER BY milestone_amount,id")->fetchAll();$o['newPending']=$pdo->query("SELECT COUNT(*) FROM web_reward_deliveries WHERE kind='recharge' AND status='pending_delivery'")->fetchColumn();$o['allRows']=$pdo->query('SELECT * FROM recharge_milestones ORDER BY id')->fetchAll();$pdo->rollBack();echo json_encode($o,JSON_UNESCAPED_UNICODE);'''))
        (ROOT/'resume-catalog.json').write_text(json.dumps(sql,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        data.update(at=datetime.now(timezone.utc).isoformat(),sourceHashPass=actual==expected,pm2=pm2(ssh),ready=ready(ssh),pendingRewards=int(sql['newPending']),monthlyMax=max(int(r['milestone_amount'])for r in sql['monthly']if int(r['is_active'])))
        name='resume-audit-'+datetime.now(timezone.utc).strftime('%H%M%S')+'.json';(ROOT/name).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        print(json.dumps({k:v for k,v in data.items()if k!='pm2'},ensure_ascii=False))
    finally:ssh.close()
if __name__=='__main__':main()
