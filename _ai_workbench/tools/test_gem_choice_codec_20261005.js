'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
const start=fs.readFileSync(process.env.GEM_CODEC_START||path.join(root,'linhhoasu/webgame/game/js/start.min_52ac8d58.js'),'utf8');
const app=process.env.FEATURE_APP||path.join(root,'linhhoasu/lhs/newServer');
const server=require(path.join(app,'src/protocol/BinJsonUtil'));
const funcs=start.slice(start.indexOf('function k(e,t,r)'),start.indexOf('function P(){}',start.indexOf('function k(e,t,r)')));
const block=start.slice(start.indexOf('(i=a=a||{}).ByteArray=egret.ByteArray'),start.indexOf(',ve=RES.processor.BinaryProcessor'));
assert.ok(funcs.length>400&&block.length>3000,'actual native codec markers');
class ByteArray extends server.ByteArray {writeAutoNumber(value,signed){return server.writeAutoNumber(this,value,signed);}}
const context={egret:{ByteArray},a:{},t(){},ArrayBuffer,console};vm.createContext(context);
vm.runInContext(funcs+';'+block+';this.codec=O;',context);
const payload={price:9447840,count:9999,total:9447840*9999,negative:-(9447840*9999),safe:Number.MAX_SAFE_INTEGER,values:[9447840,9447840*9999,Number.MAX_SAFE_INTEGER],requestId:Date.now()+'-codecfixture123'};
assert.equal(payload.total,94468952160);assert.ok(Number.isSafeInteger(payload.total));
context.payload=JSON.stringify(payload);vm.runInContext('this.nativePayload=JSON.parse(payload)',context);
function encode(codec,data){const bytes=new ByteArray();codec.json2bin(data,bytes);bytes.position=0;return bytes;}
const c2s=server.BinJsonUtil.readFullJson(encode(context.codec,context.nativePayload));
const s2c=context.codec.readFullJson(encode(server.BinJsonUtil,payload));
assert.deepEqual(c2s,payload);assert.deepEqual(JSON.parse(JSON.stringify(s2c)),payload);
const packets=[{tag:1200,msgUid:123,data:{result:0,code:undefined,retryable:undefined,replayed:undefined,rewardInfo:{items:[{id:100099,count:9999}],equips:[],gems:[]},changed:[{id:1,count:94468952160}]}},{tag:1300,msgUid:124,data:{result:0,itemId:100099,count:1,gems:[{uid:9001,id:25111,shapeId:1}],rewardInfo:{items:[],gems:[{uid:9001,id:25111,shapeId:1}]},useRecords:[{id:100099,count:1}]}}];
const normalized=JSON.parse(JSON.stringify(packets,(_key,value)=>value===undefined?null:value));
const serverRead=server.BinJsonUtil.readFullJson(encode(server.BinJsonUtil,packets));assert.deepEqual(serverRead,normalized);
const nativeRead=context.codec.readFullJson(encode(server.BinJsonUtil,packets));assert.deepEqual(JSON.parse(JSON.stringify(nativeRead)),normalized);
context.packetJson=JSON.stringify(normalized);vm.runInContext('this.nativePackets=JSON.parse(packetJson);nativePackets[0].data.code=undefined;nativePackets[0].data.retryable=undefined;nativePackets[0].data.replayed=undefined;',context);
assert.deepEqual(server.BinJsonUtil.readFullJson(encode(context.codec,context.nativePackets)),normalized);
console.log(JSON.stringify({passed:true,price:payload.price,count:payload.count,total:payload.total,maxSafeInteger:payload.safe,nativeCodec:'BinJsonUtil extracted from current start.min_52ac8d58.js',byteArray:'server extracted Egret ByteArray adapter',directions:['native encode -> server decode','server encode -> native decode'],networkAttempts:0},null,2));
