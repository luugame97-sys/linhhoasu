"""Read-only evidence: active PM2 gates, scheduler source, settlement/mail history.
Never imports game bootstrap or invokes settlement. No remote writes.
"""
import json
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect, run

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = r"""
const fs=require('fs'),cp=require('child_process'),crypto=require('crypto');
const app='/linhhoasu/lhs/newServer';
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const {MongoClient}=require(app+'/node_modules/mongodb');
const keys=['SERVER_ID','DEFAULT_SERVER_ID','SERVER_OPEN_TIME','HTTP_PORT','IDENTITY_MONGO_DB','CROSS_EVENT_ENABLED','ARENA_SETTLEMENT_ENABLED','ARENA_SETTLEMENT_APPROVED','ARENA_SETTLEMENT_ACTIVATION_AT'];
const envSummary=e=>Object.fromEntries(keys.map(k=>[k,e[k]??e.env?.[k]??null]));
const pm=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8'})).filter(p=>/^lhs-s100[1-5]$/.test(p.name));
const schedule=JSON.parse(fs.readFileSync(app+'/src/config/crossServerEventSchedule.json','utf8'));
const report={at:new Date().toISOString(),directPlayerWrites:0,schedulerInvocations:0,schedule,processes:pm.map(p=>({name:p.name,status:p.pm2_env.status,cwd:p.pm2_env.pm_cwd,startedAt:new Date(p.pm2_env.pm_uptime).toISOString(),env:envSummary(p.pm2_env)})),files:{},sourceEvidence:{},servers:[],cross:[]};
for(const rel of ['src/app.js','src/services/ArenaSettlementService.js','src/services/CrossEventSettlementService.js','src/services/CrossServerEventService.js','src/services/CrossArenaService.js','src/db/models/CrossEventSettlement.js','ecosystem.config.js'])report.files[rel]=sha(app+'/'+rel);
const snippets={
 'src/app.js':['startArenaSettlementScheduler','CrossEventSettlementService','crossSettlement'],
 'src/services/ArenaSettlementService.js':['const enabled','if (!enabled || !approved','function dueCutoffs'],
 'src/services/CrossEventSettlementService.js':['if(!cross.isServerAllowed','const storageKey'],
 'src/services/CrossServerEventService.js':['function isServerAllowed','function isEventOpen']
};
for(const [rel,terms] of Object.entries(snippets)){const src=fs.readFileSync(app+'/'+rel,'utf8');report.sourceEvidence[rel]=terms.map(t=>{const i=src.indexOf(t);return{term:t,line:i<0?null:src.slice(0,i).split('\n').length,excerpt:i<0?'NOT_FOUND':src.slice(i,i+750)}});}
const eco=require(app+'/ecosystem.config.js');report.ecosystem=eco.apps.filter(p=>/^lhs-s100[1-5]$/.test(p.name)).map(p=>({name:p.name,env:envSummary(p.env||{})}));
try{report.persisted=JSON.parse(fs.readFileSync('/root/.pm2/dump.pm2','utf8')).filter(p=>/^lhs-s100[1-5]$/.test(p.name)).map(p=>({name:p.name,env:envSummary(p)}));}catch(e){report.persisted={error:e.code||e.message};}
const loggerPath=require.resolve(app+'/src/logger');require.cache[loggerPath]={id:loggerPath,filename:loggerPath,loaded:true,exports:{debug(){},info(){},warn(){},error(){}}};
const config=require(app+'/src/services/ConfigService');config.loadAllTables();
report.rewardConfig=Object.fromEntries(['ArenaDayRankRewardConfig','ArenaWeeklyRankRewardConfig','CrossArenaDayRankRewardConfig','CrossArenaWeeklyRankRewardConfig'].map(k=>{const rows=Object.values(config.get(k)||{});return[k,{brackets:rows.length,first:rows.slice(0,2)}]}));
(async()=>{const c=new MongoClient('mongodb://127.0.0.1:27017',{maxPoolSize:2,serverSelectionTimeoutMS:7000});await c.connect();try{
for(const proc of pm){
const sid=Number(proc.pm2_env.SERVER_ID||proc.pm2_env.env?.SERVER_ID),db=c.db('lhs_s'+sid),settle=db.collection('arenasettlements'),mail=db.collection('mails');
const ag=await settle.aggregate([{$sort:{cutoffAt:-1}},{$limit:9},{$project:{serverId:1,period:1,periodKey:1,cutoffAt:1,state:1,activationAt:1,completedAt:1,cursorAt:1,lastError:1,recipientCount:{$size:{$ifNull:['$recipients',[]]}},deliveredCount:{$size:{$ifNull:['$delivered',[]]}},expiredCount:{$size:{$ifNull:['$expired',[]]}},top:{$slice:['$recipients',3]}}}],{maxTimeMS:7000}).toArray();
const queries={arena:{eventKey:{$regex:'^arena_'+sid+'_'}},crossArena:{eventKey:{$regex:'^cross:.*:crossArena:'}},titleFallback:{title:{$regex:'Võ Đạo Hội|Đỉnh Phong', $options:'i'}}};
const mails={};for(const [label,q]of Object.entries(queries))mails[label]={count:await mail.countDocuments(q,{maxTimeMS:7000}),latest:await mail.find(q,{projection:{_id:1,userId:1,title:1,eventKey:1,targetServerId:1,createdAt:1,claimed:1,read:1,attachments:1,expireAt:1}}).sort({createdAt:-1}).limit(3).maxTimeMS(7000).toArray()};
const crossParticipants=await db.collection('players').countDocuments({'crossArenaInfo.version':2},{maxTimeMS:7000});
const roleCount=await db.collection('accounts').countDocuments({}, {maxTimeMS:7000});
const row={serverId:sid,db:db.databaseName,arenaSettlementCount:await settle.countDocuments({}, {maxTimeMS:7000}),arenaLatest:ag,crossParticipants,mails};
const paths=[proc.pm2_env.pm_out_log_path,proc.pm2_env.pm_err_log_path].filter(Boolean);row.logs=[];
for(const p of paths){try{const lines=cp.execFileSync('tail',['-c','1500000',p],{encoding:'utf8',maxBuffer:2000000}).split('\n');const hits=lines.filter(l=>/ArenaSettlement|CrossEvent.*settlement|ARENA_SETTLEMENT_|CROSS_(SNAPSHOT|ROSTER|MAIL|REWARD|CUTOFF)/.test(l));row.logs.push({file:p,bytesScanned:1500000,count:hits.length,last:hits.slice(-8)});}catch(e){row.logs.push({file:p,error:e.code||'READ_FAILED'});}}
report.servers.push(row);
}
const identity=[...new Set(report.processes.map(p=>p.env.IDENTITY_MONGO_DB||'lhs_s'+p.env.SERVER_ID))];
for(const dbName of identity){const col=c.db(dbName).collection('crosseventsettlements');const docs=await col.find({event:'crossArena'},{projection:{snapshotHash:0}}).sort({cutoffAt:-1}).limit(9).maxTimeMS(7000).toArray();report.cross.push({db:dbName,count:await col.countDocuments({event:'crossArena'},{maxTimeMS:7000}),cursors:await col.find({_id:/^cross_scheduler_/},{projection:{_id:1,cursorAt:1,updatedAt:1}}).toArray(),latest:docs.map(d=>{const recipients=d.recipients||[],delivered=new Set(d.delivered||[]),expired=new Set(d.expired||[]),byServer={};for(const r of recipients){const row=byServer[r.serverId]??={recipients:0,delivered:0,expired:0};row.recipients++;if(delivered.has(r.playerId))row.delivered++;if(expired.has(r.playerId))row.expired++;}return{_id:d._id,state:d.state,period:d.period,cycleKey:d.cycleKey,cutoffAt:d.cutoffAt,completedAt:d.completedAt,byServer,top:recipients.slice(0,3)}})});}
}finally{await c.close()}console.log('REWARD_AUDIT_JSON='+JSON.stringify(report));})().catch(e=>{console.error(e.stack);process.exitCode=1});
"""

def main():
    s=connect()
    try:
        raw=run(s,'cd /linhhoasu/lhs/newServer && node -',SCRIPT)
        data=json.loads(raw.split('REWARD_AUDIT_JSON=')[-1])
        out=ROOT/'_ai_workbench/temp/s5_competition_rewards_20260925'
        out.mkdir(parents=True,exist_ok=True)
        (out/'live.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
        compact={k:v for k,v in data.items() if k not in ['servers','sourceEvidence']}
        compact['servers']=[{**{k:v for k,v in row.items() if k!='arenaLatest'},'arenaLatest':[{k:v for k,v in r.items() if k!='top'} for r in row['arenaLatest']]} for row in data['servers']]
        print(json.dumps(compact,ensure_ascii=False,indent=2))
    finally:s.close()

if __name__=='__main__':main()
