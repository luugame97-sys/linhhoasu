'use strict';
// Actual staged game reward router with in-memory players. No DB connection,
// mail transport, login or provider request is used by this test.
const fs=require('fs'),assert=require('assert/strict');
const app=process.argv[2],plan=JSON.parse(fs.readFileSync(process.argv[3]));
const cfg=require(app+'/src/services/ConfigService');cfg.loadAllTables();
const grant=require(app+'/src/services/RewardGrantService');let checks=0;
for(const row of plan.rows){
 const items=Object.entries(row.rewards).map(([id,count])=>({id:Number(id),count}));
 grant.assertRewardRowsSupported(items);checks++;
 const p={level:100,exp:0,items:{},currencies:{gold:0,diamond:0,silver:0},roleInfo:{},other_attr_info:{}};
 for(const item of items)grant.grantRewardRow(p,item,1);
 for(const[id,n]of Object.entries(row.rewards)){
  const cur=id==='1'?p.currencies.diamond:id==='2'?p.currencies.silver:id==='6'?p.currencies.gold:p.items[id];
  assert.equal(cur,n,'actual grant amount '+row.milestone_amount+'/'+id);checks++;
 }
 assert.equal(Number(p.items[5]||0),0);checks++;
}
console.log(JSON.stringify({result:'PASS',checks,milestones:plan.rows.length,scope:'actual staged reward router; in-memory player; no DB/network',productionRowsWritten:0}));
