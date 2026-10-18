"""Read-only effective OldTrek stale audit; active events are not false positives."""
from __future__ import annotations

import json
from pathlib import Path

from skin_incident_remote import connect, run

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "_ai_workbench/temp/oldtrek_fix_20261016/effective_stale_audit.json"
NODE = r'''const {MongoClient}=require('mongodb');const cfg=require('./src/services/ConfigService');const schedule=require('./src/services/OldTrekScheduleService');const policy=require('./src/config/oldTrekGameplayPolicy.json');const dest=cfg.get('OldTrekDestinationConfig')||{};const now=Date.now(),maxElapsed=Math.max(1,Number(policy.miniGameMaxElapsedMs||900000));function n(v,d=0){const x=Number(v);return Number.isFinite(x)?x:d}function classify(p){const info=p.other_attr_info?.oldTrekInfo||{},sail=info.sailInfo||{},trek=sail.trekData||null,event=sail.currentEvent||null,row=trek?((dest[trek.id]||{})[trek.diff]||{}):{},target=n(row.distance),dist=n(trek&&trek.dist),arrived=!!(trek&&target>0&&dist>=target),created=n(event&&event.createdAt),deadline=n(event&&event.deadline),expired=!!(event&&((deadline>0&&now>=deadline)||(deadline<=0&&created>0&&now-created>=maxElapsed))),currentSeason=schedule.getSchedule(now).seasonNumber,season=n(info.season),staleSeason=season>0&&season<currentSeason,orphaned=!!info.sailing&&!trek,futureSeason=season>currentSeason;const actionable=[];if(staleSeason)actionable.push('STALE_SEASON');if(expired)actionable.push(arrived?'ARRIVED_WITH_EXPIRED_EVENT':'EXPIRED_EVENT');if(arrived&&!event)actionable.push('ARRIVED_WITHOUT_EVENT');const review=[];if(orphaned)review.push('SAILING_WITHOUT_TREK');if(futureSeason)review.push('FUTURE_SEASON');return {serverId:n(p.serverId),userId:String(p.userId||''),season,currentSeason,actionable,review,activeEvent:!!event&&!expired,arrived,expired,orphaned,event:event?{uid:n(event.uid),id:n(event.id),createdAt:created,deadline,ageMinutes:created?Math.floor((now-created)/60000):null}:null}};(async()=>{const out={at:new Date(now).toISOString(),readOnly:true,directPlayerWrites:0,totals:{scanned:0,nonBotOldTrek:0,actionable:0,review:0,activeEvents:0,arrivedWithoutEvent:0,expiredEvents:0},nodes:[]};for(const sid of [1001,1002,1003,1004,1005,1006,1007,1008,1009]){const c=new MongoClient('mongodb://127.0.0.1:27017',{serverSelectionTimeoutMS:5000,connectTimeoutMS:5000,socketTimeoutMS:15000,maxPoolSize:1});try{await c.connect();const rows=await c.db('lhs_s'+sid).collection('players').find({'other_attr_info.oldTrekInfo':{$exists:true},isBot:{$ne:true},managedBot:{$ne:true}},{projection:{_id:0,userId:1,serverId:1,'other_attr_info.oldTrekInfo':1},maxTimeMS:15000}).toArray();const all=rows.map(classify),action=all.filter(x=>x.actionable.length),review=all.filter(x=>x.review.length),active=all.filter(x=>x.activeEvent);out.totals.scanned+=rows.length;out.totals.nonBotOldTrek+=rows.length;out.totals.actionable+=action.length;out.totals.review+=review.length;out.totals.activeEvents+=active.length;out.totals.arrivedWithoutEvent+=all.filter(x=>x.actionable.includes('ARRIVED_WITHOUT_EVENT')).length;out.totals.expiredEvents+=all.filter(x=>x.expired).length;out.nodes.push({serverId:sid,scanned:rows.length,actionable:action.length,review:review.length,activeEvents:active.length,arrivedWithoutEvent:all.filter(x=>x.actionable.includes('ARRIVED_WITHOUT_EVENT')).length,expiredEvents:all.filter(x=>x.expired).length,players:action,reviewRows:review});}catch(e){out.nodes.push({serverId:sid,error:e.name+':'+e.message});}finally{await c.close();}}console.log(JSON.stringify(out))})().catch(e=>{console.error(e.stack);process.exitCode=1});'''


def main() -> None:
    with connect() as client:
        raw = run(client, "cd /linhhoasu/lhs/newServer && node -", data=NODE)
        result = json.loads(next(line for line in reversed(raw.splitlines()) if line.startswith("{")))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"at": result["at"], "readOnly": True, "directPlayerWrites": 0,
                      "totals": result["totals"],
                      "nodes": [{k: v.get(k) for k in ("serverId", "scanned", "actionable", "review", "activeEvents", "arrivedWithoutEvent", "expiredEvents", "error")} for v in result["nodes"]]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
