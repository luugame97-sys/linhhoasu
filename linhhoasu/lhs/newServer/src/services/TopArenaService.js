'use strict';
const R=require('./TopArenaRules');
const TAGS=new Set([2350,6200,6201,6202,6203,6210,6211,6212,6213,6214,6215,6216,6217,6218,6220,6221]);
const MUTATIONS=new Set([2350,6201,6202,6213,6216,6218,6220]);
function createService(deps={}) {
  const repo=deps.repo||require('./TopArenaRepository').createRepository();
  const config=deps.config||require('./ConfigService');
  const cross=deps.cross||require('./CrossServerEventService');
  const players=deps.players||require('./PlayerService');
  const mutation=deps.mutation||require('./PlayerMutationService');
  const runtime=deps.runtime||require('./RuntimeBus');
  const clock=deps.clock||Date.now;
  const detail=deps.detail||((p,sid)=>require('../handlers/basic').buildOtherPlayerDetail(p,{serverId:sid},0));
  const view=deps.view||((p,sid)=>{const v=require('./ArenaReadModelService').buildPlayerView(p,sid);return {show:v.publicRow,attrs:v.attrs,parts:v.playerSnapshot.parts,partValues:v.playerSnapshot.partValues};});
  const helpers=()=>require('../handlers/arena').competitionHelpers;
  const battle=deps.battle||((a,b)=>{
    const f=require('./BattleService').simulateBattle(a.attrs,b.attrs,{isPvp:true});
    const player={...a.show,_id:a.show.dbid,playerId:a.show.dbid,userId:a.userId,roleInfo:{kungfuId:a.show.kungfuId,subJob:a.show.subJob}};
    const result=helpers().buildCompetitionFightResult(player,{...b.show,parts:b.parts,partValues:b.partValues},a.attrs,b.attrs,f,2,a.show.serverId);
    result.entitys[0].showInfo=R.clone(a.show);result.entitys[0].parts=R.clone(a.parts||{});result.entitys[0].partValues=R.clone(a.partValues||{});
    return result;
  });
  const tables=()=>Object.fromEntries(['TopArenaOpenConfig','TopArenaBaseConfig','TopArenaPassConfig','TopArenaRobotConfig','TopArenaRobotRuleConfig','TopArenaAuditionMatchRangeConfig','TopArenaBattleRankRewardConfig','TopArenaBetRankRewardConfig','TopArenaHotRankRewardConfig'].map(k=>[k,config.get(k)||{}]));
  const sid=Number(deps.serverId||process.env.SERVER_ID||1001);
  const localPlayer=uid=>runtime.getWsServer()?.getPlayerForMutation?.(uid);
  function publicInfo(s,p,now){
    const phase=R.phase(s.timeline,now),e=s.players[String(p._id)];
    return {info:{...phase,season:s.cycle.index+1,matchId:s.timeline.matchId,startTime:s.cycle.startTime,endTime:s.cycle.endTime,cycleKey:s._id},
      playerInfo:{round:e?.round??-1,pass:p.rechargeInfo?.topArenaPasses?.[s._id]?1:0,passRecord:e?.passRecord||{},lockTime:e?.lockTime||0},
      challengeInfo:challenge(s,e),cycleKey:s._id,result:0};
  }
  function robot(rank){
    const t=tables(),rule=Object.values(t.TopArenaRobotRuleConfig).find(r=>rank>=r.rankMin&&rank<=r.rankMax);
    if(!rule)throw R.error('ROBOT_CONFIG');
    const id=rule.robotId[(rank-rule.rankMin)%rule.robotId.length],cfg=t.TopArenaRobotConfig[id];
    if(!cfg?.robotAttrs?.[1])throw R.error('ROBOT_CONFIG');
    const fashionMap={};for(const f of cfg.robotShow||[]){const row=config.get('FashionConfig')?.[f];if(row)fashionMap[row.type]=f;}
    return {id:String(id),rank,attrs:R.clone(cfg.robotAttrs),show:{dbid:String(id),playerId:String(id),name:deps.robotName?.(cfg.name)||`Đấu sĩ ${id}`,serverId:0,serverName:'NPC',level:cfg.robotLv,kungfuId:4,subJob:0,avatar:11300,avatarFrame:-1,title:-1,petId:cfg.fightPet?.[0]||0,fashionMap,equipMap:{},power:deps.power?deps.power(cfg.robotAttrs):require('./ArenaReadModelService').displayPower(cfg.robotAttrs),isRobot:true},isRobot:true};
  }
  function picks(s,e,seed){
    if(!e)return [];
    const t=tables(),rule=Object.values(t.TopArenaAuditionMatchRangeConfig).find(r=>Math.min(e.rank,999)>=r.rankMin&&Math.min(e.rank,999)<=r.rankMax),gap=Number(rule?.rankGap||1);
    const taken=new Set(),list=[];
    for(let i=0;i<t.TopArenaBaseConfig.auditionMatchEnemyNum;i++){
      let n=e.rank===1?i+2:Math.max(1,Math.min(999,e.rank-1)-(parseInt(R.hash([seed,i]).slice(0,8),16)%gap));
      while(taken.has(n)&&n>1)n--;if(n===e.rank||taken.has(n))continue;taken.add(n);
      const target=Object.values(s.players).find(p=>p.rank===n&&p.id!==e.id);
      const r=target||robot(n);list.push({id:r.id,rank:n,revision:r.revision||0,robot:!target});
    }
    return list;
  }
  function challenge(s,e){
    const base=tables().TopArenaBaseConfig,infoMap={},challengeList=[];
    for(const x of e?.challenge||[]){const target=x.robot?robot(x.rank):s.players[x.id];if(!target||target.rank!==x.rank)continue;infoMap[x.rank]=R.clone(target.show);challengeList.push(x.rank);}
    for(const r of [1,2,3]){const target=Object.values(s.players).find(x=>x.rank===r)||robot(r);infoMap[r]=R.clone(target.show);}
    if(e)infoMap[e.rank]=R.clone(e.show);
    return {rank:e?.rank||base.auditionInitialRank,refreshtime:Math.floor((e?.refreshAt||0)/1000),challengeList,infoMap,challengeVersion:e?.challengeVersion||''};
  }
  async function season(cycle){
    let s=await repo.get(cycle.key);if(s)return s;
    if(cycle.index>0){const pending=await repo.seasons();if(pending.some(s=>s.cycle.startTime<cycle.startTime))throw R.error('SETTLEMENT_PENDING');}
    return repo.create(R.blank(cycle,R.timeline(cycle,tables())));
  }
  async function gate(session){
    if(!session?.player||!session.userId||session._isBot)throw R.error('SESSION_INVALID');
    const cycle=cross.cycleFor('topArena',clock());if(!cycle)throw R.error('CLOSED');
    const server=await (deps.getServer||require('./ServerConfigService').findServerConfig)(session.serverId||sid);
    if(!server||server.running===false||server.openTime>clock()||!cross.isServerAllowed(session.serverId||sid))throw R.error('LOCKED');
    const day=1+Math.floor((R.dayStart(clock())-R.dayStart(Number(server.openTime)))/R.DAY);
    const conditions=config.get('SystemConfig')?.[322]?.conditions;
    if(!conditions?.length||conditions.some(c=>c.cond!==4||(c.type===3?session.player.level:c.type===5?day:-1)<c.value))throw R.error('LOCKED');
    return cycle;
  }
  async function syncEconomy(session,op){
    if(Number(op.serverId)!==sid)throw R.error('SYNC_PENDING');
    await players.drainPendingSaves?.(op.userId);
    const p=localPlayer(op.userId)||session?.player||await players.loadPlayer(op.userId);
    if(!p||String(p._id)!==op.actor)throw R.error('PLAYER_MISSING');
    if((p.topArenaV3?.receipts||[]).includes(op._id)){if(session)session.player=p;return p;}
    const next=R.clone(p),expected={};
    for(const k of ['topArenaV3','items','currencies'])if(k in p)expected[k]=R.clone(p[k]);
    next.items||={};next.currencies||={};
    for(const cost of op.costs){const currency={1:'diamond',2:'silver',6:'gold'}[cost.id];const have=Number(currency?next.currencies[currency]:next.items[cost.id])||0;
      if(have<cost.count)throw R.error('NOT_ENOUGH');if(currency)next.currencies[currency]=have-cost.count;next.items[cost.id]=have-cost.count;}
    for(const reward of op.rewards){const currency={1:'diamond',2:'silver',6:'gold'}[reward.id];if(currency){next.currencies[currency]=(Number(next.currencies[currency])||0)+reward.count;next.items[reward.id]=next.currencies[currency];}else next.items[reward.id]=(Number(next.items[reward.id])||0)+reward.count;}
    next.topArenaV3={...next.topArenaV3,cycleKey:op.cycle,receipts:[...(next.topArenaV3?.receipts||[]),op._id].slice(-64)};
    try{if(!await players.savePlayer(op.userId,next,{returnSaved:false,onlyFields:['topArenaV3','items','currencies'],topArenaCAS:expected}))throw R.error('SAVE_CONFLICT');}
    catch(err){runtime.getWsServer()?.invalidatePlayerForMutation?.(op.userId);if(session)session.player=null;throw R.error('COMMIT_UNKNOWN');}
    const live=localPlayer(op.userId);if(live)for(const k of ['topArenaV3','items','currencies'])live[k]=next[k];
    if(session)session.player=live||next;return live||next;
  }
  async function recover(s,session){
    if(!s.pending)return s;
    const op=s.pending,stored=await repo.putAction(op);
    if(stored.status==='failed'){
      const aborted=R.clone(s);aborted.pending=null;if(!await repo.cas(s,aborted))throw R.error('RETRY');return aborted;
    }
    if(op.phase!=='applied'){
      const durable=await repo.economyReceipt(op.serverId,op.userId,op._id);
      if(!durable){
        if(op.serverId!==sid||session?.userId&&session.userId!==op.userId)throw R.error('SYNC_PENDING');
        try{await syncEconomy(session,op);}catch(err){
          if(err.code==='TOP_ARENA_NOT_ENOUGH'){
            // No debit receipt exists; abort rather than blocking the whole season.
            await repo.failAction(op._id,err.code);
            const aborted=R.clone(s);aborted.pending=null;if(!await repo.cas(s,aborted))throw R.error('RETRY');
          }
          throw err;
        }
      }
      const applied=R.clone(s);Object.assign(applied.players,op.entries);applied.pending.phase='applied';
      if(!await repo.cas(s,applied))return recover(await repo.get(s._id),session);s=applied;
    }
    // Do not release the prepared slot until the permanent receipt is done.
    await repo.complete(op._id,op.response);
    const done=R.clone(s);done.pending=null;
    if(!await repo.cas(s,done))return recover(await repo.get(s._id),session);return done;
  }
  async function join(s,p){
    const id=String(p._id);if(s.players[id])return s;
    if(Object.keys(s.players).length>=2000)throw R.error('SEASON_CAPACITY');
    const next=R.clone(s),v=view(p,p.serverId||sid),used=new Set(Object.values(s.players).map(x=>x.rank));
    let rank=tables().TopArenaBaseConfig.auditionInitialRank;while(used.has(rank))rank++;
    const e=next.players[id]={...v,id,userId:p.userId,serverId:Number(p.serverId||sid),joinedAt:clock(),rank,revision:0,round:-1,hot:0,betProfit:0,passRecord:{},bets:[],worship:false,refreshAt:0};
    e.qualifiedEntry=clock()<s.timeline.auditionEndTime;
    e.challengeVersion=R.hash([s._id,id,'join']).slice(0,24);e.challenge=e.qualifiedEntry?picks(next,e,e.challengeVersion):[];
    if(!await repo.cas(s,next))throw R.error('RETRY');return next;
  }
  async function commit(s,session,tag,params,plan){
    const id=String(params.requestId||'');if(!/^[A-Za-z0-9:_-]{12,160}$/.test(id))throw R.error('REQUEST_REQUIRED');
    const actor=String(session.player._id),key=R.hash([s._id,actor,id]);
    const fingerprint=R.hash([tag,params]),old=await repo.action(key);
    if(old){if(old.fingerprint!==fingerprint)throw R.error('REQUEST_CONFLICT');if(old.status==='done')return old.response;throw R.error('SYNC_PENDING');}
    // All economy validation precedes the durable preparation. Prepared operations
    // are never timed out/re-rolled; only the owning node reconciles their debit.
    for(const c of plan.costs){const currency={1:'diamond',2:'silver',6:'gold'}[c.id],have=Number(currency?session.player.currencies?.[currency]:session.player.items?.[c.id])||0;if(have<c.count)throw R.error('NOT_ENOUGH');}
    const op={_id:key,cycle:s._id,actor,serverId:Number(session.serverId||sid),userId:session.userId,kind:String(tag),at:clock(),fingerprint,status:'pending',...plan};
    const prepared=R.clone(s);prepared.pending=op;
    if(!await repo.cas(s,prepared))throw R.error('RETRY');
    await recover(prepared,session);return op.response;
  }
  async function advance(s){
    if(s.pending)throw R.error('SYNC_PENDING');
    const now=clock(),next=R.clone(s),t=next.timeline;
    if(now>=t.auditionEndTime&&!next.frozen){
      const entrants=R.rankPlayers(next).filter(e=>e.qualifiedEntry&&e.rank<=t.matchMode).slice(0,t.matchMode);
      for(const e of entrants){const p=await repo.profile(e.serverId,e.userId);if(!p)throw R.error('PROFILE_UNAVAILABLE');Object.assign(e,view(p,e.serverId));e.round=0;e.qualifierRank=e.rank;}
      R.makeRooms(next,0,entrants.map(e=>e.id));next.frozen=true;
    }
    if(next.frozen && !next.attrsLocked && now>=t.attrsLockTime){
      for(const e of Object.values(next.players).filter(e=>e.qualifierRank!=null)){
      if(!e.lockTime){const p=await repo.profile(e.serverId,e.userId);if(!p)throw R.error('PROFILE_UNAVAILABLE');Object.assign(e,view(p,e.serverId));await repo.lockProfile(next._id,e.id,detail(p,e.serverId));e.lockTime=Math.floor(t.attrsLockTime/1000);}
      }
      next.attrsLocked=true;
    }
    for(const round of t.rounds){
      if(!next.frozen||now<round.times[0])continue;
      let rooms=next.rooms.filter(r=>r.round===round.round);
      if(!rooms.length)continue;
      if(!next.attrsLocked){
        for(const id of [...new Set(rooms.filter(r=>r.step<3).flatMap(r=>r.alive).filter(Boolean))]){
          if(next.players[id].lockTime)continue;const p=await repo.profile(next.players[id].serverId,next.players[id].userId);
          if(!p)throw R.error('PROFILE_UNAVAILABLE');Object.assign(next.players[id],view(p,next.players[id].serverId));
        }
      }
      for(const room of rooms)while(room.step<3&&now>=round.times[room.step]){
        const alive=[];
        for(let i=0;i<room.alive.length;i+=2){const a=room.alive[i],b=room.alive[i+1];let winner=a||b||null,loser;
          if(a&&b){const key='ta3_'+R.hash([next._id,room.round,room.roomId,room.step,i]).slice(0,40);
            let replay=await repo.getReplay(key);
            if(!replay)replay=await repo.replay(key,{cycle:next._id,fightResult:battle(next.players[a],next.players[b]),a,b});
            winner=replay.fightResult.win?a:b;loser=winner===a?b:a;
            // Native bracket identifies a playback by round*1000 + slot*100 + step*10 (+ winner side).
            for(const id of [a,b]){const slot=room.slots.indexOf(id);room.playBacks[room.round*1000+slot*100+room.step*10+(id===winner?1:0)]=key;}
          }
          if(winner){room.wins[winner]=(room.wins[winner]||0)+1;next.players[winner].wins=(next.players[winner].wins||0)+1;}
          if(loser)next.players[loser].eliminated={round:room.round,step:room.step,rank:t.matchMode/2**(room.round*3+room.step+1)+1};
          alive.push(winner);
        }
        room.alive=alive;room.step++;
        if(room.step===3)room.winner=alive[0]||'';
      }
      if(rooms.every(r=>r.step===3)&&round.round+1<t.rounds.length&&!next.rooms.some(r=>r.round===round.round+1)){
        const winners=rooms.map(r=>r.winner).filter(Boolean);for(const id of winners)next.players[id].round=round.round+1;R.makeRooms(next,round.round+1,winners);
      }
    }
    if(R.hash(next)!==R.hash(s)){if(!await repo.cas(s,next))throw R.error('RETRY');s=next;}
    return s;
  }
  function roomData(s,round,id){const room=R.room(s,round,id);return {roomId:id,step:room.step,playerMap:Object.fromEntries(room.slots.map((id,i)=>id?[i,s.players[id].show]:null).filter(Boolean)),winCount:room.wins,playBacks:room.playBacks,winner:room.winner};}
  function guesses(s,entry,round,id){const r=R.room(s,round,id),playerGuess={};for(const b of entry?.bets||[])if(b.round===round&&b.roomId===id)playerGuess[b.target]=(playerGuess[b.target]||0)+b.count;
    return {roomGuess:Object.fromEntries(r.slots.filter(Boolean).map(id=>[id,Object.values(s.players).reduce((n,p)=>n+(p.bets||[]).filter(b=>b.round===round&&b.roomId===r.roomId&&b.target===id).reduce((n,b)=>n+b.count,0),0)])),playerGuess};}
  function ranking(s,type){const rows=Object.values(s.players).filter(e=>type===2?e.qualifierRank!=null:type===1?e.hot>0:e.betProfit>0);
    return rows.sort((a,b)=>type===2?(b.wins||0)-(a.wins||0)||a.qualifierRank-b.qualifierRank:type===1?b.hot-a.hot||a.id.localeCompare(b.id):b.betProfit-a.betProfit||a.id.localeCompare(b.id));}
  async function dispatch(tag,params={},session,msgUid){params=params||{};return mutation.run(session?.userId,async()=>{
    try{
      const cycle=await gate(session);await players.drainPendingSaves?.(session.userId);session.player=localPlayer(session.userId)||session.player;
      let s=await season(cycle);s=await recover(s,session);s=await advance(s);s=await join(s,session.player);
      const p=session.player,actor=String(p._id),e=s.players[actor],t=s.timeline,ph=R.phase(t,clock()),base=tables().TopArenaBaseConfig;
      if(params.cycleKey&&params.cycleKey!==s._id)throw R.error('STALE_CYCLE');
      if(MUTATIONS.has(tag)){
        if(!e)throw R.error('NOT_ENTERED');
        if(params.cycleKey!==s._id)throw R.error('STALE_CYCLE');
        const key=R.hash([s._id,actor,String(params.requestId||'')]),old=await repo.action(key);
        if(old){if(old.fingerprint!==R.hash([tag,params]))throw R.error('REQUEST_CONFLICT');
          if(old.status==='done')return packets(tag,msgUid,old.response,p);
          if(old.status==='failed')throw R.error('REQUEST_CANCELLED');throw R.error('SYNC_PENDING');}
        const d=R.clone(e),entries={[actor]:d},costs=[],rewards=[];let response={result:0};
        if([2350,6201,6202].includes(tag)){
          if(ph.stage!==1||clock()>=t.auditionEndTime)throw R.error('AUDITION_CLOSED');
          if(params.challengeVersion!==e.challengeVersion)throw R.error('STALE_CHALLENGE');
          if(tag===6201){if(clock()<e.refreshAt)throw R.error('REFRESH_COOLDOWN');costs.push(base.auditionRefreshCost);d.refreshAt=clock()+base.auditionRefreshTime*1000;}
          else{
            const count=tag===6202?R.integer(params.count,1,20):1;
            costs.push({id:base.auditionCost.id,count:base.auditionCost.count*count});
            // Native index is the displayed rank, not an array offset.
            const pick=tag===2350?e.challenge.find(x=>x.rank===Number(params.index)):e.challenge.find(x=>x.robot);
            if(!pick)throw R.error('TARGET_INVALID');const target=pick.robot?robot(pick.rank):s.players[pick.id];
            if(!target||target.rank!==pick.rank||(!pick.robot&&target.revision!==pick.revision)
              ||(pick.robot&&Object.values(s.players).some(x=>x.rank===pick.rank&&x.id!==actor)))throw R.error('STALE_TARGET');
            if(tag===2350&&(Number(params.type)!==51||String(params.enemyid)!==String(target.show.dbid)))throw R.error('TARGET_INVALID');
            if(!pick.robot){const current=await repo.profile(target.serverId,target.userId);if(!current)throw R.error('PROFILE_UNAVAILABLE');Object.assign(target,view(current,target.serverId));}
            const attack={...view(p,p.serverId||sid),userId:p.userId};
            if(tag===6202&&(!pick.robot||attack.show.power<target.show.power*(1+base.robotSweepRatio/10000)))throw R.error('SWEEP_UNAVAILABLE');
            const result=tag===2350?battle(attack,target):null,win=tag===6202||!!result.win;
            for(const r of win?base.auditionReward:base.auditionFailReward)rewards.push({id:r.id,count:r.count*count});
            const beforeRank=d.rank;
            if(tag===2350&&win&&target.rank<d.rank){d.rank=target.rank;if(!pick.robot){const other=R.clone(target);other.rank=beforeRank;other.revision++;entries[other.id]=other;}}
            response={result:0,count,enemyid:target.show.dbid,rank:d.rank,rankChange:beforeRank-d.rank,rewards,rewardInfo:{items:rewards},...(result?{fightResult:result}:{})};
          }
          d.revision++;d.challengeVersion=R.hash([s._id,actor,params.requestId]).slice(0,24);d.challenge=picks({...s,players:{...s.players,...entries}},d,d.challengeVersion);Object.assign(d,view(p,p.serverId||sid));
          response.challengeInfo=challenge({...s,players:{...s.players,...entries}},d);
        }else if(tag===6213){
          if(ph.stage!==3)throw R.error('GUESS_CLOSED');const round=R.integer(params.round,0,t.rounds.length-1),id=R.integer(params.roomId,1,64),count=R.integer(params.count,base.guessMinBet,base.guessMaxBet),target=String(params.playerId);
          if(round!==ph.round||clock()<t.rounds[round].guessStart||clock()>=t.rounds[round].guessEnd)throw R.error('GUESS_CLOSED');
          const room=R.room(s,round,id);if(!room.slots.includes(target)||room.step)throw R.error('TARGET_INVALID');
          const total=d.bets.filter(b=>b.round===round&&b.roomId===id).reduce((n,b)=>n+b.count,0);if(total+count>base.guessMaxBet)throw R.error('BET_LIMIT');
          costs.push({id:181,count});const paid=!!p.rechargeInfo?.topArenaPasses?.[s._id];
          const bet=d.bets.find(b=>b.round===round&&b.roomId===id&&b.target===target&&b.paid===paid);
          if(bet)bet.count+=count;else d.bets.push({round,roomId:id,target,count,paid,at:clock()});
          const other=target===actor?d:R.clone(s.players[target]);other.hot+=count;entries[target]=other;
          response.guessInfo=guesses({...s,players:{...s.players,...entries}},d,round,id);
        }else if(tag===6220){const plan=R.passPlan(p,d,t,tables(),clock());rewards.push(...plan.rewards);d.passRecord=plan.records;response={result:0,passRecord:d.passRecord,rewardInfo:{items:rewards}};
        }else if(tag===6216){if(ph.stage!==6)throw R.error('WORSHIP_CLOSED');if(d.worship)throw R.error('ALREADY_CLAIMED');d.worship=true;rewards.push(...base.supportRewards);response={result:0,worship:1,rewardInfo:{items:rewards}};
        }else if(tag===6218){if(d.lockTime||clock()>=t.attrsLockTime||!s.frozen||d.qualifierRank==null)throw R.error('ATTRS_LOCKED');Object.assign(d,view(p,p.serverId||sid));await repo.lockProfile(s._id,d.id,detail(p,p.serverId||sid));d.lockTime=Math.floor(clock()/1000);response.lockTime=d.lockTime;}
        response=await commit(s,session,tag,params,{costs,rewards,entries,response});return packets(tag,msgUid,response,session.player);
      }
      let data=publicInfo(s,p,clock());
      if(tag===6203)data={result:0,loglist:(await repo.logs(s._id,actor,'2350')).map(r=>({atk:1,rank:r.response.rank,logtime:Math.floor(r.at/1000)}))};
      if([6210,6211,6212].includes(tag)){
        const round=R.integer(params.round??Math.min(ph.round,t.rounds.length-1),0,t.rounds.length-1);if(ph.stage<=1||round>ph.round)throw R.error('ROOM_CLOSED');
        const own=s.rooms.find(r=>r.round===round&&r.slots.includes(actor));const id=R.integer(params.roomId??own?.roomId??1,1,64),room=roomData(s,round,id);
        data=tag===6212?{result:0,guessInfo:guesses(s,e,round,id),winner:room.winner,playerMap:room.playerMap}:{result:0,round,roomInfo:room};
      }
      if(tag===6214){const type=R.integer(params.type??2,1,3),rows=ranking(s,type);data={result:0,type,rank:rows.findIndex(x=>x.id===actor)+1,value:type===1?e?.hot||0:type===3?e?.betProfit||0:e?.wins||0,rankList:rows.slice(0,512).map(x=>({...x.show,value:type===1?x.hot:type===3?x.betProfit:x.wins||0}))};}
      if(tag===6215){if(ph.stage!==6)throw R.error('SHOW_CLOSED');const showMap={};for(const type of [1,2,3]){const first=ranking(s,type)[0];if(first)showMap[type]=first.show;}data={result:0,worship:e?.worship?1:0,showMap};}
      if(tag===6217){const id=String(params.playerId),entry=s.players[id]||Object.values(s.players).find(x=>x.show.playerId===id);if(!entry||entry.serverId!==Number(params.serverId))throw R.error('TARGET_INVALID');
        if(entry.lockTime){const locked=await repo.lockedProfile(s._id,entry.id);if(!locked)throw R.error('PROFILE_UNAVAILABLE');data={...locked.detail,lockTime:entry.lockTime};}
        else {const current=await repo.profile(entry.serverId,entry.userId);if(!current)throw R.error('PROFILE_UNAVAILABLE');data=detail(current,entry.serverId);}}
      if(tag===6221)data={result:0,logs:(e?.bets||[]).filter(b=>params.round==null||b.round===Number(params.round)).map(b=>({...b,supportCount:b.count,playerId:b.target,isWin:b.won?1:0,logtime:Math.floor(b.at/1000)}))};
      if(tag===6200)return [{tag,msgUid,data},{tag:6200,msgUid:0,data:{info:data.info,playerInfo:data.playerInfo}}];
      return {tag,msgUid,data};
    }catch(err){const code=String(err.code||'TOP_ARENA_UNAVAILABLE');(deps.logger||require('../logger')).warn('[TopArena] '+code);
      return {tag,msgUid,data:{result:1,code,message:'Thiên Hạ Đệ Nhất: thao tác chưa được chấp nhận. Vui lòng tải lại.',retryable:/RETRY|PENDING|UNKNOWN|UNAVAILABLE/.test(code),enemyid:'000000000000000000000000',challengeInfo:{rank:999,refreshtime:0,challengeList:[],infoMap:{}},rewardInfo:{items:[]},passRecord:{}}};}
  });}
  function packets(tag,msgUid,data,p){const items=[1,180,181,182].map(id=>({id,count:Number(id===1?p?.currencies?.diamond:p?.items?.[id])||0}));return [{tag:1202,msgUid:0,data:{result:0,items:[],changed:items}},{tag,msgUid,data}];}
  async function settle(s){
    if(s.settled||clock()<s.timeline.settleTime)return s;
    if(s.pending)throw R.error('SYNC_PENDING');
    if(s.rooms.some(r=>r.step!==3))throw R.error('BRACKET_INCOMPLETE');
    if(!s.payouts){const next=R.clone(s),base=tables().TopArenaBaseConfig,payouts=[];
      for(const e of Object.values(next.players))for(let i=0;i<e.bets.length;i++){const b=e.bets[i],r=R.room(next,b.round,b.roomId);r.pools=guesses(next,e,b.round,b.roomId).roomGuess;const pay=R.guessPayout(b,r,base);Object.assign(b,pay);e.betProfit+=pay.amount-b.count;
        payouts.push({key:'ta3:'+R.hash([s._id,e.id,'bet',i]).slice(0,48),recipient:{userId:e.userId,serverId:e.serverId},attachments:[{id:182,count:pay.amount}].filter(r=>r.count>0),title:'Thiên Hạ Đệ Nhất - Dự đoán'});}
      for(const [type,table] of [[1,'TopArenaHotRankRewardConfig'],[2,'TopArenaBattleRankRewardConfig'],[3,'TopArenaBetRankRewardConfig']]){
        const rows=ranking(next,type);rows.forEach((e,i)=>{const rank=type===2?e.eliminated?.rank||1:i+1;payouts.push({key:'ta3:'+R.hash([s._id,e.id,'rank',type]).slice(0,48),recipient:{userId:e.userId,serverId:e.serverId},attachments:R.rankReward(tables()[table],rank),title:'Thiên Hạ Đệ Nhất - BXH '+type+' hạng '+rank});});}
      next.payouts=payouts;next.payoutHash=R.hash(payouts);next.delivered=[];
      if(!await repo.cas(s,next))throw R.error('RETRY');s=next;
    }
    if(s.payoutHash!==R.hash(s.payouts))throw R.error('SNAPSHOT_INVALID');
    for(const pay of s.payouts.filter(x=>x.recipient.serverId===sid&&!s.delivered.includes(x.key))){
      await repo.settleMail(pay.recipient,pay.key,pay.attachments,pay.title,s.timeline.settleTime);
      let saved=false;for(let n=0;n<5&&!saved;n++){const current=await repo.get(s._id),next=R.clone(current);if(!next.delivered.includes(pay.key))next.delivered.push(pay.key);saved=await repo.cas(current,next);if(saved)s=next;}if(!saved)throw R.error('RETRY');
    }
    const current=await repo.get(s._id);if(current.payouts.every(p=>current.delivered.includes(p.key))){const next=R.clone(current);next.settled=true;next.completedAt=clock();await repo.cas(current,next);return next;}return current;
  }
  async function tick(){for(let s of await repo.seasons()){
    if(s.pending){if(s.pending.serverId!==sid)continue;await mutation.run(s.pending.userId,async()=>{await recover(s);});s=await repo.get(s._id);}
    try{s=await advance(s);await settle(s);}catch(e){if(!/RETRY|SYNC_PENDING/.test(e.code||''))throw e;}
  }}
  async function playback(id){if(!/^ta3_[a-f0-9]{40}$/.test(id))throw R.error('REPLAY_INVALID');const row=await repo.getReplay(id);if(!row)throw R.error('REPLAY_MISSING');return {result:0,recordId:id,fightResult:row.fightResult};}
  return {dispatch,tick,advance,settle,recover,season,playback,publicInfo,challenge,tables};
}
let instance;
const current=()=>instance||(instance=createService());
module.exports={TAGS,createService,dispatch:(...a)=>current().dispatch(...a),tick:()=>current().tick(),playback:id=>current().playback(id),
  calendar(cycle){return R.timeline(cycle,current().tables());},
  async canOpen(cycle){if(cycle.index===0)return true;const rows=await require('./TopArenaRepository').createRepository().seasons();return !rows.some(s=>s.cycle.startTime<cycle.startTime);},
  start(){let busy=false;const run=async()=>{if(busy)return;busy=true;try{await current().tick();}catch(e){require('../logger').warn('[TopArena] scheduler '+(e.code||e.message));}finally{busy=false;}};const timer=setInterval(run,15000);timer.unref?.();return {stop(){clearInterval(timer);}};}};
