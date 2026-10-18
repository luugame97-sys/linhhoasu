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
  const first=Array.isArray(reply)?reply[0]:reply; assert.equal(first.tag,7000); assert(first.data.expiredRecovery); assert.notEqual(first.data.sailInfo.currentEvent?.uid,900000001); assert.notEqual(h.s.player.other_attr_info.oldTrekInfo.sailInfo.currentEvent?.uid,900000001);
  assert.equal((h.stored().other_attr_info.oldTrekInfo.eventLedger||[]).length,beforeLedger+1);
  const replay=await h.handler.handleOldTrekAction(7002,{eventUid:900000001,operate:1,param:0,requestId:'expired_replay_01'},h.s,3); const rp=Array.isArray(replay)?replay[0]:replay; assert.equal(rp.data.result,0); assert.equal(rp.data.replayed,true); assert.equal((h.stored().other_attr_info.oldTrekInfo.eventLedger||[]).length,beforeLedger+1);
  const h8=harness('candidate'); const i8=h8.s.player.other_attr_info.oldTrekInfo, t8=i8.sailInfo.trekData;
  i8.sailInfo.currentEvent={uid:900000003,id:4017,pre:-1,rootUid:900000003,chainStep:0,createdAt:Date.now()-3600000,deadline:Date.now()-1000,miniGameType:1,miniGameLevel:37,policyVersion:'compatible-approximation-20260921-v1',trekUid:t8.uid,season:i8.season}; h8.setStored(h8.s.player); const l8=(i8.eventLedger||[]).length;
  const r8=await h8.handler.handleOldTrekAction(7008,{requestId:'expired_7008_01'},h8.s,4); const p8=(Array.isArray(r8)?r8[0]:r8); assert(p8.data.expiredRecovery); assert.equal((h8.stored().other_attr_info.oldTrekInfo.eventLedger||[]).length,l8+1);
  const after=clone(h.stored());
  const non=harness('candidate'); const ni=non.s.player.other_attr_info.oldTrekInfo, ns=ni.sailInfo;
  ns.currentEvent={uid:900000002,id:4017,pre:-1,rootUid:900000002,chainStep:0,createdAt:Date.now(),deadline:Date.now()+3600000,miniGameType:1,miniGameLevel:37,policyVersion:'compatible-approximation-20260921-v1',trekUid:ns.trekData.uid,season:ni.season};
  non.setStored(non.s.player);
  const nr=await non.handler.handleOldTrekInfo({},non.s,2); const nfirst=Array.isArray(nr)?nr[0]:nr; assert.equal(nfirst.data.expiredRecovery,undefined); assert.equal(nfirst.data.sailInfo.currentEvent.uid,900000002);
  console.log(JSON.stringify({expired:'PASS',nonExpired:'PASS',ledgerPersisted:'PASS',casMisses:h.casMisses,casMissesNon:non.casMisses}));
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
