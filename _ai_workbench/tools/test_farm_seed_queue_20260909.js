'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const code=fs.readFileSync(process.env.FEATURE_PATCH || process.argv[2] || 'linhhoasu/webgame/game/js/lhs-farm-alchemy-v2.js','utf8');
const events=[],sent=[];
function GameSocket(){}
GameSocket.prototype.Rpc=function(tag,data,cb){sent.push({tag,data}); if(tag===2499) cb({result:0,epoch:'0123456789abcdef0123456789abcdef',sequence:0,expiresIn:600000});};
function LandMainPanel(){}
LandMainPanel.prototype.playSeedingAni=function(index,cb){events.push('start'+index);setImmediate(()=>{events.push('done'+index);cb&&cb();});};
const root={GameSocket,LandMainPanel,UserTips:{ins:()=>({showTips(){}})},W:{LandModel:{_cacheUseItem:{}}},ItemModel:function(){},performance:{now:()=>Date.now()}};
root.ItemModel.prototype.onItemChange=function(){};root.ItemModel.prototype.onItemTimeChange=function(){};root.ItemModel.prototype.GetItemCount=function(){return 0};
const ctx=vm.createContext({window:root,Date,Math,setTimeout,setImmediate,clearTimeout,performance:root.performance});vm.runInContext(code,ctx);
const m=new LandMainPanel(),done=[];for(const i of [0,1,2,3])m.playSeedingAni(i,()=>done.push(i));
setTimeout(()=>{assert.deepEqual(events,['start0','done0','start1','done1','start2','done2','start3','done3']);assert.deepEqual(done,[0,1,2,3]);console.log(JSON.stringify({result:'PASS',jobs:done.length,events}));},20);
