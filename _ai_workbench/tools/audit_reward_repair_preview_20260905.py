"""Anonymized repair preview only. Never writes player data."""
import json
import sys
from pathlib import Path
import paramiko
from recheck_items_readonly_20260905 import execute
WB=Path(__file__).resolve().parents[1]
sys.stdout.reconfigure(encoding='utf-8')
creds=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines()
script=r"""
process.env.NODE_ENV='audit';process.env.LOG_DIR='';
const APP='/linhhoasu/lhs/newServer',crypto=require('crypto');
const c=require(APP+'/src/services/ConfigService');
const {MongoClient}=require(APP+'/node_modules/mongodb');
const client=new MongoClient('mongodb://127.0.0.1:27017');
(async()=>{await client.connect();const out={};
for(const name of ['lhs_s1001','lhs_s1002']){
 const db=client.db(name),rows=[];
 const players=await db.collection('players').find({isBot:{$ne:true}},{projection:{userId:1,items:1,other_attr_info:1,artifactInfo:1,rechargeInfo:1,activityInfo:1,mailClaimLedger:1}}).toArray();
 for(const p of players){const moves=[];
 for(const [raw,count] of Object.entries(p.items||{})){const id=Number(raw);if(count<=0)continue;let kind,owned;
 if(c.get('ElfConfig')[id]){kind='elf';owned=(p.other_attr_info?.elfInfo?.elfData||[]).find(r=>r.id===id);}
 else if(c.get('CuriosConfig')[id]){kind='curios';owned=(p.other_attr_info?.curiosInfo?.curiosData||[]).find(r=>r.id===id);}
 else if(c.get('OrbConfig')[id]){kind='orb';owned=(p.artifactInfo?.orbInfo?.orbData||[]).find(r=>r.id===id);}
 else if(c.get('ValhallaFormationConnectItemConfig')[id]){kind='connect';owned=(p.other_attr_info?.valhallaFormationInfo?.connect||[]).find(r=>r.id===id);}
 else continue;
 moves.push({id,count,kind,currentlyOwned:!!owned,nativeState:owned?{id:owned.id,level:owned.level,star:owned.star,count:owned.count,subCount:owned.subCount}:null,
 receiptRequired:true,duplicatePolicyPending:kind==='curios'});}
 if(moves.length)rows.push({subject:crypto.createHash('sha256').update(name+'|'+p.userId).digest('hex').slice(0,16),moves,
 purchaseRecords:(p.rechargeInfo?.records||[]).filter(r=>[11000015,11000016,11000017,11000020].includes(Number(r.id))),
 giftCodeLedgerCount:Object.keys(p.activityInfo?.giftCodeRecords||{}).length,mailLedgerCount:(p.mailClaimLedger||[]).length});}
 out[name]={humans:players.length,affected:rows.length,rows};}
await client.close();console.log('REPAIR_PREVIEW='+JSON.stringify({readOnly:true,applied:false,generatedAt:new Date().toISOString(),databases:out}));})().catch(e=>{console.error(e.stack);process.exitCode=1;});
"""
ssh=paramiko.SSHClient();ssh.load_system_host_keys();ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
ssh.connect(creds[0].strip(),username='root',password=creds[2],look_for_keys=False,allow_agent=False,timeout=20)
try:out=execute(ssh,script)
finally:ssh.close()
data=json.loads(out.split('REPAIR_PREVIEW=',1)[1].splitlines()[0])
target=WB/'temp/reward_release_20260905/repair_preview.json'
target.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(data,ensure_ascii=False))
