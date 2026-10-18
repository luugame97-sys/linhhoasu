'use strict';
// Read-only installed source/config and exact screenshot character comparison.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),vm=require('vm');
const app='/linhhoasu/lhs/newServer',game='/linhhoasu/webgame/game';
const log=require.resolve(app+'/src/logger');require.cache[log]={id:log,filename:log,loaded:true,exports:{info(){},warn(){},error(){},debug(){}}};
const config=require(app+'/src/services/ConfigService'),battle=require(app+'/src/services/BattleService');
const appearance=require(app+'/src/services/RoleAppearanceService'),readModel=require(app+'/src/services/ArenaReadModelService');
const source=fs.readFileSync(game+'/js/main.min_drop100.js','utf8');
const match=source.match(/calPowerByAttr=(function\(t\)\{[^}]+\}return Math\.ceil\(i\)\})/);if(!match)throw Error('NATIVE_FORMULA_NOT_FOUND');
const tables=config.loadAllTables(),native=vm.runInNewContext('('+match[1]+')',{Y:{Config:tables}});
const {MongoClient}=require(app+'/node_modules/mongodb');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
(async()=>{const mongo=new MongoClient('mongodb://127.0.0.1:27017',{serverSelectionTimeoutMS:5000});await mongo.connect();
try{const out={at:new Date().toISOString(),productionWrites:0,samples:[],hashes:{}};
 const rows=await mongo.db('lhs_s1001').collection('players').find({name:{$regex:'^(FoxPlayer|FangZi|Tiểu.?Quỷ|Talo)$',$options:'i'}},
 {projection:{...readModel.PLAYER_PROJECTION,updatedAt:1}}).maxTimeMS(5000).toArray();
 for(const row of rows){const p=JSON.parse(JSON.stringify(row));appearance.ensureRoleAppearance(p);const attrs=battle.calcPlayerPower(p),v=readModel.buildPlayerView(p,1001);
 out.samples.push({name:p.name,level:p.level,playerId:p.playerId,dbid:String(p._id),updatedAt:p.updatedAt,
  arenaDisplay:v.publicRow.power,legacy:battle.calcPowerScore(attrs),nativeWeightedSameAttrs:native(attrs),
  hp:attrs[1],atk:attrs[2],def:attrs[3],speed:attrs[4],attrs});}
 for(const rel of ['src/handlers/arena.js','src/services/ArenaReadModelService.js','src/services/BattleService.js','src/handlers/basic.js','src/handlers/playerPayload.js','src/services/CrossArenaService.js'])out.hashes[rel]=sha(fs.readFileSync(app+'/'+rel));
 for(const rel of ['index.html','js/lhs-arena-v1.js','js/lhs-power-cells-full-v1.js','js/main.min_drop100.js'])out.hashes['client/'+rel]=sha(fs.readFileSync(game+'/'+rel));
 const clientConfig=config.decodeTables(fs.readFileSync(game+'/update/resource/assets/excel/config_fashion_20260909.bin'));
 out.weights={server:sha(JSON.stringify(tables.AttrConfig)),client:sha(JSON.stringify(clientConfig.AttrConfig))};
 out.nativeFormula=match[1];console.log(JSON.stringify(out));
}finally{await mongo.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1;});
