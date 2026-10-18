'use strict';
const assert = require('assert/strict');
const { createService, rowsFor, rewardFor } = require('../src/services/OldTrekSettlementService');
const schedule = require('../src/services/OldTrekScheduleService');
const config = require('../src/services/ConfigService');
const clone = x => JSON.parse(JSON.stringify(x));
const endTime = schedule.anchorTimeMs + schedule.cycleDurationMs;
let clock = endTime+61000, failAtReceipt = false, created = 0;
const settlements = new Map(), mails = new Map(), claimed = new Set();
const players = [
 {userId:'u1',playerId:'a',other_attr_info:{oldTrekInfo:{season:1,totalDistance:3000}},oldTrekArenaScore:1020},
 {userId:'u2',playerId:'b',other_attr_info:{oldTrekInfo:{season:1,totalDistance:3000}},oldTrekArenaScore:1010},
 {userId:'bot',playerId:'c',managedBot:true,other_attr_info:{oldTrekInfo:{season:1,totalDistance:99999}}},
];
const query = value => ({ lean: async()=>clone(value), select(){return this;} });
const Settlement = { findById: id=>query(settlements.get(id)||null), create: async row=>{if(settlements.has(row._id)){const e=Error();e.code=11000;throw e;} settlements.set(row._id,clone(row));},
 updateOne: async(f,u)=>{if(failAtReceipt){failAtReceipt=false;throw Error('crash before receipt');}const d=settlements.get(f._id);if(u.$addToSet)for(const[k,v]of Object.entries(u.$addToSet)){d[k]||=[];if(!d[k].includes(v))d[k].push(v);}if(u.$set)Object.assign(d,u.$set);} };
const Mail = { findById:id=>query(mails.get(id)||null), create: async row=>{if(mails.has(row._id)){const e=Error();e.code=11000;throw e;}created++;mails.set(row._id,clone(row));return clone(row);} };
const Player={findOne:f=>query(claimed.has(f.mailClaimLedger)?{_id:'claimed'}:null)};
const service=createService({enabled:true,activationAt:endTime-1000,serverId:1001,clock:()=>clock,config,Settlement,Mail,Player,readPlayers:async()=>clone(players)});
(async()=>{
 assert.equal(rowsFor(players,1,false).length,2);assert.equal(rowsFor(players,1,false)[0].playerId,'a');
 assert(rewardFor(config.get('OldTrekSailRankRewardConfig'),1,false).length);
 failAtReceipt=true;await assert.rejects(service.settle(1,endTime,false),/crash/);assert.equal(created,1);
 const frozen=clone([...settlements.values()][0]);players[0].other_attr_info.oldTrekInfo.totalDistance=999999;
 await service.settle(1,endTime,false);assert.equal(created,2);assert.deepEqual([...settlements.values()][0].recipients,frozen.recipients);
 const first=[...mails.keys()][0];mails.delete(first);claimed.add(first);await service.settle(1,endTime,false);assert.equal(created,2);
 const state=[...settlements.values()][0];state.state='pending';state.delivered=[];await service.settle(1,endTime,false);assert.equal(created,2);
 clock=endTime+31*86400000;await service.settle(1,endTime,true);assert.equal(created,2);
 const p={oldTrekArenaScore:1400,other_attr_info:{oldTrekInfo:{season:1,totalDistance:2000,passRecords:[{id:1,buyRecord:7,claimRecord:{1:7}}],sailInfo:{cabin:[{id:1,count:1}],trekData:{uid:3}}}}};
 schedule.rolloverPlayerSeason(p,schedule.getSchedule(endTime+100));const i=p.other_attr_info.oldTrekInfo;
 assert.equal(i.passRecords[0].buyRecord,7);assert.equal(i.seasonArchives[1].sailInfo.cabin.length,1);assert.equal(i.seasonArchives[1].arenaScore,1400);
 assert.equal(i.sailInfo.cabin.length,0);assert.equal(i.totalDistance,0);
 console.log(JSON.stringify({status:'PASS',groups:8,createdMockMails:created,productionWrites:0,checks:['bot exclusion and tie','reward config','crash resume','immutable roster','claim ledger no resend','done idempotency','expiry no payout','rollover preserves paid entitlements/archive']}));
})().catch(e=>{console.error(e);process.exitCode=1;});
