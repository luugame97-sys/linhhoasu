'use strict';
const fs=require('fs'),crypto=require('crypto'),cp=require('child_process');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const pm=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8',maxBuffer:8e6}));
const nodes=pm.filter(p=>/^lhs-s100[1-8]$/.test(p.name)).sort((a,b)=>a.name.localeCompare(b.name));
const result={checkedAt:new Date().toISOString(),nodes:[],public:[],productionWrites:0,gameRpcCalls:0};
const verificationVersion=auditPart==='integration'?'20261015_cross_rival_integration_v2':'20261015_cross_rival_safety_v1';
for(const p of nodes){
  const body=JSON.parse(cp.execFileSync('curl',['-fsS','--max-time','5','http://127.0.0.1:'+p.pm2_env.HTTP_PORT+'/ready'],{encoding:'utf8'}));
  if(body.status!=='ok'||!body.checks.mongo||!body.checks.redis)throw Error('READINESS:'+p.name);
  result.nodes.push({name:p.name,pid:p.pid,restarts:p.pm2_env.restart_time,status:p.pm2_env.status,ready:body});
}
for(const rel of ['index.html','js/lhs-cross-events-v2.js','js/lhs-cross-rival-safety-v1.js']){
  const data=cp.execFileSync('curl',['-fsS','--max-time','5','https://linhhoasu.lol/'+rel+'?v='+verificationVersion],{maxBuffer:2e6});
  const disk=fs.readFileSync('/linhhoasu/webgame/game/'+rel);
  if(hash(data)!==hash(disk))throw Error('PUBLIC_HASH:'+rel);
  result.public.push({path:rel,sha256:hash(data),matchesDisk:true});
}
for(const [k,v] of Object.entries(nodes[0].pm2_env))if(typeof v==='string')process.env[k]=v;
const logger=require.resolve('./src/logger');require.cache[logger]={id:logger,filename:logger,loaded:true,exports:{info(){},warn(){},error(){},debug(){}}};
const config=require('./src/services/ConfigService'),rules=require('./src/services/CrossRivalRules');
result.runtimeConfig={version:rules.VERSION,maintenance:rules.MAINTENANCE,ranks:{}};
if(rules.VERSION!==verificationVersion||rules.MAINTENANCE!==true)throw Error('RELEASE_GATE');
if(auditPart==='integration'){
  if(rules.release.qaActors.length||rules.release.enabled||rules.release.activationAt)throw Error('RELEASE_NOT_DISABLED');
  const handler=require('./src/handlers/cross-rival');
  result.runtimeConfig.handlerCount=Object.keys(handler).filter(k=>k.startsWith('handle')).length;
  if(result.runtimeConfig.handlerCount!==28)throw Error('HANDLER_MISSING');
  for(const name of ['CrossRivalRuntimeService','CrossRivalBattleAdapter','CrossRivalEconomyService','CrossRivalRewardService'])require('./src/services/'+name);
}
for(const name of ['CrossRivalScoreRankRewardConfig','CrossRivalDefenseRankRewardConfig']){
  const rows=Object.values(config.get(name));
  result.runtimeConfig.ranks[name]=[499,500,501].map(rank=>({rank,rows:rows.filter(r=>rank>=r.rankMin&&rank<=r.rankMax).map(r=>r.id)}));
  if(result.runtimeConfig.ranks[name].some(r=>r.rows.length!==1))throw Error('RANK_OVERLAP');
}
const index=fs.readFileSync('/linhhoasu/webgame/game/index.html','utf8');
result.addonOrderCorrect=index.indexOf('js/lhs-cross-events-v2.js?')<index.indexOf('js/lhs-cross-rival-safety-v1.js?');
if(!result.addonOrderCorrect)throw Error('ADDON_ORDER');
console.log(JSON.stringify(result));
process.exit(0);
