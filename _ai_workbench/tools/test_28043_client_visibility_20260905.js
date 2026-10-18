'use strict';
// Execute only the current native client's relevant functions, not the bundle.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),zlib=require('node:zlib');
const root=path.resolve(process.argv[2]),app=path.resolve(__dirname,'../../linhhoasu/lhs/newServer');
const acorn=require(path.join(app,'node_modules/acorn'));
process.env.CONFIG_BIN_PATH=path.join(root,'client.bin');process.env.NODE_ENV='test';process.env.LOG_DIR='';
const logger=require.resolve(path.join(app,'src/logger'));require.cache[logger]={id:logger,filename:logger,loaded:true,exports:{info(){},warn(){},error(){},debug(){}}};
const tables=require(path.join(app,'src/services/ConfigService')).loadAllTables();
const code=fs.readFileSync(path.join(root,'main.js'),'utf8');
function extract(marker){const start=code.indexOf(marker);assert(start>=0,marker);const at=start+marker.indexOf('function');let ast=acorn.parseExpressionAt(code,at,{ecmaVersion:'latest'});if(ast.type==='SequenceExpression')ast=ast.expressions[0];assert.equal(ast.type,'FunctionExpression');return{offset:at,source:code.slice(ast.start,ast.end)};}
const ctx={Y:{Config:tables},AppInfo:{inChina:true},T:{serverTime:Date.now()/1000,serverOpenDay:100},B:{getObjectLen:o=>Object.keys(o).length},O:Math};
const names={IsFashionActive:'f.IsFashionActive=function',GetFashionList:'f.GetFashionList=function',checkShowType:'f.checkShowType=function',checkShowTypeOpenDay:'f.checkShowTypeOpenDay=function'};
const model={_fashionInfo:{activateFashion:[28043,28049],fashionData:[]},sortFashionList(){}};const offsets={};
for(const [name,marker] of Object.entries(names)){const fn=extract(marker);model[name]=vm.runInNewContext('('+fn.source+')',ctx);offsets[name]=fn.offset;}
const results=[];for(const inChina of [true,false]){ctx.AppInfo.inChina=inChina;const owned=model.IsFashionActive(28043),listed=model.GetFashionList(303,false).includes(28043);assert(owned);assert(!listed);results.push({inChina,owned,listed,showType:tables.FashionConfig[28043].showType,showTypeTw:tables.FashionConfig[28043].showTypeTw});}
const icon=extract('pDt.GetImgByID=function');const getIcon=vm.runInNewContext('('+icon.source+')',ctx);assert.equal(getIcon(28043),'icon_28043');
const {BinJsonUtil,ByteArray}=require(path.join(app,'src/protocol/BinJsonUtil'));
const skinPath=path.resolve(__dirname,'../../linhhoasu/webgame/game/update/resource/assets/cfg/gameEui_18e11b8e.bin');let skinBytes=fs.readFileSync(skinPath);if(skinBytes[0]===120)skinBytes=zlib.inflateSync(skinBytes);const skins=BinJsonUtil.readFullJson(new ByteArray(skinBytes));
const result={result:'PASS',clientFunctionOffsets:offsets,visibility:results,iconKey:getIcon(28043),localSkinDefaultIcon:skins.ItemIconSkin.icon.source,iconFallbackCauseVerified:false,requiredSuit:28040,requiredParts:tables.AssetsUseConfig[28040].rewards.map(r=>r.id),knownOwnedParts:[28043,28049],grantTest:false,gameMutations:0};
fs.writeFileSync(path.join(root,'client_visibility.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
