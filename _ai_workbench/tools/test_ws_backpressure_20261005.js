'use strict';
const assert=require('assert/strict');
const WSServer=require('../../linhhoasu/lhs/newServer/src/net/WSServer');
const server=Object.create(WSServer.prototype); server.queueWarnDepth=999999; const handled=[];
server.sendResponse=(ws,p)=>ws.responses.push(p);
server._handleSingleMessage=async(_ws,msg)=>{handled.push(msg); await new Promise(r=>setTimeout(r,2));};
const ws={readyState:1,responses:[]}; const session={wsId:1,userId:'qa',player:{},_queueDepth:0,_queueSequence:0,_messageQueue:Promise.resolve(),_closing:false};
// A selector-bearing 1200 request is a purchase/mutation and must enter the
// ordered queue; it is never treated as a read snapshot.
server._enqueueMessage(ws,{tag:1200,msgUid:9000,data:{id:10001}},session);
for(let i=0;i<2000;i++) server._enqueueMessage(ws,{tag:1200,msgUid:i,data:{}},session);
for(let i=0;i<2000;i++) server._enqueueMessage(ws,{tag:2408,msgUid:10000+i,data:{dbid:'x'}},session);
setTimeout(()=>{try{
  assert(session._queueDepth<=256);
  assert(handled.some(x=>x.tag===1200&&x.data&&x.data.id===10001));
  assert(ws.responses.some(x=>x.data.code==='REQUEST_ALREADY_PENDING'));
  assert(ws.responses.some(x=>x.data.code==='REQUEST_BACKPRESSURE'));
  setTimeout(()=>{try{assert.equal(session._queueDepth,0);console.log(JSON.stringify({result:'PASS',maxQueue:256,handled:handled.length,responses:ws.responses.length}))}catch(e){console.error(e);process.exitCode=1}},10000)
}catch(e){console.error(e);process.exitCode=1}},40);
