'use strict';
// Run installed handlers/config against disposable RAM fixtures. No live
// role is loaded; persistence and external network calls are disabled.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const assert = require('assert/strict');
const app = process.env.FEATURE_APP || '/linhhoasu/lhs/newServer';
let networkAttempts = 0, memorySaves = 0;
const deny = () => { networkAttempts++; throw Error('AUDIT_NETWORK_DENIED'); };
require('net').Socket.prototype.connect = deny;
require('tls').connect = deny;
for (const n of ['http','https']) { require(n).request = deny; require(n).get = deny; }
global.fetch = deny;
const clone = x => JSON.parse(JSON.stringify(x));
function stub(rel, exports) {
  const p = require.resolve(path.join(app, rel));
  require.cache[p] = { id:p, filename:p, loaded:true, exports };
}
stub('src/logger', { info(){},warn(){},error(){},debug(){} });
stub('src/services/PlayerService', {
  drainPendingSaves: async () => {},
  savePlayer: async () => { memorySaves++; return true; },
});
stub('src/services/RuntimeBus', {getWsServer:()=>null});
const cfg = require(app+'/src/services/ConfigService');
const tables = cfg.loadAllTables();
const appearance = require(app+'/src/services/RoleAppearanceService');
const fashion = require(app+'/src/handlers/fashion');
const battle = require(app+'/src/services/BattleService');
const read = require(app+'/src/services/ArenaReadModelService');
const powerSync = require(app+'/src/services/PowerDisplaySyncService');
const requireIncrease = process.env.FASHION_POWER_REQUIRE_INCREASE === '1';
function calc(p) { const attrs=battle.calcPlayerPower(p); return {attrs,power:read.displayPower(attrs),legacy:battle.calcPowerScore(attrs)}; }
function fixture(d) {
  const p={userId:'RAM_FASHION_STAR_'+d.id,playerId:'RAM_'+d.id,level:120,exp:0,
    roleInfo:{kungfuId:4,subJob:0,stage:1},items:{},currencies:{diamond:0,silver:0,gold:0},
    fashionInfo:{fashion:{},curFashion:{},fashionMap:{},equipped:{},activateFashion:[],fashionData:[],dress:[],starUp:{},sets:[]},
    equipInfo:{curIndex:0,equipSetMap:{0:{}}},other_attr_info:{},petInfo:{pets:[]}};
  const levels=tables.FashionDressLevelConfig[d.id];
  for(const id of levels[0].fashionIds||[])appearance.grantFashionOwnership(p,id);
  return p;
}
function fund(p,rows) { for(const r of rows||[]) {
  if(r.id===1)p.currencies.diamond+=r.count;
  else if(r.id===2)p.currencies.silver+=r.count;
  else if(r.id===6)p.currencies.gold+=r.count;
  else p.items[r.id]=(p.items[r.id]||0)+r.count;
} }
async function main() {
  const rows=[];
  for(const d of Object.values(tables.FashionDressConfig||{})) {
    const levels=tables.FashionDressLevelConfig[d.id];
    if(d.isSuit!==1 || !levels?.[0] || !levels?.[1])continue;
    const p=fixture(d), session={player:p,userId:p.userId,serverId:1001,_powerDisplayV1:true};
    const max=Math.max(...Object.keys(levels).map(Number).filter(Number.isFinite));
    for(let star=1;star<=max;star++) {
      if(!levels[star] || !levels[star-1])continue;
      fund(p,levels[star-1].consumes);
      const before=calc(p);
      const beforeCost=Object.fromEntries((levels[star-1].consumes||[]).map(r=>[r.id,
        r.id===1?p.currencies.diamond:r.id===2?p.currencies.silver:r.id===6?p.currencies.gold:Number(p.items[r.id]||0)]));
      powerSync.packet(session,0,true);
      const packets=await fashion.handleDressStarUp({id:d.id,star,requestId:Date.now()+'-ram_star_'+d.id+'_'+star},session,1804+star);
      const reply=(Array.isArray(packets)?packets:[packets]).find(x=>x.tag===1804);
      const after=calc(p),sync=powerSync.packet(session);
      const attrDelta=Object.fromEntries([...new Set([...Object.keys(before.attrs),...Object.keys(after.attrs)])]
        .filter(k=>Number(before.attrs[k]||0)!==Number(after.attrs[k]||0)).map(k=>[k,Number(after.attrs[k]||0)-Number(before.attrs[k]||0)]));
      if(requireIncrease) {
        assert.equal(reply?.data?.result,0,'upgrade rejected: '+d.id+'/'+star);
        assert(after.power>before.power,'power did not increase: '+d.id+'/'+star);
        assert(sync && sync.data.power===after.power,'power stream missing/wrong: '+d.id+'/'+star);
        for(const key of Object.keys(levels[star].attrs||{})) {
          assert.equal(Number(after.attrs[key]||0)-Number(before.attrs[key]||0),
            Number(levels[star].attrs[key]||0)-Number(levels[star-1].attrs[key]||0),
            'suit attribute delta mismatch: '+d.id+'/'+star+'/'+key);
        }
        for(const r of levels[star-1].consumes||[]) {
          const afterCost=r.id===1?p.currencies.diamond:r.id===2?p.currencies.silver:r.id===6?p.currencies.gold:Number(p.items[r.id]||0);
          assert.equal(beforeCost[r.id]-afterCost,r.count,'material cost changed');
        }
        const paidState=clone({items:p.items,currencies:p.currencies,star:p.fashionInfo.starUp[d.id]});
        const replay=await fashion.handleDressStarUp({id:d.id,star},session,9000+star);
        // A fresh intent at an already reached level must fail without a
        // second debit or a second stat increase.
        assert.equal((Array.isArray(replay)?replay:[replay]).find(x=>x.tag===1804)?.data?.result,-1,'repeated level accepted');
        assert.equal(calc(p).power,after.power,'repeat changed power');
        assert.deepEqual({items:p.items,currencies:p.currencies,star:p.fashionInfo.starUp[d.id]},paidState,'repeat changed paid state');
      }
      rows.push({id:d.id,from:star-1,to:star,result:reply?.data?.result,
        storedStar:session.player.fashionInfo.starUp[d.id],
        beforePower:before.power,afterPower:after.power,powerDelta:after.power-before.power,
        attrDelta,configBefore:levels[star-1].attrs,configAfter:levels[star].attrs,
        powerRefreshEmitted:!!sync});
    }
  }
  const source=fs.readFileSync(app+'/src/services/BattleService.js','utf8');
  const start=source.indexOf('function addFashionAttrs('),end=source.indexOf('function addFateAttrs(',start);
  console.log(JSON.stringify({at:new Date().toISOString(),scope:'installed source/config; RAM fixtures only',
    hashes:Object.fromEntries(['src/services/BattleService.js','src/handlers/fashion.js','src/services/FashionTransactionService.js','src/services/PowerDisplaySyncService.js'].map(rel=>[rel,crypto.createHash('sha256').update(fs.readFileSync(app+'/'+rel)).digest('hex')])),
    summary:{suits:new Set(rows.map(r=>r.id)).size,transitions:rows.length,accepted:rows.filter(r=>r.result===0).length,
      increased:rows.filter(r=>r.powerDelta>0).length,unchanged:rows.filter(r=>r.powerDelta===0).length},
    rows,formula:source.slice(start,end),requireIncrease,networkAttempts,memorySaves,productionWrites:0},null,2));
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
