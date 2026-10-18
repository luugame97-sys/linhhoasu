'use strict';
const assert=require('assert/strict'),path=require('path');
const root=path.resolve(__dirname,'../..'),app=process.env.FEATURE_APP||path.join(root,'linhhoasu/lhs/newServer');
const c=require(path.join(app,'src/services/ConfigService')),modulePolicy=require(path.join(app,'src/config/gemChoiceShop'));
const clone=x=>JSON.parse(JSON.stringify(x)),tables=clone(c.loadAllTables());
// Remove only new offer rows from this private fixture; preserve existing bags.
for(const offer of modulePolicy.policy.offers)delete tables.ShopConfig[offer.shopId];
for(const id of [90079,100098,100099]){delete tables.AssetsConfig[id];delete tables.AssetsUseConfig[id];}
const before=clone(tables);let checks=0;
function check(name,fn){fn();checks++;console.log('PASS '+name);}
modulePolicy.apply(tables);
check('exact seven levels IDs and approved NB prices',()=>{
 const expected=[9720,38880,116640,349920,1049760,3149280,9447840];assert.equal(modulePolicy.policy.offers.length,7);
 modulePolicy.policy.offers.forEach((o,i)=>{assert.equal(o.level,i+6);assert.equal(o.shopId,10000008+i);assert.equal(o.price,expected[i]);assert.deepEqual(tables.ShopConfig[o.shopId].cost,[{id:1,count:expected[i]}]);assert.equal(tables.ShopConfig[o.shopId].payId,0);assert.deepEqual(tables.ShopConfig[o.shopId].rewards,[{id:o.bagId,count:1}]);});
});
check('40 options exactly match gem levels and native one choice contract',()=>{
 let count=0;for(const o of modulePolicy.policy.offers){const use=tables.AssetsUseConfig[o.bagId];assert.equal(use.type,101);assert.deepEqual(use.attrs,[]);assert.deepEqual(use.conditions,[]);assert.equal(use.rewards.length,o.level===6?4:6);assert.equal(new Set(o.gems).size,o.gems.length);for(const r of use.rewards){assert.equal(r.count,1);assert.equal(tables.GemLevelConfig[r.id].level,o.level);assert.equal(tables.AssetsConfig[r.id].type,18);count++;}}assert.equal(count,40);
});
check('old shops and all existing bag metadata remain unchanged',()=>{
 for(const [id,row]of Object.entries(before.ShopConfig))assert.deepEqual(tables.ShopConfig[id],row);
 for(const [id,row]of Object.entries(before.AssetsConfig))assert.deepEqual(tables.AssetsConfig[id],row);
 for(const [id,row]of Object.entries(before.AssetsUseConfig))assert.deepEqual(tables.AssetsUseConfig[id],row);
 assert.equal(Object.keys(tables.ShopConfig).length,Object.keys(before.ShopConfig).length+7);
 assert.equal(Object.keys(tables.AssetsConfig).length,Object.keys(before.AssetsConfig).length+3);
});
check('pricing follows4 input6to7 then3 per upgrade without discount',()=>{
 const offers=modulePolicy.policy.offers;assert.equal(offers[0].price,40*3**5);assert.equal(offers[1].price,offers[0].price*4);for(let i=2;i<offers.length;i++)assert.equal(offers[i].price,offers[i-1].price*3);
});
check('repeat apply idempotent, late conflict prevents every insertion',()=>{
 const same=clone(tables);modulePolicy.apply(tables);assert.deepEqual(tables,same);
 const invalid=clone(before);invalid.ShopConfig[10000014]={id:10000014,cost:[{id:1,count:1}]};const untouched=clone(invalid);assert.throws(()=>modulePolicy.apply(invalid),/GEM_CHOICE_SHOP_CONFLICT/);assert.deepEqual(invalid,untouched);
});
console.log(JSON.stringify({pass:true,checks,mode:'RAM_ONLY',playerWrites:0}));
