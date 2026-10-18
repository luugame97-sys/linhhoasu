'use strict';
// Atomic per-player replacement only: no RNG, no native grant, no reward mail.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const REPAIR = 'gem-placeholder-to-usable-v1-20260905';
const PAIRS = Object.freeze([[100091,100081],[100092,100082],[100093,100083],[100094,100084],[100095,100085],[100096,100086]]);
function planItems(items = {}) {
  const moves = [];
  for (const [from,to] of PAIRS) {
    const count = items[from];
    if (count === undefined || count === 0) continue;
    if (!Number.isSafeInteger(count) || count < 0) throw new Error('INVALID_SOURCE_COUNT:' + from);
    const existing = items[to] === undefined ? 0 : items[to];
    if (!Number.isSafeInteger(existing) || existing < 0 || !Number.isSafeInteger(existing + count)) throw new Error('INVALID_TARGET_COUNT:' + to);
    moves.push({from,to,count,targetBefore:existing,targetAfter:existing+count});
  }
  return moves;
}
function selfTest() {
  for (const [from,to] of PAIRS) {
    const items = {[from]:3,[to]:7,4:100}; const p = planItems(items);
    assert.deepEqual(p,[{from,to,count:3,targetBefore:7,targetAfter:10}]);
    const after={...items,[to]:10};delete after[from];assert.equal(planItems(after).length,0);assert.equal(after[4],100);
  }
  assert.throws(()=>planItems({100091:-1}));assert.throws(()=>planItems({100091:1.5}));
  assert.throws(()=>planItems({100091:1,100081:Number.MAX_SAFE_INTEGER}));
  assert.throws(()=>planItems({100091:'3'}));assert.equal(planItems({100091:0}).length,0);
  console.log(JSON.stringify({result:'PASS',pairs:6,tests:17,conversion:'1:1',noRng:true}));
}
async function main() {
  if (process.argv.includes('--self-test')) return selfTest();
  const APP = process.env.LHS_APP_ROOT || '/linhhoasu/lhs/newServer';
  const {MongoClient} = require(path.join(APP,'node_modules/mongodb'));
  const {EJSON} = require(path.join(APP,'node_modules/bson'));
  const config = require(path.join(APP,'src/services/ConfigService'));
  const asset = config.get('AssetsConfig'),use = config.get('AssetsUseConfig');
  const random = require(path.join(APP,'src/services/RandomUsableItemRewardService'));
  for (const [from,to] of PAIRS) {
    assert.equal(asset[from].type,99);assert.equal(asset[to].useType,102);assert.equal(use[to].type,102);
    assert.equal(random.getGemPackLevel(from),random.getGemPackLevel(to));assert(random.getGemPackLevel(from)>0);
  }
  const dbs = (process.env.GEM_REPAIR_DBS || 'lhs_s1001,lhs_s1002').split(',');
  assert(dbs.every(db=>['lhs_s1001','lhs_s1002'].includes(db)));
  const commit = process.argv.includes('--commit');
  const backupDir = process.env.GEM_REPAIR_BACKUP;
  if (commit) {
    assert(backupDir && /^\/linhhoasu\/_ai_workbench\/backups\/gem_box_conversion_[a-zA-Z0-9_]+$/.test(backupDir));
    fs.mkdirSync(backupDir,{recursive:true,mode:0o700});
  }
  const client = new MongoClient('mongodb://127.0.0.1:27017');
  await client.connect();
  const output={repairId:REPAIR,mode:commit?'commit':'preview',generatedAt:new Date().toISOString(),databases:{}};
  const query={isBot:{$ne:true},$or:PAIRS.map(([from])=>({['items.'+from]:{$gt:0}}))};
  const digest=p=>crypto.createHash('sha256').update(EJSON.stringify(p,{relaxed:false})).digest('hex');
  const unrelated=p=>Object.fromEntries(Object.entries(p).filter(([key])=>!['items','gemBoxRepairLedger'].includes(key)));
  function durableWrite(file,value){const fd=fs.openSync(file,'wx',0o600);try{fs.writeFileSync(fd,EJSON.stringify(value,{relaxed:false}));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
  try {
    for (const dbName of dbs) {
      const collection=client.db(dbName).collection('players');
      const players=await collection.find(query).toArray();
      const summary={matchedPlayers:players.length,eligiblePlayers:0,convertedPlayers:0,convertedUnits:0,totals:{},blocked:[],subjects:[]};
      output.databases[dbName]=summary;
      for(const p of players) {
        const subject=crypto.createHash('sha256').update(dbName+'|'+String(p._id)).digest('hex').slice(0,20);
        let moves;
        try{moves=planItems(p.items);}catch(error){summary.blocked.push({subject,reason:error.message});continue;}
        if(p.gemBoxRepairLedger?.[REPAIR]){summary.blocked.push({subject,reason:'SOURCE_REAPPEARED_AFTER_REPAIR'});continue;}
        if(!moves.length)continue;
        summary.eligiblePlayers++;
        for(const m of moves)summary.totals[m.from]=(summary.totals[m.from]||0)+m.count;
        const proof={subject,moves,...(p.name==='nicky'?{requestedPlayer:'nicky'}:{})};
        summary.subjects.push(proof);
        if(!commit)continue;
        const prefix=path.join(backupDir,dbName+'_'+subject);
        // Complete BSON-preserving preimage saved and fsynced BEFORE each update.
        durableWrite(prefix+'.before.ejson',{db:dbName,repairId:REPAIR,player:p});
        const inc={},unset={};for(const m of moves){inc['items.'+m.to]=m.count;unset['items.'+m.from]='';}
        const record={id:REPAIR,at:new Date(),moves,preimageSha256:digest(p),mode:'bag_replace_1_to_1',rewardMailSent:false};
        const result=await collection.updateOne({_id:p._id,items:p.items,['gemBoxRepairLedger.'+REPAIR]:{$exists:false}},
          {$inc:inc,$unset:unset,$set:{['gemBoxRepairLedger.'+REPAIR]:record}});
        if(result.modifiedCount!==1)throw new Error('CAS_CONFLICT:'+subject);
        const after=await collection.findOne({_id:p._id});
        for(const m of moves){assert.equal(after.items[m.from],undefined);assert.equal(after.items[m.to],m.targetAfter);}
        const beforeRest={...p.items},afterRest={...after.items};for(const [from,to]of PAIRS){delete beforeRest[from];delete beforeRest[to];delete afterRest[from];delete afterRest[to];}
        assert.deepEqual(afterRest,beforeRest);assert.equal(digest(unrelated(after)),digest(unrelated(p)));
        assert.equal(planItems(after.items).length,0);assert(after.gemBoxRepairLedger[REPAIR]);
        durableWrite(prefix+'.verified.ejson',{_id:p._id,moves,postimageSha256:digest(after),verifiedAt:new Date()});
        summary.convertedPlayers++;summary.convertedUnits+=moves.reduce((sum,m)=>sum+m.count,0);
      }
      summary.remainingPlayers=await collection.countDocuments(query);
      summary.ledgerPlayers=await collection.countDocuments({['gemBoxRepairLedger.'+REPAIR]:{$exists:true}});
    }
  } finally {await client.close();}
  console.log('GEM_REPAIR_RESULT='+JSON.stringify(output));
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
