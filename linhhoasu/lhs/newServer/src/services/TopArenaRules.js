'use strict';
// Pure rules. State/payment/replay persistence belongs to TopArenaService.
const crypto = require('crypto');
const DAY = 86400000, HOUR = 3600000, OFFSET = 7 * HOUR;
const clone = value => JSON.parse(JSON.stringify(value));
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const error = code => Object.assign(new Error(code), { code: 'TOP_ARENA_' + code });
function integer(value, min, max) {
  if (!Number.isSafeInteger(Number(value)) || Number(value) < min || Number(value) > max) throw error('INVALID_ARGUMENT');
  return Number(value);
}
function dayStart(now) { return Math.floor((now + OFFSET) / DAY) * DAY - OFFSET; }
function timeline(cycle, tables) {
  if (!cycle) return null;
  const template = Object.values(tables.TopArenaOpenConfig || {}).filter(r => Number(r.area) === 1).sort((a,b)=>a.id-b.id)[0];
  if (!template || ![64,512].includes(template.matchMode)) throw error('CONFIG_MISSING');
  const at = k => cycle.startTime + Number(template[k]) - Number(template.startTime);
  const base = tables.TopArenaBaseConfig;
  if (!base || base.roundFightTime?.length !== 3) throw error('CONFIG_MISSING');
  const count = template.matchMode === 512 ? 3 : 2;
  const rounds = Array.from({length:count}, (_,round) => {
    const start = at('promotionStartTime') + round * DAY;
    const times = base.roundFightTime.map(seconds => dayStart(start) + seconds * 1000 + (dayStart(start) + base.roundFightTime[0] * 1000 < start ? DAY : 0));
    return { round, mode: template.matchMode / 8 ** round, start, times,
      guessStart: Math.max(start, dayStart(times[0]) + base.roundGuessTime[0]*1000),
      guessEnd: dayStart(times[0]) + base.roundGuessTime[1]*1000 };
  });
  const settleTime = Math.max(at('settleTime'), rounds.at(-1).times[2] + base.battleLastTime*1000);
  if (settleTime >= cycle.endTime || rounds.some(r=>r.guessEnd>=r.times[0] || r.guessStart>=r.guessEnd)) throw error('TIMELINE_INVALID');
  return {...cycle,matchId:30000+cycle.index,matchMode:template.matchMode,
    promotionStartTime:at('promotionStartTime'), auditionEndTime:at('promotionStartTime')-HOUR,
    attrsLockTime:at('attrsLockTime'),gamePassStartTime:at('gamePassStartTime'),settleTime,rounds,
    matchConfig:{...template,id:30000+cycle.index,startTime:cycle.startTime,endTime:cycle.endTime,
      promotionStartTime:at('promotionStartTime'),attrsLockTime:at('attrsLockTime'),gamePassStartTime:at('gamePassStartTime'),settleTime}};
}
function phase(t,now) {
  if (!t || now<t.startTime || now>=t.endTime) return {stage:0,round:-1,step:0};
  if (now<t.promotionStartTime) return {stage:1,round:0,step:0};
  if (now>=t.settleTime) return {stage:6,round:t.rounds.length,step:3};
  const r=t.rounds.filter(r=>now>=r.start).at(-1);
  const step=r.times.filter(at=>now>=at).length;
  return {stage:step?5:now>=r.guessStart&&now<r.guessEnd?3:r.mode===8?4:2,round:r.round,step};
}
function blank(cycle,t) { return {_id:cycle.key,revision:0,version:3,cycle,timeline:t,players:{},rooms:[],frozen:false,pending:null,settled:false}; }
function rankPlayers(s) { return Object.values(s.players).sort((a,b)=>a.rank-b.rank||a.joinedAt-b.joinedAt||a.id.localeCompare(b.id)); }
function room(s,round,id) { const r=s.rooms.find(r=>r.round===round&&r.roomId===id);if(!r)throw error('ROOM_INVALID');return r; }
function makeRooms(s,round,participants) {
  const slots=s.timeline.matchMode/8**round, count=slots/8;
  // Snake seeding puts top qualifiers in different rooms; empty slots are byes.
  const lists=Array.from({length:count},()=>Array(8).fill(null));
  participants.forEach((id,i)=>{const col=Math.floor(i/count),row=col%2?count-1-i%count:i%count;lists[row][col]=id;});
  for(let i=0;i<count;i++)s.rooms.push({round,roomId:i+1,slots:lists[i],alive:lists[i],step:0,wins:{},playBacks:{},winner:'',pools:{}});
}
function rankReward(table,rank) {
  const rows=Object.values(table||{}).filter(r=>rank>=r.rankMin&&rank<=r.rankMax);
  if(rows.length>1)throw error('REWARD_OVERLAP');
  return clone(rows[0]?.rewards||[]);
}
function passPlan(p,entry,t,tables,now) {
  if(now<t.gamePassStartTime)throw error('PASS_NOT_OPEN');
  const day=1+Math.floor((dayStart(now)-dayStart(t.gamePassStartTime))/DAY), rows=Object.values(tables.TopArenaPassConfig[t.matchMode]||{});
  const paid=p.rechargeInfo?.topArenaPasses?.[t.key]===true;
  const records={...entry.passRecord},rewards=[];
  for(const r of rows){if(r.day>day)continue;let bits=records[r.day]||0;
    if(!(bits&1)){rewards.push(...r.rewards);bits|=1;}
    if(paid&&!(bits&2)){rewards.push(...r.eRewards);bits|=2;}
    records[r.day]=bits;
  }
  if(!rewards.length)throw error('PASS_ALREADY_CLAIMED');
  return {records,rewards,paid};
}
function guessPayout(bet,room,base) {
  const total=Object.values(room.pools).reduce((n,x)=>n+x,0), selected=room.pools[bet.target]||0;
  const odds=selected>0?Math.floor(Math.max(base.minGuessOdds,Math.min(base.maxGuessOdds,(10000-base.guessCut)*total/selected))/100)/100:0;
  const won=room.winner===bet.target;
  const ratio=won?odds:(bet.paid?base.passGuessFailReturn:base.guessFailReturn)/10000;
  const amount=Math.round(bet.count*base.guessExchange*ratio);
  if(!Number.isSafeInteger(amount)||amount<0)throw error('PAYOUT_INVALID');
  return {won,odds,amount};
}
module.exports={DAY,HOUR,clone,hash,error,integer,dayStart,timeline,phase,blank,rankPlayers,room,makeRooms,rankReward,passPlan,guessPayout};
