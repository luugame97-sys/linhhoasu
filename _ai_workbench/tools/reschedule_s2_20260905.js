'use strict';
const fs = require('fs');
const assert = require('assert/strict');
const { execFileSync } = require('child_process');
const root = '/linhhoasu/lhs/newServer';
const { MongoClient } = require(root + '/node_modules/mongodb');
const { packRequest, unpackResponse } = require(root + '/src/protocol/ReqCodec');
const { PacketManager } = require(root + '/src/protocol');
const WebSocket = require(root + '/node_modules/ws');
const target = Date.parse('2026-09-05T17:00:00+07:00');
assert.equal(target, 1788602400000);
const oldTime = 1788516000000;
const client = new MongoClient('mongodb://127.0.0.1:27017', { serverSelectionTimeoutMS: 5000 });
function processes() {
  return JSON.parse(execFileSync('pm2',['jlist'],{encoding:'utf8'})).filter(p => p.name.startsWith('lhs-')).map(p => ({
    name:p.name,pid:p.pid,status:p.pm2_env.status,restarts:p.pm2_env.restart_time,
    serverId:p.pm2_env.SERVER_ID,identityDb:p.pm2_env.IDENTITY_MONGO_DB
  }));
}
async function readState() {
  const rows = [];
  for (const database of ['lhs_s1001','lhs_s1002']) {
    const row = await client.db(database).collection('gameservers').findOne({serverId:1002});
    rows.push({database,row});
  }
  return {now:new Date().toISOString(),processes:processes(),rows,
    s1:await client.db('lhs_s1001').collection('gameservers').findOne({serverId:1001})};
}
async function httpProbe(port,command,params) {
  const r=await fetch(`http://127.0.0.1:${port}/gameMsg.do`,{method:'POST',headers:{'Content-Type':'application/octet-stream',Host:'lhs.mg365.fun'},body:packRequest(command,params),signal:AbortSignal.timeout(10000)});
  assert.equal(r.status,200);
  return unpackResponse(Buffer.from(await r.arrayBuffer()));
}
async function wsProbe() {
  return new Promise((resolve,reject)=>{
    const ws=new WebSocket('ws://127.0.0.1:81/ws-s2');
    const timer=setTimeout(()=>{ws.terminate();reject(Error('WS_TIMEOUT'));},10000);
    ws.on('error',e=>{clearTimeout(timer);reject(e);});
    ws.on('open',()=>ws.send(PacketManager.packSingle(1,{serverId:1002,serverid:1002,platformuid:'schedule_readonly_probe'},901)));
    ws.on('message',buf=>{
      const decoded=PacketManager.unpackClient(Buffer.from(buf));
      const p=(Array.isArray(decoded)?decoded:[decoded]).find(p=>p.tag===1);
      if (!p) return;
      clearTimeout(timer); ws.close(); resolve(p.data);
    });
  });
}
async function main() {
  await client.connect();
  try {
    const before=await readState();
    if (process.env.S2_SCHEDULE_MODE !== 'apply') { console.log(JSON.stringify({mode:'audit',target,before})); return; }
    assert.ok(Date.now()<oldTime,'OLD_OPEN_TIME_ALREADY_PASSED');
    assert.ok(before.processes.some(p=>p.name==='lhs-s1002' && p.identityDb==='lhs_s1001'));
    assert.equal(before.rows[0].row.running,true);
    assert.equal(before.rows[0].row.status,1);
    for (const {row} of before.rows) { assert.ok(row); assert.ok([oldTime,target].includes(row.openTime),'UNEXPECTED_CURRENT_SCHEDULE'); }
    const backup=process.env.S2_SCHEDULE_BACKUP;
    assert.ok(backup && backup.startsWith('/linhhoasu/_ai_workbench/backups/s2_reschedule_'));
    fs.writeFileSync(backup,JSON.stringify(before,null,2)+'\n',{flag:'wx',mode:0o600});
    const changed=[];
    try {
      for (const item of before.rows) {
        if(item.row.openTime===target) continue;
        const r=await client.db(item.database).collection('gameservers').updateOne(
          {_id:item.row._id,serverId:1002,openTime:item.row.openTime,running:item.row.running,status:item.row.status},{$set:{openTime:target}});
        assert.equal(r.modifiedCount,1,'CONCURRENT_CONFIG_CHANGE'); changed.push(item);
      }
    } catch(e) {
      for (const item of changed.reverse()) await client.db(item.database).collection('gameservers').updateOne({_id:item.row._id,openTime:target},{$set:{openTime:item.row.openTime}});
      throw e;
    }
    const after=await readState();
    assert.deepEqual(after.s1,before.s1,'S1_CONFIG_CHANGED');
    assert.deepEqual(after.processes,before.processes,'PROCESS_CHANGED');
    after.rows.forEach(({row},i)=>assert.deepEqual(row,{...before.rows[i].row,openTime:target}));
    const checks=[];
    for (const port of [8080,8083]) {
      const list=await httpProbe(port,3074,{pageId:1});
      const s2=list.servers.find(s=>Number(s.serverId)===1002);
      assert.ok(s2); assert.equal(Number(s2.state),4); assert.equal(Number(s2.openTime),target);
      const auth=await httpProbe(port,2820,{serverId:1002,uid:'schedule_readonly_probe',token:'invalid-probe'});
      assert.equal(auth.code,'SERVER_NOT_OPEN');assert.equal(Number(auth.openTime),target);
      const rest=await fetch(`http://127.0.0.1:${port}/api/user/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({serverId:1002,accountId:'schedule_readonly_probe',password:'invalid-probe'}),signal:AbortSignal.timeout(10000)});
      assert.equal(rest.status,403);const body=await rest.json();assert.equal(body.code,'SERVER_NOT_OPEN');assert.equal(Number(body.openTime),target);
      const ready=await fetch(`http://127.0.0.1:${port}/ready`,{signal:AbortSignal.timeout(10000)});assert.equal(ready.status,200);
      checks.push({port,listState:s2.state,openTime:s2.openTime,httpGate:auth.code,restGate:body.code,ready:ready.status});
    }
    const ws=await wsProbe(); assert.equal(ws.code,'SERVER_NOT_OPEN');assert.equal(Number(ws.openTime),target);
    // Exercise production gate at both boundaries without changing system time or DB.
    const Module=require('module');const saved=Module._load;
    Module._load=function(request,parent,isMain){if(request==='./ServerConfigService' && parent.filename.endsWith('/ServerAccessService.js')) return {findServerConfig:async()=>after.rows[0].row};return saved.call(this,request,parent,isMain);};
    let gate;try {gate=require(root+'/src/services/ServerAccessService');} finally {Module._load=saved;}
    assert.equal((await gate.resolveServerAccess(1002,oldTime)).ok,false);
    assert.equal((await gate.resolveServerAccess(1002,target-1)).ok,false);
    assert.equal((await gate.resolveServerAccess(1002,target)).ok,true);
    console.log(JSON.stringify({result:'PASS',target,localOpenTime:'2026-09-05T17:00:00+07:00',backup,before,after,checks,wsGate:ws.code,boundary:{oldDeadline:'blocked',beforeNew:'blocked',atNew:'allowed'}}));
  } finally {await client.close();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
