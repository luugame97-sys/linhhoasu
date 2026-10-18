'use strict';
// Read-only native-method replay from the public bundle and current installed addons.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const base=path.resolve(__dirname,'../temp/fashion_current_audit_20260917');
const acorn=require(path.resolve(__dirname,'../../linhhoasu/lhs/newServer/node_modules/acorn'));
const main=fs.readFileSync(path.join(base,'client/js/main.min_drop100.js'),'utf8');
const probe=JSON.parse(fs.readFileSync(path.join(base,'probe.json')));
const tables=probe.tables,report={scope:'VM of exact public bundle methods and addons; no real-account actions',findings:[]};
function source(name) {
 const at=main.indexOf('.'+name+'=function');if(at<0)return null;
 let n=acorn.parseExpressionAt(main,main.indexOf('function',at),{ecmaVersion:2022});
 if(n.type==='SequenceExpression')n=n.expressions[0];return main.slice(n.start,n.end);
}
const manager={Config:tables,LanguageConfig:{},RoleModel:{kungfuId:8,subJob:1}};
const timers=[];
const root={GlobalManager:manager,Y:manager,T:{serverOpenDay:1},AppInfo:{inChina:true},
 x:{INITIAL_ROLE_SUIT:28000,COMMON_ROLE_SUIT:29999,ESuitType:{normal:0,linkage:1,changeColor:2,bathrobe:3,endSkill:4}},
 _t:(a,b)=>a.concat(b),setTimeout:fn=>{timers.push(fn);},console};root.window=root;
