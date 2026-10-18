'use strict';
const crypto=require('node:crypto'),assert=require('node:assert/strict');
const {MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');
const activity=require('/linhhoasu/lhs/newServer/src/handlers/activity');
const PAY_IDS=[10501,10502];
function n(x){x=Number(x);return Number.isFinite(x)?Math.floor(x):0}
function arr(x){return Array.isArray(x)?x:[]}
function anon(db,id){return crypto.createHash('sha256').update('lhs-a9-audit-v1|'+db+'|'+String(id||'')).digest('hex').slice(0,16)}
function clone(x){return JSON.parse(JSON.stringify(x))}
function merge(rows){const m=new Map;for(const r of rows||[]){const id=n(r&&r.id),count=n(r&&r.count);if(id>0&&count>0)m.set(id,(m.get(id)||0)+count)}return Object.fromEntries([...m.entries()].sort((a,b)=>a[0]-b[0]))}
(async()=>{
  const client=new MongoClient('mongodb://127.0.0.1:27017');
  await client.connect();
  const results=[];
  try{
    for(const dbName of ['lhs_s1001','lhs_s1002']){
      const docs=await client.db(dbName).collection('players').find({$or:[
        {'rechargeInfo.records.id':{$in:[10501,10502,'10501','10502']}},
        {'activityInfo.datas.recordList':{$in:[10501,10502,'10501','10502']}},
      ]}).toArray();
      for(const source of docs){
        if(source.isBot===true)continue;
        const player=clone(source);
        const before=clone({items:source.items||{},datas:(source.activityInfo&&source.activityInfo.datas)||[]});
        const rows=arr(player.activityInfo&&player.activityInfo.datas).filter((row)=>
          n(row&&row.id)>=9001&&n(row&&row.id)<=9952&&arr(row.recordList).map(n).some((value)=>PAY_IDS.includes(value))
        );
        for(const originalRow of rows){
          const activityId=n(originalRow.id);
          const response=await activity.handleActivityOperate(
            {id:activityId,module:0,index:0,param:0},
            {player},
            900
          );
          const packets=Array.isArray(response)?response:[response];
          const reply=packets.find((packet)=>packet&&packet.tag===1700&&packet.msgUid===900);
          const rewardItems=merge(reply&&reply.data&&reply.data.rewardInfo&&reply.data.rewardInfo.items);
          const afterRow=arr(player.activityInfo.datas).find((row)=>n(row.id)===activityId);
          results.push({
            subject:anon(dbName,source.userId||source.playerId),
            db:dbName,
            activityId,
            payIds:arr(afterRow.recordList).map(n).filter((value)=>PAY_IDS.includes(value)),
            result:n(reply&&reply.data&&reply.data.result),
            rewardItems,
            records:afterRow.records||{},
            score:n(afterRow.score),
            sourceUnchanged:JSON.stringify({items:source.items||{},datas:(source.activityInfo&&source.activityInfo.datas)||[]})===JSON.stringify(before),
          });
        }
      }
    }
  }finally{
    await client.close();
  }
  assert.ok(results.length>0);
  assert.ok(results.every((row)=>row.result===0&&Object.keys(row.rewardItems).length>0&&row.sourceUnchanged));
  console.log('DRY_RUN_JSON='+JSON.stringify({result:'PASS',subjects:results.length,results}));
})().catch((error)=>{
  console.error(error.stack);
  process.exitCode=1;
});
