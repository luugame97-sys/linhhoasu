"""Create/cleanup one isolated QA login for native UI verification, no real-player writes."""
import json
import sys
from pathlib import Path
import paramiko
from recheck_items_readonly_20260905 import execute
WB=Path(__file__).resolve().parents[1]
creds=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines()
script=r"""
const cp=require('child_process');const procs=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8'}));
const env=procs.find(p=>p.name==='lhs-s1001').pm2_env;
const APP='/linhhoasu/lhs/newServer',{MongoClient}=require(APP+'/node_modules/mongodb'),bcrypt=require(APP+'/node_modules/bcrypt');
const c=new MongoClient('mongodb://127.0.0.1:27017');
const accountId='qarewvis260905',password='QAonly2026Rew',userId='qarewvis260905_role',roleId='qa_reward_visual_role';
(async()=>{await c.connect();const identity=c.db(env.IDENTITY_MONGO_DB||'lhs_s1001'),db=c.db('lhs_s1001');
if(CLEANUP){
 await db.collection('players').deleteOne({userId,playerId:roleId,accountId});
 await identity.collection('accounts').deleteOne({accountId,'roles.userId':userId});
 console.log('VISUAL_QA='+JSON.stringify({cleaned:true,players:await db.collection('players').countDocuments({userId}),accounts:await identity.collection('accounts').countDocuments({accountId})}));
}else{
 if(await identity.collection('accounts').findOne({accountId})||await db.collection('players').findOne({userId}))throw new Error('QA_ALREADY_EXISTS');
 const p=await db.collection('players').findOne({isBot:true});delete p._id;delete p.__v;delete p.botWorker;
 Object.assign(p,{userId,playerId:roleId,accountId,name:'QA Kiem Thu Thuong',isBot:false,serverId:1001,guildId:'',guildInfo:{},
 items:{90027:2,90202:2,90214:2,90101:2,110122:20},currencies:{diamond:0,silver:0,gold:0},other_attr_info:{},artifactInfo:{},
 itemUseRecords:{},activityInfo:{datas:[],giftCodeRecords:{}},rechargeInfo:{records:[],monthCards:{}},shopInfo:{pack:[],buyRecords:{}}});
 await db.collection('players').insertOne(p);
 await identity.collection('accounts').insertOne({accountId,passwordHash:await bcrypt.hash(password,10),status:1,authVersion:1,
 roles:[{roleId,userId,serverId:1001,serverName:'S1',name:p.name,createTime:Date.now(),lastLoginTime:0,status:1}],activeRoleByServer:{1001:roleId},lastSelectedServerId:1001,createdAt:new Date(),updatedAt:new Date()});
 console.log('VISUAL_QA='+JSON.stringify({created:true,accountId,userId,roleId,serverId:1001,identityDb:identity.databaseName}));
}
await c.close();})().catch(e=>{console.error(e.stack);process.exitCode=1;});
""".replace('CLEANUP','true' if '--cleanup' in sys.argv else 'false')
ssh=paramiko.SSHClient();ssh.load_system_host_keys();ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
ssh.connect(creds[0].strip(),username='root',password=creds[2],look_for_keys=False,allow_agent=False,timeout=20)
try:out=execute(ssh,script)
finally:ssh.close()
data=json.loads(out.split('VISUAL_QA=',1)[1].splitlines()[0]);print(json.dumps(data))
(WB/'temp/reward_release_20260905'/('visual_cleanup.json' if '--cleanup' in sys.argv else 'visual_account.json')).write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
