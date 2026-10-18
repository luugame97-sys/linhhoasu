"""Correlate the reported purchase/code delivery with mail DB; no mutations."""
import json,sys
from pathlib import Path
import paramiko
from recheck_items_readonly_20260905 import execute
WB=Path(__file__).resolve().parents[1];OUT=WB/'temp/hungyen96_s2_20260905';sys.stdout.reconfigure(encoding='utf-8')
creds=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(creds[0].strip(),username='root',password=creds[2],look_for_keys=False,allow_agent=False,timeout=20)
try:
 source=r"""
const {MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');const c=new MongoClient('mongodb://127.0.0.1:27017');
(async()=>{await c.connect();const a=await c.db('lhs_s1001').collection('accounts').findOne({accountId:'hungyen96'});const roleIds=(a?.roles||[]).map(r=>r.userId);const result={now:new Date().toISOString(),databases:{}};
for(const dbName of ['lhs_s1001','lhs_s1002']){const db=c.db(dbName);const mails=await db.collection('mails').find({userId:{$in:roleIds}}).sort({createdAt:1}).toArray();
result.databases[dbName]={mails:mails.map(m=>({id:String(m._id),userId:m.userId,kind:String(m.eventKey||'').startsWith('webgm_gift_')?'giftcode':String(m.eventKey||'').startsWith('webgm_recharge_')?'milestone':String(m.content||'').includes('WebShop')?'webshop':'other',eventKey:m.eventKey||'',mailType:m.mailType,type:m.type,minClaimLevel:m.minClaimLevel,claimed:m.claimed,read:m.read,createdAt:m.createdAt,expireAt:m.expireAt,attachments:m.attachments||m.rewardData})),players:await db.collection('players').find({userId:{$in:roleIds}},{projection:{_id:0,userId:1,level:1,mailClaimLedger:1,items:1}}).toArray()};}
await c.close();console.log(JSON.stringify(result));})().catch(e=>{console.error(e.message);process.exitCode=1;});
"""
 mongo=json.loads(execute(s,source).strip().splitlines()[-1]);(OUT/'mail_audit.json').write_text(json.dumps(mongo,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 i,o,e=s.exec_command('php',timeout=45);i.write((WB/'tools/audit_hungyen96_web_ledger.php').read_text(encoding='utf-8'));i.flush();i.channel.shutdown_write();text=o.read().decode('utf-8','replace');error=e.read().decode('utf-8','replace');code=o.channel.recv_exit_status()
 if code:raise RuntimeError(error[-1500:])
 data=json.loads(text.split('HUNGYEN_WEB=',1)[1].splitlines()[0]);(OUT/'web_ledger.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 print(json.dumps({'mongo':{db:{'mails':d['mails'],'players':[{'userId':p['userId'],'level':p.get('level'),'mailLedgerCount':len(p.get('mailClaimLedger',[]))} for p in d['players']]} for db,d in mongo['databases'].items()},'web':data},ensure_ascii=False))
finally:s.close()
