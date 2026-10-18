'use strict';
const assert=require('node:assert/strict');
const {harness}=require('./oldtrek_reproduction_20261001');
function clone(v){return JSON.parse(JSON.stringify(v));}
async function main(){
  const h=harness('candidate');
  const info=h.s.player.other_attr_info.oldTrekInfo, sail=info.sailInfo, trek=sail.trekData;
  assert(trek,'fixture needs active trek');
  sail.currentEvent={uid:900000001,id:4017,pre:-1,rootUid:900000001,chainStep:0,createdAt:Date.now()-3600000,deadline:Date.now()-1000,miniGameType:1,miniGameLevel:37,policyVersion:'compatible-approximation-20260921-v1',trekUid:trek.uid,season:info.season};
  h.setStored(h.s.player); const beforeLedger=(info.eventLedger||[]).length;
  const reply=await h.handler.handleOldTrekInfo({},h.s,1);
  assert.equal(reply.tag,7000); assert(reply.data.expiredRecovery); assert.equal(reply.data.sailInfo.currentEvent,null); assert.equal(h.s.player.other_attr_info.oldTrekInfo.sailInfo.currentEvent,null);
  assert.equal((h.stored().other_attr_info.oldTrekInfo.eventLedger||[]).length,beforeLedger+1);
  const after=clone(h.stored());
  const non=harness('candidate'); const ni=non.s.player.other_attr_info.oldTrekInfo, ns=ni.sailInfo;
  ns.currentEvent={uid:900000002,id:4017,pre:-1,rootUid:900000002,chainStep:0,createdAt:Date.now(),deadline:Date.now()+3600000,miniGameType:1,miniGameLevel:37,policyVersion:'compatible-approximation-20260921-v1',trekUid:ns.trekData.uid,season:ni.season};
  const nr=await non.handler.handleOldTrekInfo({},non.s,2); assert.equal(nr.data.expiredRecovery,undefined); assert.equal(nr.data.sailInfo.currentEvent.uid,900000002);
  console.log(JSON.stringify({expired:'PASS',nonExpired:'PASS',ledgerPersisted:'PASS',casMisses:h.casMisses,casMissesNon:non.casMisses}));
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
