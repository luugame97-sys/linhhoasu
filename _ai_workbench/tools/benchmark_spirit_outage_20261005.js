'use strict';
const path = require('path');
const root = '/linhhoasu/lhs/newServer';
const req = (p) => require(path.join(root, p));
(async () => {
  const { MongoClient } = req('node_modules/mongodb');
  const c = await MongoClient.connect('mongodb://127.0.0.1:27017');
  const fields='userId level exp spiritInfo roleInfo items currencies taskInfo other_attr_info petInfo farmInfo equipInfo raidInfo realmInfo swordInfo fashionInfo artifactInfo dailyInfo'.split(' ');
  const projection=Object.fromEntries(fields.map(k=>[k,1]));projection._id=0;
  const rows = await c.db('lhs_s1002').collection('players').find({userId:{$in:['u_Wk_1002_85c314_1788608804297','u_Wk_1002_af2f6f_1788608815820']}},{projection}).toArray();
  await c.close();
  const config = req('src/services/ConfigService');
  const tables=config.loadAllTables();
  const cfg = config.get('SpiritGradeConfig') || {};
  console.log(JSON.stringify({kind:'projection',rows:rows.map(p=>({role:p.userId.includes('85c314')?'toantran912':'votinh135',level:p.level,rank:p.spiritInfo?.rank,grade:p.spiritInfo?.grade,progressMode:p.spiritInfo?.progressMode})),gradeRows:Object.keys(cfg).length,maxGrade:Math.max(...Object.keys(cfg).map(Number).filter(Number.isFinite))}));
  // All data access ends above. Isolated child inherits gameplay projection via
  // stdin only; network is blocked before requiring the CPU-only service.
  const {spawnSync}=require('child_process');
  const child=`const fs=require('fs'),net=require('net'),tls=require('tls');net.Socket.prototype.connect=net.connect=net.createConnection=tls.connect=()=>{throw new Error('NETWORK_DENIED')};const {p,method,tables}=JSON.parse(fs.readFileSync(0,'utf8'));const base=process.cwd()+'/src/';require.cache[require.resolve(base+'services/PlayerService')]={exports:{savePlayer:async()=>true,savePlayerDeferred:async()=>true,wasRecentlySaved:()=>true}};require.cache[require.resolve(base+'services/ConfigService')]={exports:{get:k=>tables[k]||null,loadAllTables:()=>tables}};const map={spirit:['services/SpiritProgressService','getHistoricalSpiritUpgradeCount'],level:['handlers/raid','checkLevelUp'],pet:['handlers/pet','buildPetTimeRecordPayload'],temple:['handlers/temple','buildTempleLingyunTimeRecords'],items:['handlers/item','handleGetItems']};const [file,fn]=map[method];const s=require(base+file);const t=performance.now();console.log(JSON.stringify({started:method}));Promise.resolve(method==='items'?s[fn]({}, {player:p,userId:p.userId},1):s[fn](p)).then(result=>{console.log(JSON.stringify({elapsedMs:performance.now()-t,method}));process.exit(0)}).catch(e=>{console.log(JSON.stringify({method,error:e.message}));process.exit(2)});`;
  for(const p of rows)for(const method of ['spirit','level','pet','temple','items']){const t=Date.now();const r=spawnSync(process.execPath,['-e',child],{cwd:root,input:JSON.stringify({p,method,tables}),encoding:'utf8',timeout:5000,maxBuffer:2e6,env:{...process.env,NODE_ENV:'test',SERVER_ID:'1002',GAME_TIMEZONE:'Asia/Bangkok'}});console.log(JSON.stringify({kind:'benchmark',method,role:p.userId.includes('85c314')?'toantran912':'votinh135',wallMs:Date.now()-t,status:r.status,error:r.error?.code,output:r.stdout.trim().split('\n').slice(-1)[0],stderr:r.stderr.slice(-350),productionWrites:0}));}
})().then(()=>process.exit(0)).catch(e=>{console.error(e.message);process.exit(1)});
