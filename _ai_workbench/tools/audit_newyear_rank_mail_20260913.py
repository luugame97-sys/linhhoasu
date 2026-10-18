"""Read-only live event/mail audit. No server files, models, or gameplay writes."""
import json
import sys
from snapshot_web_multiserver_20260906 import connect, run

JS = r"""
const fs=require('fs'),cp=require('child_process'),crypto=require('crypto');
const ps=JSON.parse(cp.execSync('pm2 jlist',{encoding:'utf8'})).filter(p=>/^lhs-s100[123]$/.test(p.name));
const result={at:new Date().toISOString(),readOnly:true,processes:ps.map(p=>({name:p.name,pid:p.pid,status:p.pm2_env.status,cwd:p.pm2_env.pm_cwd,script:p.pm2_env.pm_exec_path,serverId:p.pm2_env.SERVER_ID,config:p.pm2_env.CONFIG_BIN_PATH}))};
const root=ps[0].pm2_env.pm_cwd;
const env=ps[0].pm2_env;
for(const [k,v] of Object.entries(env))if(typeof v==='string')process.env[k]=v;
require(root+'/node_modules/dotenv').config({path:root+'/.env'});
const cfg=require(root+'/src/services/ConfigService');
const tables=cfg.loadAllTables();
const lang=tables.LanguageConfig||{};
result.language=Object.entries(lang).filter(([k,v])=>/Kim Mã|Kim mã|kim mã|pháo hoa|Pháo hoa|金马|爆竹|年兽|烟花/.test(JSON.stringify(v))).map(([id,v])=>({id,...v}));
result.activityConfig=Object.values(tables.ActivityConfig||{}).filter(v=>[43,44].includes(v.activityType));
result.rankConfig=tables.Activity44RankConfig;
result.attackConfig=tables.Activity44Config;
const files=['src/handlers/activity.js','src/app.js'];
result.sources=files.map(f=>({path:root+'/'+f,sha256:crypto.createHash('sha256').update(fs.readFileSync(root+'/'+f)).digest('hex')}));
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(dir+'/'+e.name):e.name.endsWith('.js')?[dir+'/'+e.name]:[])}
result.sourceRefs=[];
for(const file of walk(root+'/src')){
 const lines=fs.readFileSync(file,'utf8').split('\n');
 lines.forEach((line,i)=>{if(/Activity44RankConfig|44001|activityType === 44|NewYear.*[Ss]ettl|[Ss]ettl.*NewYear/.test(line))result.sourceRefs.push({file,line:i+1,text:line.trim()});});
}
async function auditDb(){
const MongoClient=require(root+'/node_modules/mongodb').MongoClient;
result.databases=[];
const uris=[...new Set(ps.map(p=>p.pm2_env.MONGO_URI||process.env.MONGO_URI))];
for(const uri of uris){
 const client=new MongoClient(uri,{serverSelectionTimeoutMS:5000});
 try{
 await client.connect();const db=client.db();const players=db.collection('players'),mails=db.collection('mails');
 const match={'activityInfo.datas.id':{$in:[44001,44002,44051,44052]}};
 const rows=await players.aggregate([{$match:match},{$project:{userId:1,playerId:1,name:1,serverId:1,activityInfo:1}},{$unwind:'$activityInfo.datas'},{$match:{'activityInfo.datas.id':{$in:[44001,44002,44051,44052]}}},{$project:{_id:0,userId:1,playerId:1,name:1,serverId:1,row:'$activityInfo.datas',disabled:'$activityInfo.disabledEntryIds'}}],{maxTimeMS:10000}).toArray();
 const ended=rows.filter(p=>p.row.endTime<Date.now()&&p.row.record>0);
 const counts={};for(const p of rows){const k=[p.serverId,p.row.id,p.row.startTime,p.row.endTime].join(':');counts[k]=(counts[k]||0)+1;}
 const top=ended.sort((a,b)=>b.row.record-a.row.record).slice(0,15);
 const related={$or:[{eventKey:/44001|44002|new.?year|firework|kim.?m[aã]/i},{title:/kim m[aã]|ph[aá]o|ni[eê]n th[uú]|niên thú|金马|年兽|爆竹|烟花/i},{'attachments.id':179}]};
 const mailGroups=await mails.aggregate([{$match:related},{$group:{_id:{title:'$title',eventKey:'$eventKey',targetServerId:'$targetServerId'},n:{$sum:1},first:{$min:'$createdAt'},last:{$max:'$createdAt'}}},{$limit:100}],{maxTimeMS:10000}).toArray();
 const samples=[];for(const p of top.slice(0,5)){const own=await mails.find({userId:p.userId},{projection:{_id:0,title:1,eventKey:1,attachments:1,createdAt:1,claimed:1,targetServerId:1}}).sort({createdAt:-1}).limit(30).toArray();samples.push({name:p.name,serverId:p.serverId,score:p.row.record,startTime:p.row.startTime,endTime:p.row.endTime,mails:own});}
 const eligible=rows.filter(p=>Number(p.row.id)===44001&&Number(p.row.record)>0&&p.userId);
 const eventPrefix='kimma_compensation_top123_20260913_v1';
 const packageRows=[{id:11448,count:3},{id:179,count:480},{id:6,count:240}];
 const existing=await mails.find({eventKey:{$regex:'^'+eventPrefix+'__'}}).project({userId:1,eventKey:1}).toArray();
 const existingSet=new Set(existing.map(x=>String(x.userId)));
 const compensation={eventPrefix,packageRows,eligible:eligible.length,existing:eligible.filter(x=>existingSet.has(String(x.userId))).length,created:0,skipped:0};
 if(process.env.APPLY_COMPENSATION==='1'){
   const now=new Date(), expire=new Date(Date.now()+30*86400000), ops=[];
   for(const p of eligible){const uid=String(p.userId),ek=eventPrefix+'__'+uid;if(existingSet.has(uid)){compensation.skipped++;continue;}ops.push({insertOne:{document:{userId:uid,title:'Đền bù sự kiện Kim Mã',content:'Quà xin lỗi do sự cố không gửi thư xếp hạng sự kiện. Gói đền bù gộp phần thưởng top 1, top 2 và top 3.',text:'Đền bù sự kiện Kim Mã',sender:'Hệ thống',attachments:packageRows,targetType:'user',targetServerId:Number(p.serverId||db.databaseName.replace(/\D/g,''))||0,batchId:eventPrefix,eventKey:ek,createdBy:'owner-approved-compensation',read:false,claimed:false,createdAt:now,updatedAt:now,expireAt:expire}}});}
   if(ops.length){const wr=await mails.bulkWrite(ops,{ordered:false});compensation.created=Number(wr.insertedCount||0);}
 }
 result.databases.push({name:db.databaseName,collections:(await db.listCollections({},{nameOnly:true}).toArray()).map(x=>x.name),totalEventRows:rows.length,positive:rows.filter(p=>p.row.record>0).length,endedPositive:ended.length,windows:counts,topEnded:top.map(p=>({name:p.name,serverId:p.serverId,row:p.row})),mailGroups,samples,compensation});
 }finally{await client.close();}
}
console.log(JSON.stringify(result));
}
auditDb().catch(e=>{console.error(e.name+': '+e.message.replace(/mongodb[^ ]+/g,'[REDACTED]'));process.exitCode=1;});
"""

if __name__ == '__main__':
    if '--apply' in sys.argv:
        raise SystemExit('BATCH_CLOSED: use permanent compensation receipt; missing Mail is not proof of non-delivery')
    ssh = connect()
    try:
        command = 'APPLY_COMPENSATION=1 node' if '--apply' in sys.argv else 'node'
        raw = run(ssh, command, JS)
        obj = json.loads(next(line for line in raw.splitlines() if line.startswith('{"at"')))
        if '--db' in sys.argv:
            print(json.dumps({'at':obj['at'],'databases':obj['databases']},ensure_ascii=False,indent=2))
        else:
            print(json.dumps(obj,ensure_ascii=False,indent=2))
    finally:
        ssh.close()
