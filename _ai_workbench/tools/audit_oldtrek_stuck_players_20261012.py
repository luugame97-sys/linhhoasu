"""Read-only OldTrek stuck-player inventory across S1-S8; no RPC or DB writes."""
from __future__ import annotations

import datetime as dt
import json
from pathlib import Path

import paramiko

from rollback_role_lian_manifest_20260930 import ssh_config


ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "_ai_workbench" / "temp" / "oldtrek_stuck_check_20261012"
APP = "/linhhoasu/lhs/newServer"

NODE = r'''
const fs=require('fs'),{MongoClient}=require('./node_modules/mongodb');
const cfg=require('./src/services/ConfigService');
const dest=cfg.get('OldTrekDestinationConfig')||{};
const common=cfg.get('OldTrekCommonEventConfig')||{};
const policy=require('./src/config/oldTrekGameplayPolicy.json');
const now=Date.now(),maxElapsed=Math.max(1,Number(policy.miniGameMaxElapsedMs||900000));
const dbs=[1001,1002,1003,1004,1005,1006,1007,1008];
function num(v,d=0){const n=Number(v);return Number.isFinite(n)?n:d}
function digest(v){return require('crypto').createHash('sha256').update(String(v||'')).digest('hex').slice(0,12)}
function classify(p){
  const info=p.other_attr_info?.oldTrekInfo||{}, sail=info.sailInfo||{}, trek=sail.trekData||null, event=sail.currentEvent||null;
  const row=trek?((dest[trek.id]||{})[trek.diff]||{}):{}, eventRow=event?common[event.id]||null:null;
  const target=num(row.distance), distance=num(trek&&trek.dist), arrived=!!(trek&&target>0&&distance>=target);
  const deadline=num(event&&event.deadline), createdAt=num(event&&event.createdAt);
  const expired=!!(event&&((deadline>0&&now>=deadline)||(deadline<=0&&createdAt>0&&now-createdAt>=maxElapsed)));
  const reasons=[];
  if(info.sailing&&(!trek)) reasons.push('SAILING_WITHOUT_TREK');
  if(!info.sailing&&trek) reasons.push('TREK_WITHOUT_SAILING');
  if(arrived&&event) reasons.push(expired?'ARRIVED_WITH_EXPIRED_EVENT':'ARRIVED_WITH_EVENT');
  if(arrived&&!event) reasons.push('ARRIVED_WITHOUT_EVENT');
  if(event&&expired&&!arrived) reasons.push('EXPIRED_EVENT');
  const stuck=reasons.some(x=>['SAILING_WITHOUT_TREK','ARRIVED_WITH_EXPIRED_EVENT','ARRIVED_WITH_EVENT','ARRIVED_WITHOUT_EVENT','EXPIRED_EVENT'].includes(x));
  return {stuck,reasons,serverId:num(p.serverId),userId:String(p.userId||''),playerId:String(p.playerId||''),name:String(p.name||''),level:num(p.level),isBot:!!(p.isBot||p.managedBot),updatedAt:p.updatedAt||null,season:num(info.season),stage:num(info.stage),revision:num(info.stateRevision),sailing:!!info.sailing,endCache:!!info.endCache,trek:trek?{uid:num(trek.uid),id:num(trek.id),diff:num(trek.diff),dist:distance,targetDistance:target,arrived,lastUpdateTime:num(trek.lastUpdateTime)}:null,event:event?{uid:num(event.uid),id:num(event.id),eventType:num(event.eventType),configEventType:eventRow?num(eventRow.eventType,-1):null,miniGameType:num(event.miniGameType),createdAt,deadline,expired,ageMinutes:createdAt?Math.floor((now-createdAt)/60000):null,trekUid:num(event.trekUid),season:num(event.season)}:null,identityDigest:digest(p.userId||p.playerId)};
}
(async()=>{
  const out={at:new Date(now).toISOString(),readOnly:true,directPlayerWrites:0,authenticatedRpc:0,policyVersion:policy.version,nodes:[],totals:{scanned:0,nonBotOldTrek:0,stuck:0,orphanedTrek:0}};
  for(const sid of dbs){
    const client=new MongoClient('mongodb://127.0.0.1:27017',{serverSelectionTimeoutMS:5000,connectTimeoutMS:5000,socketTimeoutMS:15000,maxPoolSize:1});
    try{
      await client.connect();
      const rows=await client.db('lhs_s'+sid).collection('players').find({'other_attr_info.oldTrekInfo':{$exists:true}},{projection:{_id:0,userId:1,playerId:1,name:1,serverId:1,level:1,isBot:1,managedBot:1,updatedAt:1,'other_attr_info.oldTrekInfo':1},maxTimeMS:15000}).toArray();
      const all=rows.map(classify), nonBot=all.filter(x=>!x.isBot), stuck=nonBot.filter(x=>x.stuck), orphaned=nonBot.filter(x=>x.reasons.includes('TREK_WITHOUT_SAILING'));
      out.totals.scanned+=rows.length;out.totals.nonBotOldTrek+=nonBot.length;out.totals.stuck+=stuck.length;out.totals.orphanedTrek+=orphaned.length;
      out.nodes.push({serverId:sid,scanned:rows.length,nonBotOldTrek:nonBot.length,stuck:stuck.length,orphanedTrek:orphaned.length,players:stuck,orphaned});
    }catch(e){out.nodes.push({serverId:sid,error:e.name+':'+e.message});}
    finally{await client.close();}
  }
  console.log(JSON.stringify(out));
})().catch(e=>{console.error(e.stack);process.exitCode=1});
'''


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    args, kwargs = ssh_config()
    if args[0] != "103.116.104.165":
        raise RuntimeError(f"UNEXPECTED_HOST:{args[0]}")
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(*args, **kwargs)
    try:
        stdin, stdout, stderr = client.exec_command(f"cd {APP} && node -", timeout=180)
        stdin.write(NODE)
        stdin.channel.shutdown_write()
        raw = stdout.read().decode("utf-8", "replace")
        error = stderr.read().decode("utf-8", "replace")
        rc = stdout.channel.recv_exit_status()
        if rc:
            raise RuntimeError(f"REMOTE({rc}):{error[-1200:]}")
        result = json.loads(next(line for line in reversed(raw.splitlines()) if line.startswith("{")))
        (OUT / "live.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        summary = {
            "at": result["at"],
            "readOnly": result["readOnly"],
            "directPlayerWrites": result["directPlayerWrites"],
            "totals": result["totals"],
            "nodes": [
                {
                    "serverId": node["serverId"],
                    "scanned": node.get("scanned"),
                    "nonBotOldTrek": node.get("nonBotOldTrek"),
                    "stuck": node.get("stuck"),
                    "orphanedTrek": node.get("orphanedTrek"),
                    "error": node.get("error"),
                    "players": node.get("players", []),
                    "orphaned": node.get("orphaned", []),
                }
                for node in result["nodes"]
            ],
        }
        (OUT / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(summary, ensure_ascii=False, indent=2))
    finally:
        client.close()


if __name__ == "__main__":
    main()
