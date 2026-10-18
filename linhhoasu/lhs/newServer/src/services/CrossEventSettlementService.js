'use strict';
const crypto = require('crypto');
const schedule = require('../config/crossServerEventSchedule.json');
const cross = require('./CrossServerEventService');
const gameDay = require('./GameDayService');
const DAY = 86400000, HOUR = 3600000;
const sha = v => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
function rewardsFor(event, rank, config, period = 'cycle') {
  const name = event === 'crossRival' ? 'CrossRivalScoreRankRewardConfig'
    : event === 'crossArena' ? (period === 'day' ? 'CrossArenaDayRankRewardConfig' : 'CrossArenaWeeklyRankRewardConfig') : 'TopArenaBattleRankRewardConfig';
  const table = config.get(name);
  if (!table || !Object.keys(table).length) throw Error('CROSS_REWARD_CONFIG_MISSING');
  const rows = Object.values(table).filter(r => rank >= Number(r.rankMin || 0) && rank <= Number(r.rankMax || 0));
  if (rows.length > 1) throw Error('CROSS_REWARD_OVERLAP');
  return (rows[0]?.rewards || []).map(r => ({id:Number(r.id),count:Number(r.count)}))
    .filter(r => Number.isSafeInteger(r.id)&&r.id>0&&Number.isSafeInteger(r.count)&&r.count>0);
}
function dueWindows(from, now, limit = 32) {
  const anchor = Date.parse(schedule.anchor), period = Number(schedule.periodDays)*DAY;
  const until = now-Math.max(0,Number(schedule.settlementGraceMs)||0);
  if (!schedule.enabled || until<anchor || !Number.isFinite(from)) return [];
  const result=[], cap=Math.max(1,Number(limit)||32);
  function add(cycle) {
    // V3 TopArena settles the frozen bracket, popularity and predictions in
    // its own durable ledger. Legacy rotation receipts remain untouched.
    if(cycle.event==='topArena' && schedule.independent?.topArena && cycle.key.startsWith('W_topArena_'))return;
    if(cycle.event==='crossArena')for(let cutoffAt=gameDay.end(cycle.startTime)-HOUR;cutoffAt<cycle.endTime;cutoffAt+=DAY) {
      if(cutoffAt>cycle.startTime&&cutoffAt>=from&&cutoffAt<=until)result.push({cycle,period:'day',cutoffAt});
    }
    if(cycle.endTime>=from&&cycle.endTime<=until)result.push({cycle,period:'cycle',cutoffAt:cycle.endTime});
  }
  for(let i=Math.max(0,Math.floor((from-anchor)/period)-1),count=0;anchor+i*period<=until&&count<=cap;i++,count++) {
    const cycle=cross.cycleAt(anchor+i*period); if(!cycle)break;
    add(cycle);
  }
  for(const [event,track] of Object.entries(schedule.independent||{})) {
    let cycle=cross.cycleFor(event,Math.max(from-1,Date.parse(track.activationAt),Date.parse(track.anchor)));
    for(let count=0;cycle&&cycle.startTime<=until&&count<=cap;count++) {
      add(cycle);cycle=cross.cycleFor(event,cycle.endTime);
    }
  }
  result.sort((a,b)=>a.cutoffAt-b.cutoffAt||a.cycle.event.localeCompare(b.cycle.event));
  // A page must contain the whole cutoff group, even when it exceeds the cap.
  const last=result[cap-1]?.cutoffAt??Infinity;
  return result.filter(w=>w.cutoffAt<=last);
}
function createService(deps={}) {
  const Settlement=deps.Settlement||require('../db/models/CrossEventSettlement');
  const Mail=deps.Mail||require('../db/models/Mail'),Player=deps.Player||require('../db/models/Player');
  const config=deps.config||require('./ConfigService'),clock=deps.clock||Date.now;
  const serverId=Number(deps.serverId||process.env.SERVER_ID);
  const loadRoster=deps.loadRoster||(async(cycle,cutoffAt)=>cycle.event==='crossArena'
    ?require('./CrossArenaService').finalRoster(cycle,cutoffAt)
    :(await cross.top(cycle.event,cycle,10000)).map((r,i)=>({...r,rank:i+1})));
  async function settleWindow(window,now=clock()) {
    const {cycle,cutoffAt,period}=window,valid=cross.cycleFor(cycle?.event,cycle?.startTime);
    if(!valid||valid.key!==cycle.key||valid.event!==cycle.event||valid.endTime!==cycle.endTime||valid.index!==cycle.index||cycle.index<0
      ||!dueWindows(cutoffAt,cutoffAt+Number(schedule.settlementGraceMs||0)).some(w=>w.cycle.key===cycle.key&&w.cutoffAt===cutoffAt&&w.period===period))throw Error('CROSS_CUTOFF_INVALID');
    if(now<cutoffAt+Number(schedule.settlementGraceMs||0))return{skipped:'NOT_DUE'};
    const storageKey=period==='day'?`${cycle.key}:day:${gameDay.key(cutoffAt)}`:cycle.key;
    const id=`cross_${cycle.event}_${storageKey}`;
    let frozen=await Settlement.findById(id).lean();
    if(!frozen) {
      const entries=await loadRoster(cycle,cutoffAt),seen=new Set();
      if(!Array.isArray(entries)||entries.length>10000)throw Error('CROSS_ROSTER_LIMIT');
      const recipients=entries.map((r,i)=>{
        if(!r.playerId||!r.userId||!cross.isServerAllowed(r.serverId)||seen.has(String(r.playerId))
          ||!Number.isFinite(Number(r.score))||(r.rank!=null&&r.rank!==i+1))throw Error('CROSS_ROSTER_INVALID');
        seen.add(String(r.playerId));
        const eventKey=`cross:${storageKey}:${cycle.event}:${r.playerId}`;
        return{playerId:String(r.playerId),userId:String(r.userId),name:String(r.name||''),serverId:Number(r.serverId),rank:i+1,score:Number(r.score),
          attachments:rewardsFor(cycle.event,i+1,config,period),eventKey,mailId:sha([storageKey,cycle.event,r.playerId]).slice(0,24)};
      });
      if(Buffer.byteLength(JSON.stringify(recipients))>8*1024*1024)throw Error('CROSS_ROSTER_LIMIT');
      try{await Settlement.create({_id:id,cycleKey:storageKey,sourceCycleKey:cycle.key,event:cycle.event,period,cutoffAt,
        snapshotHash:sha(recipients),recipients,delivered:[],expired:[],state:'pending'});}catch(e){if(e.code!==11000)throw e;}
      frozen=await Settlement.findById(id).lean();
    }
    if(!frozen||frozen.snapshotHash!==sha(frozen.recipients))throw Error('CROSS_SNAPSHOT_INVALID');
    return deliverCycle(id,now);
  }
  async function deliverCycle(id,now=clock()) {
    const frozen=await Settlement.findById(id).lean();if(!frozen)return{skipped:'MISSING'};
    if(frozen.snapshotHash!==sha(frozen.recipients))throw Error('CROSS_SNAPSHOT_INVALID');
    let delivered=0;
    for(const r of frozen.recipients||[]) {
      if(r.serverId!==serverId||(frozen.delivered||[]).includes(r.playerId)||(frozen.expired||[]).includes(r.playerId))continue;
      if(r.attachments.length&&now<frozen.cutoffAt+30*DAY) {
        let existing=await Mail.findById(r.mailId).lean();
        if(!existing) {
          const claimed=await Player.findOne({userId:r.userId,mailClaimLedger:r.mailId}).select({_id:1}).lean();
          if(!claimed) {
            const label=frozen.event==='crossArena'?'Đỉnh Phong Diễn Võ':frozen.event,content=`Hạng ${r.rank}, điểm ${r.score}.`;
            try{existing=await Mail.create({_id:r.mailId,userId:r.userId,eventKey:r.eventKey,batchId:id,
              title:`Phần thưởng ${label} ${frozen.period==='day'?'ngày':'kỳ'}`,content,text:content,sender:'Hệ thống',
              attachments:r.attachments,targetServerId:serverId,expireAt:new Date(frozen.cutoffAt+30*DAY)});}
            catch(e){if(e.code!==11000)throw e;existing=await Mail.findById(r.mailId).lean();}
          }
        }
        if(existing&&(existing.userId!==r.userId||existing.eventKey!==r.eventKey||Number(existing.targetServerId)!==serverId
          ||sha(existing.attachments)!==sha(r.attachments)))throw Error('CROSS_MAIL_COLLISION');
        if(existing && Number(r.rank)<=3 && deps.publicNotify) {
          try { await deps.publicNotify({eventKey:id+':'+frozen.event,playerId:r.playerId,userId:r.userId,name:r.name,serverId:r.serverId,rank:r.rank,score:r.score,event:frozen.event}); } catch (_) { /* notification cannot block delivery */ }
        }
      }
      const field=r.attachments.length&&now>=frozen.cutoffAt+30*DAY?'expired':'delivered';
      await Settlement.updateOne({_id:id},{$addToSet:{[field]:r.playerId}}).exec();delivered++;
    }
    const done=await Settlement.findById(id).lean(),complete=new Set([...(done.delivered||[]),...(done.expired||[])]);
    if((done.recipients||[]).every(r=>complete.has(r.playerId)))await Settlement.updateOne({_id:id},{$set:{state:'done',completedAt:now}}).exec();
    return{id,delivered,localDone:(done.recipients||[]).filter(r=>r.serverId===serverId).every(r=>complete.has(r.playerId)),
      state:complete.size>=(done.recipients||[]).length?'done':'pending'};
  }
  async function tick() {
    if(!cross.isServerAllowed(serverId))return[];
    const id=`cross_scheduler_${serverId}`,cursor=await Settlement.findById(id).lean();
    const start=Math.max(Date.parse(schedule.anchor),Number(cursor?.cursorAt||0)+1),results=[];
    const windows=dueWindows(start,clock());
    for(let i=0;i<windows.length;) {
      const cutoffAt=windows[i].cutoffAt;let localDone=true;
      do {const r=await settleWindow(windows[i++]);results.push(r);localDone=localDone&&r.localDone;}
      while(i<windows.length&&windows[i].cutoffAt===cutoffAt);
      if(!localDone)break;
      await Settlement.updateOne({_id:id},{$setOnInsert:{cycleKey:`cursor_${serverId}`,event:'cursor',state:'pending'},
        $max:{cursorAt:cutoffAt}},{upsert:true}).exec();
    }
    return results;
  }
  function start() {
    let running=false;
    const run=async()=>{if(running)return;running=true;try{await tick();}catch(e){(deps.logger||require('../logger')).warn(`[CrossEvent] settlement: ${e.message}`);}finally{running=false;}};
    const timer=setInterval(()=>{void run();},30000);timer.unref?.();void run();
    return{tick,stop:()=>clearInterval(timer)};
  }
  return{settleWindow,deliverCycle,tick,start,settleCycle:(cycle,_config,now=clock())=>settleWindow({cycle,period:'cycle',cutoffAt:cycle.endTime},now)};
}
module.exports={createService,dueWindows,rewardsFor,settleCycle:(...a)=>createService().settleCycle(...a),deliverCycle:(...a)=>createService().deliverCycle(...a)};
