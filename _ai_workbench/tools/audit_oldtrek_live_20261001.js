'use strict';
// Read-only OldTrek state audit. Anonymizes player identity and never saves.
const fs = require('node:fs');
const crypto = require('node:crypto');
const { MongoClient } = require('./node_modules/mongodb');
const dotenv = require('./node_modules/dotenv');
const envFile = dotenv.parse(fs.readFileSync('.env'));
const processes = JSON.parse(require('node:child_process').execFileSync('pm2', ['jlist'], { encoding: 'utf8', maxBuffer: 5e6 }))
  .filter(p => /^lhs-s100[1-6]$/.test(p.name));
const digest = value => crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 12);
const now = Date.now();
function summary(info = {}) {
  const sail = info.sailInfo && typeof info.sailInfo === 'object' ? info.sailInfo : {};
  const trek = sail.trekData && typeof sail.trekData === 'object' ? sail.trekData : null;
  const event = sail.currentEvent && typeof sail.currentEvent === 'object' ? sail.currentEvent : null;
  const ledger = Array.isArray(info.eventLedger) ? info.eventLedger : [];
  const eventLog = Array.isArray(sail.eventLogs) ? sail.eventLogs : [];
  const deadline = Number(event && event.deadline || 0);
  return {
    stage: Number(info.stage || 0), season: Number(info.season || 0), stateRevision: Number(info.stateRevision || 0),
    puzzleClientVersion: String(info.puzzleClientVersion || ''), sailing: !!info.sailing,
    trek: trek ? { uid: Number(trek.uid || 0), id: Number(trek.id || 0), diff: Number(trek.diff || 0),
      dist: Number(trek.dist || 0), lastUpdateTime: Number(trek.lastUpdateTime || 0),
      eventPolicyVersion: String(trek.eventPolicyVersion || ''), nextEventDistance: Number(trek.nextEventDistance || 0),
      encounterCount: Number(trek.encounterCount || 0) } : null,
    event: event ? { uid: Number(event.uid || 0), id: Number(event.id || 0), miniGameType: Number(event.miniGameType || 0),
      miniGameLevel: Number(event.miniGameLevel || 0), policyVersion: String(event.policyVersion || ''),
      trekUid: Number(event.trekUid || 0), createdAt: Number(event.createdAt || 0), deadline,
      deadlineExpired: deadline > 0 && deadline < now, puzzleBoardLength: Array.isArray(event.puzzleBoard) ? event.puzzleBoard.length : 0,
      enemySnapshot: !!event.enemySnapshot } : null,
    pendingEvent: !!event, eventLogCount: eventLog.length, ledgerCount: ledger.length,
    endCache: !!info.endCache, lastEndCache: !!info.lastEndCache,
  };
}
function anomaly(row) {
  const s = row.state, a=[];
  if (s.pendingEvent && !s.trek) a.push('EVENT_WITHOUT_TREK');
  if (s.pendingEvent && s.event.trekUid !== s.trek.uid) a.push('EVENT_TREK_UID_MISMATCH');
  if (s.pendingEvent && s.event.season !== undefined && s.event.season !== s.season) a.push('EVENT_SEASON_MISMATCH');
  if (s.pendingEvent && s.event.deadlineExpired) a.push('EVENT_DEADLINE_EXPIRED');
  if (s.pendingEvent && s.event.policyVersion && s.trek.eventPolicyVersion && s.event.policyVersion !== 'compatible-approximation-20260921-v1') a.push('EVENT_POLICY_UNKNOWN');
  if (s.sailing && !s.trek) a.push('SAILING_WITHOUT_TREK');
  if (!s.sailing && s.trek) a.push('TREK_WITHOUT_SAILING');
  if (s.endCache && s.trek) a.push('END_CACHE_WITH_TREK');
  return a;
}
async function inspect(proc) {
  const env = { ...envFile, ...(proc.pm2_env && proc.pm2_env.env || {}) };
  const uri = env.MONGO_URI; if (!uri) throw new Error('MONGO_URI_MISSING:' + proc.name);
  const dbName = String(uri).split('/').pop().split('?')[0];
  if (!/^lhs_s100[1-6]$/.test(dbName)) throw new Error('UNEXPECTED_DB:' + dbName);
  const mongo = new MongoClient(uri, { serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000, socketTimeoutMS: 10000, maxPoolSize: 1 });
  await mongo.connect();
  try {
    const db = mongo.db(dbName);
    const rows = await db.collection('players').find({ 'other_attr_info.oldTrekInfo': { $exists: true } }, {
      projection: { _id: 0, userId: 1, playerId: 1, level: 1, 'other_attr_info.oldTrekInfo': 1 }, maxTimeMS: 5000,
    }).limit(5000).toArray();
    const summaries = rows.map(p => { const row={identity:digest(p.userId || p.playerId), level:Number(p.level||0), state:summary(p.other_attr_info && p.other_attr_info.oldTrekInfo || {})}; row.anomalies=anomaly(row); return row; });
    const counts = { total: summaries.length, sailing: summaries.filter(x=>x.state.sailing).length,
      pendingEvent:summaries.filter(x=>x.state.pendingEvent).length, endCache:summaries.filter(x=>x.state.endCache).length,
      eventExpired:summaries.filter(x=>x.state.event && x.state.event.deadlineExpired).length,
      anomaly:summaries.filter(x=>x.anomalies.length).length,
      anomalyKinds:Object.fromEntries([...new Set(summaries.flatMap(x=>x.anomalies))].map(k=>[k,summaries.filter(x=>x.anomalies.includes(k)).length])),
      eventTypes:Object.fromEntries([...new Set(summaries.filter(x=>x.state.event).map(x=>x.state.event.miniGameType))].map(k=>[String(k),summaries.filter(x=>x.state.event && x.state.event.miniGameType===k).length])),
      eventIds:Object.fromEntries([...new Set(summaries.filter(x=>x.state.event).map(x=>x.state.event.id))].map(k=>[String(k),summaries.filter(x=>x.state.event && x.state.event.id===k).length])),
      policyVersions:Object.fromEntries([...new Set(summaries.filter(x=>x.state.event).map(x=>x.state.event.policyVersion))].map(k=>[String(k),summaries.filter(x=>x.state.event && x.state.event.policyVersion===k).length])),
    };
    return { name:proc.name, db:dbName, serverId:Number(env.SERVER_ID||proc.name.slice(-4)), status:proc.pm2_env.status, pid:proc.pid, restarts:proc.pm2_env.restart_time, counts,
      anomalies:summaries.filter(x=>x.anomalies.length).slice(0,50), pending:summaries.filter(x=>x.state.pendingEvent).slice(0,50) };
  } finally { await mongo.close(); }
}
(async()=>{const rows=[];for(const p of processes)rows.push(await inspect(p));const result={at:new Date().toISOString(),readOnly:true,directPlayerWrites:0,now,rows};fs.writeFileSync('/tmp/oldtrek_live_audit_20261001.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));})().catch(e=>{console.error(e.stack);process.exitCode=1;});
