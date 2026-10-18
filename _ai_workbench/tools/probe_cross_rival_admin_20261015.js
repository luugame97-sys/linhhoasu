'use strict';
// Read only the account explicitly authorized by the user, without credentials.
const cp=require('child_process'),{MongoClient}=require('mongodb');
const pm=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8',maxBuffer:8e6}));
const env=pm.find(p=>p.name==='lhs-s1001').pm2_env;
const client=new MongoClient(env.MONGO_URI,{serverSelectionTimeoutMS:5000,maxPoolSize:2});
(async()=>{await client.connect();
  const account=await client.db(env.IDENTITY_MONGO_DB).collection('accounts').findOne({accountId:'vanduc97'},
    {projection:{accountId:1,roles:1,activeRoleByServer:1,lastSelectedServerId:1},maxTimeMS:5000});
  if(!account)throw Error('AUTHORIZED_ACCOUNT_NOT_FOUND');
  const roles=[];
  for(const role of account.roles.filter(r=>r.serverId>=1001&&r.serverId<=1008)){
    const p=await client.db('lhs_s'+role.serverId).collection('players').findOne({userId:role.userId},
      {projection:{userId:1,playerId:1,name:1,serverId:1,level:1,currencies:1,items:1,crossRivalInfo:1,crossRivalWallet:1,isBot:1,managedBot:1},maxTimeMS:5000});
    roles.push({roleId:role.roleId,userId:role.userId,serverId:role.serverId,exists:!!p,
      player:p?{userId:p.userId,playerId:p.playerId,name:p.name,serverId:p.serverId,level:p.level,currencies:p.currencies,
        items:Object.fromEntries([310,311,312,313,314,315,316,317,318,101310].map(id=>[id,p.items?.[id]||0])),
        crossRivalInfo:{cycleKey:p.crossRivalInfo?.cycleKey,score:p.crossRivalInfo?.score},walletReceiptCount:Object.keys(p.crossRivalWallet?.receipts||{}).length,
        isBot:!!p.isBot,managedBot:!!p.managedBot}:null});
  }
  const qaWorlds=await client.db(env.IDENTITY_MONGO_DB).collection('cross_rival_qa_worlds_v2').find({}).limit(4).toArray();
  const worlds=qaWorlds.map(w=>({id:w._id,revision:w.revision,cycle:w.cycle,campScores:w.campScores,
    players:Object.values(w.players).map(p=>({userId:p.userId,playerId:p.playerId,camp:p.camp,room:p.room,position:p.position,
      score:p.score,wins:p.wins,defKill:p.defKill,until:p.until,effects:p.effects,action:p.action,pending:p.pending,lastGain:p.lastGain,
      history:p.history})),outbox:w.outbox}));
  const publicDocs=await client.db(env.IDENTITY_MONGO_DB).collection('cross_rival_worlds_v2').find({}).limit(4).toArray();
  const publicWorlds=publicDocs.length;
  const publicWorldSummaries=publicDocs.map(w=>({id:w._id,revision:w.revision,cycle:w.cycle,campScores:w.campScores,
    players:Object.values(w.players).map(p=>({userId:p.userId,serverId:p.serverId,camp:p.camp,room:p.room,position:p.position,score:p.score,wins:p.wins,defKill:p.defKill,action:p.action,lastGain:p.lastGain,pending:p.pending})),outbox:w.outbox}));
  const fs=require('fs'),logs=[];
  for(const node of pm.filter(p=>/^lhs-s100[1-8]$/.test(p.name))){
    const file=node.pm2_env.pm_err_log_path;if(!file||!fs.existsSync(file))continue;
    const handle=fs.openSync(file,'r'),size=fs.fstatSync(handle).size,buffer=Buffer.alloc(Math.min(size,18000));
    fs.readSync(handle,buffer,0,buffer.length,Math.max(0,size-buffer.length));fs.closeSync(handle);
    logs.push({server:node.name,lines:buffer.toString().split('\n').filter(s=>s.includes('[CrossRival]')).slice(-12)});
  }
  console.log(JSON.stringify({checkedAt:new Date().toISOString(),accountId:account.accountId,worlds,publicWorlds,publicWorldSummaries,logs,
    lastSelectedServerId:account.lastSelectedServerId,activeRoleByServer:account.activeRoleByServer,roles,productionWrites:0}));
  await client.close();
})().catch(async e=>{console.error(e.message);await client.close();process.exitCode=1;});
