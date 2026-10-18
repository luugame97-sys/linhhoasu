"""Read-only OldTrek catalog + fleet state audit. No production writes."""
from __future__ import annotations

import json
from pathlib import Path

from skin_incident_remote import connect, run

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "_ai_workbench/temp/oldtrek_full_audit_20261016/config_fleet.json"

NODE = r'''const cfg=require('./src/services/ConfigService');const policy=require('./src/config/oldTrekGameplayPolicy.json');const {MongoClient}=require('mongodb');
const common=cfg.get('OldTrekCommonEventConfig')||{}, mini=cfg.get('OldTrekMiniGameConfig')||{}, dest=cfg.get('OldTrekDestinationConfig')||{};
const tableNames=['OldTrekMiniGame1Config','OldTrekMiniGame2Config','OldTrekMiniGame3Config','OldTrekMiniGame4Config'];
const miniTables=Object.fromEntries(tableNames.map((name,i)=>[i+1,cfg.get(name)||{}]));
const num=(v,d=0)=>{const n=Number(v);return Number.isFinite(n)?n:d};
const keys=Object.keys(common).map(Number).filter(Number.isFinite),known=new Set(keys);
const typeCounts={},invalidNext=[],invalidRows=[],type4=[];
for(const [key,row] of Object.entries(common)){
  const id=num(row&&row.id,num(key));const type=num(row&&row.eventType,-1);typeCounts[type]=(typeCounts[type]||0)+1;
  if(policy.eventTypeWeights[type]>0&&![1,2,3,4,6,98,99].includes(type))invalidRows.push({id,eventType:type,reason:'UNSUPPORTED_ACTIVE_EVENT_TYPE'});
  for(const branch of (Array.isArray(row&&row.nextId)?row.nextId:[]))for(const next of (Array.isArray(branch)?branch:[branch]))if(next!=null&&num(next,-1)>0&&!known.has(num(next)))invalidNext.push({id,next:num(next)});
  if(type===4)type4.push({id,miniGameType:num(row&&row.miniGameType),miniGameLevel:num(row&&row.miniGameLevel),nextId:row.nextId||[]});
}
const miniIssues=[],miniSummary={};
for(const [key,row] of Object.entries(mini)){
  const id=num(row&&row.id,num(key)),type=num(row&&row.type,-1),range=Array.isArray(row&&row.levelRange)?row.levelRange:[];
  miniSummary[id]={type,levelRange:range.slice(0,10)};
  if(![1,2,3,4].includes(type))miniIssues.push({id,type,reason:'UNSUPPORTED_MINIGAME_TYPE'});
  if(!range.length)miniIssues.push({id,type,range,reason:'EMPTY_LEVEL_LIST'});
  const table=miniTables[type]||{};
  for(const level of range)if(!table[level]&&!table[String(level)])miniIssues.push({id,type,level,reason:'LEVEL_CONFIG_MISSING'});
  if(type===4&&!type4.some(x=>x.id===id))miniIssues.push({id,type,reason:'MINIGAME_ROW_NOT_EVENT'});
}
for(const row of type4){if(!mini[row.id])miniIssues.push({id:row.id,type:4,reason:'EVENT_MINIGAME_CONFIG_MISSING'});}
function tableSummary(table){return Object.fromEntries(Object.entries(table).map(([k,v])=>{const x=v||{};return [k,{winScore:num(x.winScore||x.successScore),countDown:num(x.countDown),data:Array.isArray(x.data)?x.data.length:0,keys:Object.keys(x).slice(0,12)}]}));}
const miniTableSummary=Object.fromEntries(Object.entries(miniTables).map(([type,table])=>[type,tableSummary(table)]));
const now=Date.now(),maxElapsed=Math.max(1,num(policy.miniGameMaxElapsedMs,900000));
const stateAnomalyKinds=['EVENT_ROW_MISSING','EVENT_TYPE_MISMATCH','MINIGAME_CONFIG_MISSING','MINIGAME_LEVEL_OUT_OF_RANGE','CHAIN_LIMIT_EXCEEDED','LEDGER_DUPLICATE_UID','LEDGER_CONFLICT','EVENTLOG_DUPLICATE_UID','PUZZLE_BOARD_INVALID'];
function classify(p){const info=p.other_attr_info?.oldTrekInfo||{},s=info.sailInfo||{},e=s.currentEvent||null,a=[];
  if(!e)return {anomalies:a};
  const row=common[e.id];if(!row)a.push('EVENT_ROW_MISSING');
  else if(e.eventType!=null&&num(row.eventType,-1)!==num(e.eventType,-2))a.push('EVENT_TYPE_MISMATCH');
  if(num(row&&row.eventType)===4){const c=mini[e.id],t=c&&miniTables[num(c.type)]||null,range=c&&c.levelRange||[];if(!c||!t)a.push('MINIGAME_CONFIG_MISSING');else if(!range.map(Number).includes(num(e.miniGameLevel)))a.push('MINIGAME_LEVEL_OUT_OF_RANGE');else if(!t[e.miniGameLevel]&&!t[String(e.miniGameLevel)])a.push('MINIGAME_CONFIG_MISSING');if(e.puzzleBoard!==undefined&&(!Array.isArray(e.puzzleBoard)||e.puzzleBoard.length!==9))a.push('PUZZLE_BOARD_INVALID');}
  if(num(e.chainStep)>num(policy.maxChainSteps))a.push('CHAIN_LIMIT_EXCEEDED');
  const ledger=Array.isArray(info.eventLedger)?info.eventLedger:[],logs=Array.isArray(s.eventLogs)?s.eventLogs:[],uids=ledger.map(x=>num(x&&x.uid,-1)),luids=logs.map(x=>num(x&&x.uid,-1));
  if(new Set(uids.filter(x=>x>0)).size!==uids.filter(x=>x>0).length)a.push('LEDGER_DUPLICATE_UID');
  if(new Set(luids.filter(x=>x>0)).size!==luids.filter(x=>x>0).length)a.push('EVENTLOG_DUPLICATE_UID');
  const same=ledger.filter(x=>num(x&&x.uid,-1)===num(e.uid,-2));if(same.length>1&&new Set(same.map(x=>String(x.operate)+':'+String(x.param))).size>1)a.push('LEDGER_CONFLICT');
  return {anomalies:a,event:{id:num(e.id),eventType:num(e.eventType),miniGameType:num(e.miniGameType),miniGameLevel:num(e.miniGameLevel),uid:num(e.uid),ageMinutes:num(e.createdAt)>0?Math.floor((now-num(e.createdAt))/60000):null},ledgerCount:ledger.length,eventLogCount:logs.length};}
(async()=>{const out={at:new Date(now).toISOString(),readOnly:true,directPlayerWrites:0,policyVersion:policy.version,config:{eventCount:keys.length,eventTypeCounts:typeCounts,invalidNext,invalidRows,type4,miniGameCount:Object.keys(mini).length,miniSummary,miniIssues,miniTableSummary,destinationCount:Object.keys(dest).length},fleet:{totals:{scanned:0,nonBot:0,pending:0,anomalies:0},nodes:[]}};
 for(const sid of [1001,1002,1003,1004,1005,1006,1007,1008,1009]){const client=new MongoClient('mongodb://127.0.0.1:27017',{serverSelectionTimeoutMS:5000,connectTimeoutMS:5000,socketTimeoutMS:15000,maxPoolSize:1});try{await client.connect();const rows=await client.db('lhs_s'+sid).collection('players').find({'other_attr_info.oldTrekInfo':{$exists:true},isBot:{$ne:true},managedBot:{$ne:true}},{projection:{_id:0,'other_attr_info.oldTrekInfo':1},maxTimeMS:20000}).toArray();const checked=rows.map(classify),pending=checked.filter(x=>x.event),bad=checked.filter(x=>x.anomalies.length);out.fleet.totals.scanned+=rows.length;out.fleet.totals.nonBot+=rows.length;out.fleet.totals.pending+=pending.length;out.fleet.totals.anomalies+=bad.length;out.fleet.nodes.push({serverId:sid,scanned:rows.length,pending:pending.length,anomalies:bad.length,anomalyKinds:Object.fromEntries([...new Set(bad.flatMap(x=>x.anomalies))].map(k=>[k,bad.filter(x=>x.anomalies.includes(k)).length])),samples:bad.slice(0,30)});}catch(e){out.fleet.nodes.push({serverId:sid,error:e.name+':'+e.message});}finally{await client.close();}}
 console.log(JSON.stringify(out));})().catch(e=>{console.error(e.stack);process.exitCode=1});'''

def main() -> None:
    with connect() as client:
        raw = run(client, "cd /linhhoasu/lhs/newServer && node -", data=NODE)
    result = json.loads(next(line for line in reversed(raw.splitlines()) if line.startswith("{")))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"at":result["at"],"config":{k:result["config"][k] for k in ("eventCount","eventTypeCounts","invalidNext","invalidRows","miniGameCount","miniIssues")},"fleet":result["fleet"]}, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
