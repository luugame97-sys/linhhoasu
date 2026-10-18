"""Refresh exact pre-cutover entitlements and current player/mail state read-only."""
import json
from snapshot_web_multiserver_20260906 import WB,connect,run
from snapshot_donate_revision_20260907 import ROOT
cut=int(json.loads((ROOT/'catalog-apply.json').read_text(encoding='utf-8'))['cutoffClaimId']);ssh=connect()
try:
 bootstrap=(WB/'tools/webshop_schema_probe_20260906.php').read_text(encoding='utf-8').split('$out=array(')[0]
 code=bootstrap+'''\n$pdo->exec("SET time_zone='+07:00'");$pdo->exec('SET SESSION TRANSACTION READ ONLY');$pdo->beginTransaction();$o=array();
$o['claims']=$pdo->query('SELECT * FROM recharge_milestone_claims WHERE id<=' . '''+str(cut)+''' . ' ORDER BY id')->fetchAll();
$o['audit']=$pdo->query("SELECT id,account_name,server_id,target_role_id,details,created_at FROM gm_logs WHERE action='recharge_milestone' ORDER BY id")->fetchAll();
$o['deliveries']=$pdo->query("SELECT * FROM web_reward_deliveries WHERE kind='recharge' ORDER BY id")->fetchAll();$pdo->rollBack();echo json_encode($o,JSON_UNESCAPED_UNICODE);'''
 sql=json.loads(run(ssh,'php',code));(ROOT/'sql-cutoff.json').write_text(json.dumps(sql,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 targets={str(s):sorted(set(c['account_name']for c in sql['claims']if int(c['server_id'])==s))for s in [1001,1002]}
 script='const targets='+json.dumps(targets)+r''';const {MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');
(async()=>{const c=new MongoClient('mongodb://127.0.0.1:27017');await c.connect();try{const out={at:new Date().toISOString(),servers:{}};for(const[s,accounts]of Object.entries(targets)){const db=c.db('lhs_s'+s);const players=await db.collection('players').find({accountId:{$in:accounts},isBot:{$ne:true}},{projection:{userId:1,playerId:1,accountId:1,name:1,serverId:1,roleInfo:1,mailClaimLedger:1,moderation:1,'items.4':1,'items.5':1,'items.65':1}}).toArray();const mails=await db.collection('mails').find({userId:{$in:players.map(p=>p.userId)}},{projection:{userId:1,title:1,content:1,eventKey:1,attachments:1,claimed:1,createdAt:1,expireAt:1}}).toArray();out.servers[s]={players,mails};}console.log(JSON.stringify(out));}finally{await c.close()}})().catch(e=>{console.error(e.name+':'+e.message);process.exitCode=1;});'''
 mongo=json.loads(run(ssh,'node -',script));(ROOT/'mongo-cutoff.json').write_text(json.dumps(mongo,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 print(json.dumps({'cutoff':cut,'claims':len(sql['claims']),'audit':len(sql['audit']),'delivery':len(sql['deliveries']),'servers':{s:{'players':len(v['players']),'mails':len(v['mails'])}for s,v in mongo['servers'].items()}}))
finally:ssh.close()
