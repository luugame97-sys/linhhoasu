'use strict';
const assert=require('assert/strict');
const Player=require('../src/db/models/Player');
const ps=require('../src/services/PlayerService');
let captured;
Player.collection.updateOne=async(filter,update)=>{captured={filter,update};return{matchedCount:1}};
(async()=>{
 const before={oldTrekInfo:{stateRevision:4},items:{321:10},currencies:{diamond:3,gold:0,silver:0}};
 const after={userId:'ram',level:100,items:{321:9},currencies:{diamond:3,gold:0,silver:0},other_attr_info:{oldTrekInfo:{stateRevision:5}}};
 await ps.savePlayer('ram',after,{returnSaved:false,oldTrekCAS:before});
 assert.equal(captured.filter.userId,'ram');assert.equal(captured.filter.$and.length,3);assert(captured.filter.$or);
 assert.deepEqual(captured.filter.$and[0],{'other_attr_info.oldTrekInfo':{$eq:before.oldTrekInfo}});
 assert.equal(captured.update.$set.items[321],9);assert.equal(captured.update.$set.items[1],3);
 await ps.savePlayer('ram',after,{returnSaved:false});assert.equal(captured.filter.$and,undefined);
 console.log(JSON.stringify({status:'PASS',groups:2,networkAttempts:0,productionWrites:0}));
})().catch(e=>{console.error(e);process.exitCode=1});
