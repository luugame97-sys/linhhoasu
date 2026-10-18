'use strict';
// Native Mongo reads only. Do not load logger/models/handlers: they can prune
// log files or initialize indexes. Print selected evidence, never environment.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const crypto = require('node:crypto');
const { MongoClient } = require('./node_modules/mongodb');
const envFile = require('./node_modules/dotenv').parse(fs.readFileSync('.env'));
const nodes = JSON.parse(cp.execFileSync('pm2', ['jlist'], { maxBuffer: 8e6, encoding: 'utf8' }))
  .filter(p => /^lhs-s100[1-6]$/.test(p.name)).sort((a,b) => a.name.localeCompare(b.name));
const mode = process.argv[2] || 'inventory';
const envOf = node => ({ ...envFile, ...node.pm2_env });
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
async function withDb(node, fn) {
  const env = envOf(node);
  if (!env.MONGO_URI) throw Error('MONGO_URI_MISSING');
  const client = new MongoClient(env.MONGO_URI, { serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000, socketTimeoutMS: 10000, maxPoolSize: 1 });
  try {
    await client.connect(); const db = client.db();
    if (!/^lhs_s100[1-6]$/.test(db.databaseName)) throw Error('DATABASE_SCOPE_MISMATCH');
    return await fn(db, client, env);
  } finally { await client.close(); }
}
function listFiles(dir) {
  try { return fs.readdirSync(dir, { withFileTypes: true }).filter(d => d.isFile()).map(d => {
    const file = path.join(dir,d.name), st = fs.statSync(file);
    return { file, bytes: st.size, modified: st.mtime.toISOString() };
  }); } catch (_) { return []; }
}
async function inventory() {
  const rows = [];
  for (const node of nodes) rows.push(await withDb(node, async (db, client, env) => ({
    node: node.name, db: db.databaseName, status: node.pm2_env.status, pid: node.pid,
    logLevel: env.LOG_LEVEL || 'info', traceTags: env.WS_TRACE_TAGS || '',
    logDir: env.LOG_DIR || path.join(node.pm2_env.pm_cwd, 'logs'), retentionDays: env.LOG_RETENTION_DAYS || 7,
    outLog: node.pm2_env.pm_out_log_path, errorLog: node.pm2_env.pm_err_log_path,
    collections: (await db.listCollections({}, {nameOnly:true}).toArray()).map(c => c.name),
    countPlayers: await db.collection('players').estimatedDocumentCount({maxTimeMS:5000}),
    files: listFiles(env.LOG_DIR || path.join(node.pm2_env.pm_cwd, 'logs')),
  })));
  const pm2Dirs = [...new Set(rows.flatMap(r=>[r.outLog,r.errorLog]).filter(Boolean).map(f=>path.dirname(f)))];
  const pm2Files = pm2Dirs.flatMap(d=>listFiles(d)).filter(f=>/lhs-s100[1-6]/.test(path.basename(f.file)));
  const sources = {};
  for (const rel of ['src/handlers/homeland.js','src/net/WSServer.js','src/logger.js']) {
    const data = fs.readFileSync(rel); sources[rel] = { sha256:sha(data),bytes:data.length };
  }
  return { rows, pm2Files, sources };
}
async function logs() {
  const readline = require('node:readline');
  const env = envOf(nodes[0]);
  const appFiles = listFiles(env.LOG_DIR || path.join(nodes[0].pm2_env.pm_cwd, 'logs')).filter(r=>/^(combined|error)-/.test(path.basename(r.file)));
  const procFiles = nodes.flatMap(n=>[n.pm2_env.pm_out_log_path,n.pm2_env.pm_err_log_path]);
  const files = [...new Set([...appFiles.map(f=>f.file), ...procFiles])];
  const reports=[], groups=new Map(), evidence=[];
  for(const file of files) {
    const size=fs.statSync(file).size;
    if(size>160e6) {reports.push({file,skipped:'SIZE_LIMIT',size});continue;}
    const report={file,bytes:size,lines:0,firstTime:null,lastTime:null,matches:0,tagCounts:{}};
    const rows=readline.createInterface({input:fs.createReadStream(file,{end:Math.max(0,size-1)}),crlfDelay:Infinity});
    for await(const line of rows) {
      report.lines++;
      const time=line.match(/\[(20\d\d-\d\d-\d\d \d\d:\d\d:\d\d)\]/)?.[1];
      if(time){report.firstTime ||= time;report.lastTime=time;}
      if(!/tag[=: ]+67(?:0[0-9]|[12][0-9]|3[012]|4[012]|5[01])\b|[Hh]omeland|[Ss]tatue/.test(line))continue;
      report.matches++;
      const tag=Number(line.match(/tag[=: ]+(67\d\d)\b/)?.[1]||0);
      const user=line.match(/\buser(?:Id)?[=: ]+([^\s,]+)/)?.[1]||null;
      const ws=line.match(/ws#(\d+)/)?.[1]||null;
      const msgUid=line.match(/msgUid=(\d+)/)?.[1]||null;
      const kind=line.includes('replay cached')?'replay':line.includes('handler enter')?'enter':line.includes('slow tag=')?'slow':line.includes('[WSTrace] complete')?'complete':line.includes('[WSTrace] request')?'request':line.includes('Thất bại')?'error':'other';
      report.tagCounts[tag]=(report.tagCounts[tag]||0)+1;
      const server=file.match(/lhs-s(100[1-6])/ )?.[1]||'combined';
      const gkey=JSON.stringify({server,user,tag,kind,date:time?.slice(0,10)});
      const g=groups.get(gkey)||{server,user,tag,kind,date:time?.slice(0,10),count:0,first:time,last:time};
      g.count++;g.last=time;groups.set(gkey,g);
      if(tag===6707 || tag===6709 || evidence.length<20) evidence.push({file,line:report.lines,time,tag,user,ws,msgUid,kind});
    }
    reports.push(report);
  }
  return {reports,groups:[...groups.values()],evidence:evidence.slice(0,1000),evidenceCount:evidence.length};
}
async function players() {
  const reports=[];
  for(const node of nodes) reports.push(await withDb(node,async(db,client)=>{
    const projection={_id:0,userId:1,playerId:1,name:1,level:1,serverId:1,isBot:1,bot:1,createdAt:1,updatedAt:1,
      'currencies.diamond':1,'currencies.silver':1,'items.-32':1,'items.-33':1,'items.224':1,
      'homelandInfo.statueDayKey':1,'homelandInfo.statueTributeCount':1,
      'homelandInfo.drawFreeCount':1,'homelandInfo.drawDayKey':1,
      'homelandInfo.dailyLike':1,'homelandInfo.likeCount':1,'homelandInfo.fetters':1,
      'homelandInfo.lv':1,'homelandInfo.stateRevision':1,'homelandInfo.actionLedger.key':1};
    const docs=await db.collection('players').find({}, {projection,maxTimeMS:8000}).limit(10001).toArray();
    const stats={total:docs.length,withHomeland:0,withStatueDay:0,withStatueCount:0,usedStatue:0,above5:0,withReceipts:0,maxUsed:0};
    const histogram={}, active=[], high=[];
    for(const p of docs){
      const info=p.homelandInfo||{},used=Number(info.statueTributeCount||p.items?.['-32']||0);
      if(p.homelandInfo)stats.withHomeland++;
      if(info.statueDayKey)stats.withStatueDay++;
      if(info.statueTributeCount!=null)stats.withStatueCount++;
      if(info.actionLedger?.length)stats.withReceipts++;
      stats.maxUsed=Math.max(stats.maxUsed,used); if(used>0)stats.usedStatue++;if(used>5)stats.above5++;
      const key=String(info.statueDayKey||'no-date')+':'+used;histogram[key]=(histogram[key]||0)+1;
      const row={db:db.databaseName,userId:p.userId,playerId:p.playerId,name:p.name,level:p.level,
        bot:p.isBot===true||p.bot===true,diamond:p.currencies?.diamond||0,silver:p.currencies?.silver||0,
        day:info.statueDayKey||null,statueUsed:used,drawUsed:info.drawFreeCount||0,drawDay:info.drawDayKey||null,
        dailyLikeCount:info.dailyLike?.length||0,fettersCount:info.fetters?.length||0,updatedAt:p.updatedAt};
      if(used>0)active.push(row);
      high.push(row);
    }
    high.sort((a,b)=>b.diamond-a.diamond);
    const localCollections=await client.db('local').listCollections({}, {nameOnly:true}).toArray();
    return {node:node.name,db:db.databaseName,stats,histogram,active,highestBalances:high.slice(0,15),
      localCollectionNames:localCollections.map(c=>c.name)};
  }));
  return {reports};
}
async function main() {
  let result;
  if(mode==='inventory') result=await inventory();
  else if(mode==='logs') result=await logs();
  else if(mode==='players') result=await players();
  else throw Error('MODE_NOT_IMPLEMENTED');
  console.log(JSON.stringify({ at:new Date().toISOString(),readOnly:true,productionWrites:0,gameplayRpcCalls:0,...result }));
}
main().catch(e=>{console.error(e.name+':'+String(e.message).replace(/mongodb[^\s]*/g,'[REDACTED_URI]'));process.exitCode=1;});
