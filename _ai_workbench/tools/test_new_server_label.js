'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const s=fs.readFileSync(process.argv[2],'utf8');
const start=s.indexOf('function selectNewestOpenServer('),end=s.indexOf('\nasync function buildNewestServerData',start);assert(start>=0&&end>start);
const pick=vm.runInNewContext('('+s.slice(start,end)+')');
const rows=[{serverId:1001,serverName:'S1',isNew:true,running:true,status:1,openTime:10},{serverId:1002,serverName:'S2',isNew:true,running:true,status:1,openTime:20},{serverId:1003,running:false,status:1,openTime:30},{serverId:1004,running:true,status:0,openTime:35},{serverId:1005,running:true,status:1,openTime:200}];
assert.equal(pick(rows,100).serverId,1002);assert.equal(pick(rows,19).serverId,1001);assert.equal(pick(rows,20).serverId,1002);assert.equal(pick([],100),null);assert.equal(pick(rows,200).serverId,1005);
assert(s.includes('defaultServerData: selectedServerData'));assert(s.includes('newServerName: newestServerData.serverName'));assert(s.includes('newServerData: newestServerData'));assert(s.includes('3075: handleGetLatestServer'));
console.log(JSON.stringify({result:'PASS',checks:9,latest:'S2',selectedAndRecentPreserved:true}));
