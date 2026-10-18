"""Final read-only source/process/receipt/mail verification."""
import hashlib,json,shlex,sys
from datetime import datetime,timezone
from snapshot_web_multiserver_20260906 import WB,connect,run
from snapshot_donate_revision_20260907 import ROOT,APP
from release_huyenvu_daily_20260906 import hashes,pm2,ready
sys.stdout.reconfigure(encoding='utf-8');ssh=connect()
try:
 state=json.loads((ROOT/'service-deploy.json').read_text());assert hashes(ssh,list(state['expected']))==state['expected'];current=pm2(ssh);assert current==state['afterPm2'];health=ready(ssh);assert health=={'8080':200,'8083':200}
 script='const plan='+json.dumps(json.loads((ROOT/'recovery-plan.json').read_text(encoding='utf-8')))+r''';const fs=require('fs'),crypto=require('crypto'),{MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');
(async()=>{const client=new MongoClient('mongodb://127.0.0.1:27017');await client.connect();try{const out={roles:0,skill:0,chicken:0,baozi:0,mails:0,claimedMails:0,backups:0,missing:[],skillBalances:[],backupHashes:[]};
for(const t of plan.rows){const db=client.db('lhs_s'+t.serverId),p=await db.collection('players').findOne({userId:t.userId});const r=p?.moderation?.donateRevision20260907;if(!r||r.skill!==t.skill||r.chicken!==t.chicken||r.baoziDelta!==t.baoziDelta||r.before-r.after!==t.skill||r.evidenceSha256!==plan.evidenceSha256)throw Error('RECEIPT');
const mails=await db.collection('mails').find({userId:t.userId,eventKey:r.mailEventKey}).toArray();if(mails.length!==1||String(mails[0]._id)!==r.mailId)throw Error('MAIL_COUNT');const m=mails[0],map=Object.fromEntries(m.attachments.map(i=>[i.id,i.count]));if(map[65]!==t.chicken||Number(map[4]||0)!==t.baoziDelta)throw Error('MAIL_REWARDS');
out.roles++;out.skill+=r.skill;out.chicken+=map[65];out.baozi+=map[4]||0;out.mails++;out.claimedMails+=m.claimed?1:0;out.skillBalances.push({server:t.serverId,balance:p.items?.[5]||0});
const file='/linhhoasu/_ai_workbench/backups/donate_conversion_20260907/'+t.serverId+'-'+crypto.createHash('sha256').update(t.userId).digest('hex')+'.json';if(!fs.existsSync(file))throw Error('NO_BACKUP');out.backups++;out.backupHashes.push(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'));}
const dbs=await client.db('admin').admin().listDatabases();out.qaDatabases=dbs.databases.filter(d=>/^qa_donate_revision_/.test(d.name)).map(d=>d.name);console.log(JSON.stringify(out));}finally{await client.close()}})().catch(e=>{console.error(e.message);process.exitCode=1;});'''
 result=json.loads(run(ssh,'node -',script));result.update({'at':datetime.now(timezone.utc).isoformat(),'sourceHashPass':True,'pm2UnchangedAfterRelease':True,'ready':health,'processes':current})
 (ROOT/'final-verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 print(json.dumps({k:v for k,v in result.items()if k not in ['backupHashes','skillBalances','processes']},ensure_ascii=False))
finally:ssh.close()
