'use strict';
// Scoped GM API operation for the account explicitly authorized in this chat.
// Secrets remain in memory and never enter the output/receipt.
const cp=require('child_process'),{MongoClient}=require('mongodb');
const pm=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8',maxBuffer:8e6}));
const primary=pm.find(p=>p.name==='lhs-s1001').pm2_env;
const mongo=new MongoClient(primary.MONGO_URI,{serverSelectionTimeoutMS:5000,maxPoolSize:2});
const ids=[310,311,312,313,314,315,316,317,318];
const compact=p=>({level:p.level,items:Object.fromEntries(ids.map(id=>[id,Number(p.items?.[id]||0)]))});
async function api(env,path,method,body,token){
  const res=await fetch('http://127.0.0.1:'+Number(env.HTTP_PORT)+'/api/admin'+path,{method,
    headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},
    body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
  const data=await res.json();if(!res.ok||!data.success)throw Error('GM_API_'+res.status+'_'+String(data.error||'FAILED'));
  return data;
}
(async()=>{await mongo.connect();
  const account=await mongo.db(primary.IDENTITY_MONGO_DB).collection('accounts').findOne({accountId:'vanduc97'},
    {projection:{accountId:1,roles:1,activeRoleByServer:1}});
  if(!account)throw Error('AUTHORIZED_ACCOUNT_MISSING');
  const active=account.roles.filter(r=>r.serverId>=1001&&r.serverId<=1008&&account.activeRoleByServer?.[r.serverId]===r.roleId);
  if(active.length!==8)throw Error('ACTIVE_ROLE_COUNT');
  const rows=[];
  for(const role of active){
    const env=pm.find(p=>p.name==='lhs-s'+role.serverId)?.pm2_env;
    if(!env?.ADMIN_PASSWORD||env.pm_cwd!=='/linhhoasu/lhs/newServer')throw Error('GM_RUNTIME_NOT_CONFIGURED');
    const players=mongo.db('lhs_s'+role.serverId).collection('players');
    const p=await players.findOne({userId:role.userId},{projection:{playerId:1,level:1,items:1}});
    if(!p)throw Error('ACTIVE_PLAYER_MISSING');
    const before=compact(p),items={};
    for(const id of ids){const target=id===311?20000:100;if(before.items[id]<target)items[id]=target;}
    const change={items,...(p.level<100?{level:100}:{})};
    const row={serverId:role.serverId,userId:role.userId,playerId:p.playerId,before,change};
    if(input.mode==='apply'){
      const planned=input.plan.rows.find(r=>r.serverId===row.serverId&&r.userId===row.userId&&r.playerId===row.playerId);
      if(!planned||JSON.stringify(planned.before)!==JSON.stringify(before)||JSON.stringify(planned.change)!==JSON.stringify(change))throw Error('GRANT_PREIMAGE_CONFLICT');
      let token;
      try{
        const auth=await api(env,'/auth/login','POST',{username:env.ADMIN_USERNAME||'admin',password:env.ADMIN_PASSWORD});token=auth.token;
        await api(env,'/players/'+encodeURIComponent(role.userId),'PATCH',change,token);
        row.after=compact(await players.findOne({userId:role.userId},{projection:{level:1,items:1}}));
        if(row.after.level<100||Object.entries(items).some(([id,n])=>row.after.items[id]!==n))throw Error('GRANT_READBACK_FAILED');
        row.verified=true;
      }finally{if(token)await api(env,'/auth/logout','POST',{},token);}
    }
    rows.push(row);
  }
  console.log(JSON.stringify({accountId:'vanduc97',mode:input.mode,at:new Date().toISOString(),rows}));
  await mongo.close();
})().catch(async e=>{console.error(e.message);await mongo.close();process.exitCode=1;});
