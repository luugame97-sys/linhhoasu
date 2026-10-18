'use strict';
// Reuse native flights after authoritative auto ACK. No inventory or timing writes.
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const acorn=require(process.env.FISH_ACORN_PATH||path.resolve(__dirname,'../../linhhoasu/lhs/newServer/node_modules/acorn'));
const root=path.resolve(process.argv[2]),input=process.argv[3]||'main.js',output=process.argv[4]||'main.fixed.js';
const original=fs.readFileSync(path.join(root,input),'utf8');let source=original;
const marker='u.sendAutoPowerFish=function',p=source.indexOf(marker);assert(p>=0);
let node=acorn.parseExpressionAt(source,p+marker.indexOf('function'),{ecmaVersion:'latest'});if(node.type==='SequenceExpression')node=node.expressions[0];
const before=source.slice(node.start,node.end);let after=before;
function once(s,a,b){assert.equal(s.split(a).length-1,1,a);return s.replace(a,b);}
after=once(after,'m._autoPowerPending=true;',
  'var raid=Y.RaidMgr&&Y.RaidMgr.mFishRaid,view=raid&&raid.fishMainView,answered=false;m._autoPowerPending=true;');
after=once(after,'if(generation!==(m._autoPowerGeneration||0))return;m._autoPowerPending=false;',
  'if(answered||generation!==(m._autoPowerGeneration||0))return;answered=true;m._autoPowerPending=false;');
after=once(after,'A.ins().dispatch(E.FISH_DEAL_UPDATE);',
  'A.ins().dispatch(E.FISH_DEAL_UPDATE);m.playAutoPowerFishEffects(r,raid,view);');
source=source.slice(0,node.start)+after+source.slice(node.end);
const helper=[
 'u.playAutoPowerFishEffects=function(r,raid,view){',
 'if(!r||r.result!==0||r.replayed||!raid||!view||!Y.RaidMgr||Y.RaidMgr.mFishRaid!==raid||raid.fishMainView!==view||!view.stage||!view.parent||Number(raid.mMapId)!==Number(this.fishInfo.scene))return;',
 'var from=typeof raid.getMyEntity==="function"&&raid.getMyEntity();if(!from||!from.stage)return;',
 'var slots=r.state&&r.state.slots,equipped=Array.isArray(r.equipped)?r.equipped:[],seen={};',
 'if(slots&&view.fishEquipPartView&&typeof view.fishEquipPartView.getEquipItemByType==="function"&&typeof view.playPutInIconFlyAnim==="function"){',
 'for(var i=0;i<equipped.length;i++){var row=equipped[i],type=Number(row.type),f=slots[type];',
 'if(type<1||type>10||type%1||!f||f.uid!==row.uid||f.id!==row.id||seen[type]||!Y.Config.AssetsConfig[f.id])continue;',
 'var target=view.fishEquipPartView.getEquipItemByType(type);if(!target||!target.stage||!target.parent)continue;seen[type]=true;',
 'try{view.playPutInIconFlyAnim(from,f);}catch(_fxError){}',
 '}}',
 'var currency=view.powerCurrency1,rewards=Array.isArray(r.rewards)?r.rewards.filter(function(x){return x&&Number(x.id)===68&&Number(x.count)>0;}):[];',
 'if(Array.isArray(r.soldUids)&&r.soldUids.length&&rewards.length&&currency&&currency.data&&Number(currency.data.itemId)===68&&currency.animGr&&currency.animGr.stage&&currency.animGr.parent&&Y.Config.AssetsConfig[68]&&typeof view.playSellIconFlyAnim==="function"){',
 'try{view.playSellIconFlyAnim(from,rewards,r.soldUids.length>=3);}catch(_fxError){}',
 '}',
 '},',
].join('');
const anchor='u.getDealMap=function';assert(!source.includes('u.playAutoPowerFishEffects=function'));source=once(source,anchor,helper+anchor);
acorn.parse(source,{ecmaVersion:'latest'});assert.equal(once(once(source,helper,''),after,before),original);
fs.writeFileSync(path.join(root,output),source);
if(output==='main.fixed.js')fs.writeFileSync(path.join(root,'client-build.json'),JSON.stringify({result:'PASS',changedFunction:marker,before,after,helper,nativeHelpersReused:true,inventoryMutation:false,timingChanged:false},null,2)+'\n');
console.log(JSON.stringify({result:'PASS',output,changedFunctions:1,addedFunctions:1,nativeHelpersReused:true}));
