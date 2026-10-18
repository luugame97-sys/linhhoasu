'use strict';
// Cost/storage regression adapter ONLY. Isolates original test expectations from the
// new request envelope, copy-on-write identity and stochastic generator. Production
// code is not changed; actual generator tests run separately without this preload.
const path=require('path'),fs=require('fs');
const root=path.resolve(process.argv[2]),app=path.join(root,'app');
if(!fs.existsSync(path.join(app,'src/services/FishingGameplayService.js')))throw Error('WRONG_TEST_ROOT');
process.env.CONFIG_BIN_PATH=path.join(root,'server.bin');process.env.NODE_ENV='test';process.env.LOG_DIR='';
const Module=require('module'),load=Module._load;let nonce=0;
Module._load=function(request,parent,isMain){const result=load.apply(this,arguments);
 if(parent&&/test_fishing_(balance|gear_fix)_20260906\.js$/.test(parent.filename)&&/[\\/]handlers[\\/]fish$/.test(request)&&!result.__legacyCostAdapter){
  const catchFn=result.handleFishCatch;
  result.handleFishCatch=async function(params,session,uid){const old=session.player,game=require(path.join(app,'src/services/FishingGameplayService')),balance=require(path.join(app,'src/services/FishingBalanceService')),config=require(path.join(app,'src/services/ConfigService')),fn=game.normalCatch;
   game.normalCatch=(player,pool)=>{const rows=pool.map(id=>config.get('FishConfig')[id]).filter(r=>r&&r.type>=1&&r.type<=10);const row=balance.pick(rows.map(r=>({...r,weight:balance.speciesWeight(player.fishInfo,r.type)})));return{id:row.id,multi:10000};};
   try{const out=await catchFn({...params,requestId:'legacy_cost_test_'+(++nonce),expectedRevision:old?.fishInfo?.balanceRevision||0},session,uid);if(session.player&&session.player!==old){Object.assign(old,session.player);session.player=old;}return out;}finally{game.normalCatch=fn;}
  };Object.defineProperty(result,'__legacyCostAdapter',{value:true});
 }
 return result;
};
