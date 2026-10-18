'use strict';
// Read saved gameplay documents, close Mongo, then compare copies in RAM.
const fs=require('fs'),path=require('path'),Module=require('module'),crypto=require('crypto');
const APP='/linhhoasu/lhs/newServer';
const backup=String(process.env.FASHION_RELEASE_BACKUP||'');
if(!backup.startsWith('/linhhoasu/_ai_workbench/backups/fashion_star_power_'))throw Error('BACKUP_PATH_REQUIRED');
const {MongoClient}=require(APP+'/node_modules/mongodb');
const clone=x=>JSON.parse(JSON.stringify(x));
async function main(){
  const mongo=new MongoClient('mongodb://127.0.0.1:27017',{serverSelectionTimeoutMS:5000});
  await mongo.connect();const snapshots=[];
  try{
    for(let sid=1001;sid<=1007;sid++){
      const rows=await mongo.db('lhs_s'+sid).collection('players').find({'fashionInfo.dress.star':{$gt:0},isBot:{$ne:true},managedBot:{$ne:true}},{projection:{
        _id:0,level:1,roleInfo:1,equipInfo:1,fashionInfo:1,fateInfo:1,fishInfo:1,artifactInfo:1,boxInfo:1,other_attr_info:1,petInfo:1,petSoulInfo:1,spiritInfo:1,swordInfo:1,homelandInfo:1,oldTrekInfo:1,valhallaInfo:1,bloodlineInfo:1,elfInfo:1,items:1,currencies:1,
      }}).limit(1).maxTimeMS(2500).toArray();
      for(const p of rows)snapshots.push({sid,p});
    }
  }finally{await mongo.close();}
  let networkAttempts=0;const deny=()=>{networkAttempts++;throw Error('VERIFY_NETWORK_DENIED')};
  require('net').Socket.prototype.connect=deny;require('tls').connect=deny;
  const lp=require.resolve(APP+'/src/logger');require.cache[lp]={exports:{info(){},warn(){},error(){},debug(){}}};
  const cfg=require(APP+'/src/services/ConfigService');cfg.loadAllTables();
  const current=require(APP+'/src/services/BattleService'),read=require(APP+'/src/services/ArenaReadModelService');
  const filename=APP+'/src/services/BattleService.js',old=new Module(filename,module);old.filename=filename;old.paths=Module._nodeModulePaths(path.dirname(filename));
  old._compile(fs.readFileSync(backup+'/BattleService.js','utf8'),filename);
  const rows=snapshots.map(({sid,p})=>{
    const before=read.displayPower(old.exports.calcPlayerPower(clone(p))),after=read.displayPower(current.calcPlayerPower(clone(p)));
    const restored=clone(p);delete restored.fashionInfo.starUp;
    const restoredPower=read.displayPower(current.calcPlayerPower(restored));
    return {serverId:sid,level:p.level,starRecords:p.fashionInfo.dress.filter(x=>x.star>0).length,beforePower:before,afterPower:after,increase:after-before,persistedDressOnlySamePower:restoredPower===after};
  });
  const publicRows=rows.map(({beforePower,afterPower,...r})=>r);
  console.log(JSON.stringify({at:new Date().toISOString(),scope:'one saved starred role per server; RAM comparison only',
    candidateSha256:crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex'),samples:publicRows,
    allIncreased:rows.length>0&&rows.every(r=>r.increase>0),persistedStarsPreserved:rows.every(r=>r.persistedDressOnlySamePower),networkAttempts,productionWrites:0}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
