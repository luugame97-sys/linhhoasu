'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.resolve(__dirname,'../..');
const file=process.env.FASHION_BATTLE_CANDIDATE||path.join(root,'linhhoasu/lhs/newServer/src/services/BattleService.js');
const source=fs.readFileSync(file,'utf8');
const start=source.indexOf('function addFashionAttrs('),end=source.indexOf('function addFateAttrs(',start);
const tables={
  FashionConfig:{101:{id:101,dressId:10,attrs:[]},102:{id:102,dressId:10,attrs:[]},
    111:{id:111,dressId:10,attrs:[]},112:{id:112,dressId:10,attrs:[]},
    121:{id:121,dressId:10,attrs:[]},122:{id:122,dressId:10,attrs:[]},201:{id:201,dressId:20,attrs:{4:7}}},
  FashionDressConfig:{10:{id:10,isSuit:1},20:{id:20,isSuit:0,attrs:{2:20}}},
  FashionDressLevelConfig:{10:{0:{fashionIds:[101,102],attrs:{1:100}},1:{fashionIds:[111,112],attrs:{1:150}},2:{fashionIds:[121,122],attrs:{1:210}}}},
  FashionColorAttrConfig:{0:{attrs:{3:5}},1:{attrs:{3:999}}},
};
const ctx={config:{get:n=>tables[n]},toSafeInt:(v,d=0)=>Number.isFinite(Number(v))?Math.floor(Number(v)):d,
  addAttrs:(b,attrs)=>{if(!attrs||typeof attrs!=='object'||Array.isArray(attrs))return;for(const [k,v] of Object.entries(attrs))b[k]=(b[k]||0)+v;}};
vm.createContext(ctx);vm.runInContext(source.slice(start,end)+'\nthis.calculate=addFashionAttrs;',ctx);
function calc(activateFashion=[],dress=[],starUp={}) {const attrs={};ctx.calculate(attrs,{fashionInfo:{activateFashion,dress,starUp}});return attrs;}
let checks=0;const check=(actual,expected)=>{assert.deepEqual(actual,expected);checks++;};
check(calc(),{3:5});
check(calc([101]),{3:5}); // A single base part is not an active suit.
check(calc([101,102]),{1:100,3:5});
check(calc([101,102,111,112,121,122],[{id:10,star:2}],{10:2}),{1:210,3:5}); // Once at current level.
check(calc([101,102],[{id:10,star:1}],{10:2}),{1:150,3:5}); // Canonical record wins.
check(calc([101,102],[{id:10,star:1},{id:10,star:2}],{10:1}),{1:210,3:5});
check(calc([101,102],[],{10:2}),{1:210,3:5}); // Legacy compatibility.
check(calc([],[],{10:2}),{3:5}); // No free activation through an orphan map.
check(calc([],[{id:10,star:2}]),{1:210,3:5}); // Persisted native star record.
check(calc([101,102],[{id:10,star:99}]),{3:5}); // Never invent a config row.
check(calc([201]),{2:20,3:5,4:7}); // Unrelated normal suit unchanged.
check(calc([101,102,111,112],[{id:10,star:1}]),{1:150,3:5}); // No colour-score inflation.
console.log(JSON.stringify({result:'PASS',checks,networkAttempts:0,productionWrites:0}));
