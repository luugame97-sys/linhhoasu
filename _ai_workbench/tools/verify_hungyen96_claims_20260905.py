"""Fresh compact Mongo/SQL correlation for delivered and claimed rewards."""
import json,sys
from pathlib import Path
import paramiko
from recheck_items_readonly_20260905 import execute
WB=Path(__file__).resolve().parents[1];OUT=WB/'temp/hungyen96_s2_20260905';sys.stdout.reconfigure(encoding='utf-8')
c=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(c[0].strip(),username='root',password=c[2],look_for_keys=False,allow_agent=False,timeout=20)
web=json.loads((OUT/'web_ledger.json').read_text(encoding='utf-8'))
source=r"""
const {MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb'),crypto=require('crypto');
const c=new MongoClient('mongodb://127.0.0.1:27017');const web=WEB_DATA;
(async()=>{await c.connect();const db=c.db('lhs_s1002');const p=await db.collection('players').findOne({accountId:'hungyen96',isBot:{$ne:true}});if(!p)throw Error('PLAYER_MISSING');const mails=await db.collection('mails').find({userId:p.userId}).sort({createdAt:1}).toArray();const ledger=new Set(p.mailClaimLedger||[]);
function sum(items,id){return (items||[]).filter(x=>Number(x.id)===id).reduce((s,r)=>s+Number(r.count||0),0);}
const groups={};for(const m of mails){const kind=String(m.eventKey||'').startsWith('webgm_gift_')?'giftcode':String(m.eventKey||'').startsWith('webgm_recharge_')?'milestone':String(m.content||'').includes('WebShop')?'webshop':'other';const g=groups[kind]||(groups[kind]={count:0,claimed:0,read:0,inPlayerLedger:0,expired:0});g.count++;g.claimed+=m.claimed===true?1:0;g.read+=m.read===true?1:0;g.inPlayerLedger+=ledger.has(String(m._id))?1:0;g.expired+=new Date(m.expireAt).getTime()<Date.now()?1:0;}
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');const correlations={giftcode:[],milestone:[]};
for(const r of web.giftcode_delivery_batches){const key='webgm_gift_'+hash('hungyen96|'+r.server_id+'|'+r.giftcode_id+'|'+r.batch_no);const mail=mails.find(m=>m.eventKey===key);correlations.giftcode.push({batchId:r.id,giftcodeId:r.giftcode_id,status:r.status,mailFound:!!mail,claimed:mail?.claimed,ledger:!!mail&&ledger.has(String(mail._id))});}
for(const r of web.recharge_milestone_claims){const key='webgm_recharge_'+hash('hungyen96|'+r.server_id+'|'+r.milestone_id+'|'+r.claim_period);const mail=mails.find(m=>m.eventKey===key);correlations.milestone.push({claimId:r.id,milestoneId:r.milestone_id,mailFound:!!mail,claimed:mail?.claimed,ledger:!!mail&&ledger.has(String(mail._id))});}
const purchased=mails.filter(m=>sum(m.attachments,1001)>0).map(m=>({id:String(m._id),createdAt:m.createdAt,updatedAt:m.updatedAt,count:sum(m.attachments,1001),claimed:m.claimed,inPlayerLedger:ledger.has(String(m._id))}));
const results={now:new Date().toISOString(),serverId:p.serverId,level:p.level,groups,mailCount:mails.length,playerLedgerCount:ledger.size,purchasedTicketMails:purchased,bag1001:Number(p.items?.[1001]||0),gemCount:(p.other_attr_info?.gemInfo?.gems||[]).length,gemLevel5Count:(p.other_attr_info?.gemInfo?.gems||[]).filter(g=>Number(g.id)>=25041&&Number(g.id)<=25044).length,unclaimedCount:mails.filter(m=>!m.claimed).length,correlations};
console.log(JSON.stringify(results));await c.close();})().catch(e=>{console.error(e.message);process.exitCode=1;});
""".replace('WEB_DATA',json.dumps({'giftcode_delivery_batches':web['giftcode_delivery_batches'],'recharge_milestone_claims':web['recharge_milestone_claims']}))
try:
 data=json.loads(execute(s,source).strip().splitlines()[-1]);(OUT/'claims_verified.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps(data,ensure_ascii=False))
finally:s.close()