const ctx=vm.createContext(root),native=name=>vm.runInContext('('+source(name)+')',ctx);
class FashionModel {}
for(const name of ['GetSuitFashions','IsSuitActive','IsFashionActive','checkShowType','checkShowTypeOpenDay','checkSuitShow','getFashionStarLevel','getAllSuit','getShowInfoSuit'])if(source(name))FashionModel.prototype[name]=native(name);
root.FashionModel=FashionModel;
// Public native bootstrap creates an instance on GlobalManager; the class is a separate export.
assert(main.includes('this.FashionModel=new qV'));
assert(main.includes('v.FashionModel=qV'));
manager.FashionModel=new FashionModel();manager.FashionModel._fashionInfo={activateFashion:[],fashionData:[],fashion:{},dress:[]};
const original=FashionModel.prototype.GetSuitFashions;
for(const file of ['lhs-fashion-content-v1.js','lhs-fashion-day1-v1.js'])vm.runInContext(fs.readFileSync(path.join(base,'client/js',file),'utf8'),ctx);
assert.equal(manager.FashionModel.prototype,undefined);
assert.equal(root.LhsFashionDay1V1.installed,false);
assert.equal(FashionModel.prototype.GetSuitFashions,original);
report.findings.push({kind:'wrong-addon-prototype-target',nativeBootstrap:'this.FashionModel=new qV; v.FashionModel=qV',day1Installed:root.LhsFashionDay1V1.installed,contentInstalledFlag:root.LhsFashionContentV1.installed,actualSpecialWrapper:!!FashionModel.prototype._lhsCnFashionWrapped,retryCallbacks:timers.length});
const gates=[];for(const tab of ['FashionColorConfig','FashionChangeColorConfig','FashionDressLevelConfig'])for(const [id,rows]of Object.entries(tables[tab]||{}))for(const [color,v]of Object.entries(rows))if(v.showType===3&&v.openDay>1)gates.push({id:Number(id),color:Number(color),day:v.openDay,visible:manager.FashionModel.checkShowTypeOpenDay(v.showType,false,v.openDay)});
assert(gates.length&&gates.every(x=>x.visible===false));
report.findings.push({kind:'day1-gate-still-active',sets:[...new Set(gates.map(x=>x.id))],variantCount:gates.length,rows:gates});
const special=[];for(let color=100;color<=104;color++){try{const ids=manager.FashionModel.GetSuitFashions(28340,color);special.push({color,ids});}catch(e){special.push({color,error:e.name+': '+e.message});}}
assert.equal(special.filter(x=>x.error).length,5);
report.findings.push({kind:'special-color-client-throw',id:28340,cases:special});
const all=manager.FashionModel.getAllSuit();
const specialMap=Object.fromEntries(tables.FashionChangeColorConfig[28340][0].spFashionIds.map(id=>[tables.FashionConfig[id].type,id]));
report.findings.push({kind:'special-color-not-enumerated-or-recognized',listed:all.filter(v=>v.suitId===28340).map(v=>v.dyeing),recognized:manager.FashionModel.getShowInfoSuit({fashionMap:specialMap})});
let regularCases=0;const regularFailures=[];
for(const d of Object.values(tables.FashionDressConfig)){
 const tab=['FashionColorConfig','FashionDressLevelConfig','FashionChangeColorConfig','FashionBathConfig','FashionEndDressConfig'][d.isSuit];
 const vs=d.isSuit===4?{0:tables[tab][d.id]}:tables[tab]?.[d.id];
 if(d.id===28000)continue;
 for(const [color,v]of Object.entries(vs||{})){
  regularCases++;
  try{assert.deepEqual(Array.from(manager.FashionModel.GetSuitFashions(d.id,Number(color))),v.fashionIds);}catch(e){regularFailures.push({id:d.id,color:Number(color),error:e.message});}
 }
}
report.regularClientParts={cases:regularCases,failures:regularFailures};
const resources=JSON.parse(fs.readFileSync(path.join(base,'resources.json')));
const has=key=>!!(resources.registry[key]||resources.packed[key]||resources.aliases[key]);
const bodyReferences=new Map();
for(const f of Object.values(tables.FashionConfig)){
 const d=tables.FashionDressConfig[f.dressId];
 if(!d||![1,2,4].includes(d.isSuit)||f.type!==309)continue;
 for(const id of f.appearIds||[]){const a=tables.AppearanceConfig[id];if(a?.appearance)bodyReferences.set(a.appearance,{dressId:d.id,partId:f.id,appearance:a.appearance});}
}
report.resources={manifests:resources.manifests,registryCount:Object.keys(resources.registry).length,packedCount:Object.keys(resources.packed).length,missingDeclaredFiles:resources.missingFiles.length,wholeSuitBodyReferences:bodyReferences.size,missingBodyResources:[...bodyReferences.values()].filter(v=>!has(v.appearance+'_skel')||!has(v.appearance+'_atlas'))};
report.findings.push({kind:'missing-native-ui-handlers',methods:['suitHasSpFashion','onClickOpeningEff','updateOpeningEff'].map(name=>({name,present:!!source(name)}))});
const mappingStart=main.indexOf('FashionTypeToShowType=');
const mappingEnd=main.indexOf(',a.ShowTypeToFashionType=',mappingStart);
report.findings.push({kind:'opening-effect-native-gap',dressId:28410,itemId:28416,slot:tables.FashionConfig[28416].type,beginEffectId:tables.FashionEndDressConfig[28410].beginEffectId,mainBeginEffectReferences:main.split('beginEffectId').length-1,typeToShowMapping:main.slice(mappingStart,mappingEnd)});
report.findings.push({kind:'placeholder-language',rows:Object.entries(manager.LanguageConfig).filter(([,v])=>/NaN|Bộ 28340/.test(v.cn)).map(([id,v])=>({id:Number(id),name:v.cn}))});
const methods=['GetCurSuitData','getShowInfoSuit','getSuitBanTypes','getFashionStarLevel','checkSuitShow','GetSuitStars','isCompleteSuit'];
report.nativeMethods=Object.fromEntries(methods.map(n=>[n,source(n)]));
fs.writeFileSync(path.join(base,'client-probe.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
