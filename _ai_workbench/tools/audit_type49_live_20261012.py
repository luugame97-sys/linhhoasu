"""Read-only live audit for Box Draw / activity type49 (49001)."""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import shlex
from pathlib import Path

import paramiko

from rollback_role_lian_manifest_20260930 import ssh_config


ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "_ai_workbench" / "temp" / "type49_audit_20261012"
APP = "/linhhoasu/lhs/newServer"
WEB = "/linhhoasu/webgame/game"

NODE = r'''
const fs=require('fs'),cp=require('child_process'),crypto=require('crypto');
const app='/linhhoasu/lhs/newServer';
const {MongoClient}=require(app+'/node_modules/mongodb');
const dot=require(app+'/node_modules/dotenv').parse(fs.readFileSync(app+'/.env'));
const pms=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8',maxBuffer:10e6})).filter(p=>/^lhs-s100[1-8]$/.test(p.name));
function env(p){return {...dot,...(p.pm2_env?.env||{}),...p.pm2_env}}
function sha(path){return crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex')}
function clip(text,needle,span=900){const i=text.indexOf(needle);return i<0?null:text.slice(Math.max(0,i-span),Math.min(text.length,i+span))}
function num(v,d=0){const n=Number(v);return Number.isFinite(n)?n:d}
function digest(v){return crypto.createHash('sha256').update(String(v||'')).digest('hex').slice(0,12)}
function active(row,now){return num(row?.startTime)<=now&&num(row?.endTime)>now}
const now=Date.now(), source={};
for(const rel of ['src/handlers/activity.js','src/services/EventExposureGate.js','src/services/EventRotationRegistry.js','src/config/eventRotation.json']){const f=app+'/'+rel;source[rel]=fs.existsSync(f)?{sha256:sha(f),text:fs.readFileSync(f,'utf8')}:null}
const activity=source['src/handlers/activity.js']?.text||'';
const runtime={sourceHashes:Object.fromEntries(Object.entries(source).map(([k,v])=>[k,v?.sha256||null])),markers:{boxResolver:!!activity.match(/function resolveBoxRewardConfig/),boxOperate:!!activity.match(/function operateBoxDraw/),type49Route:!!activity.match(/activityType === 49/),receipt:!!activity.match(/receipt.*49|49.*receipt/i),requestKey:!!activity.match(/requestKey|FeatureReceiptService/),boxPacket:!!activity.match(/12010/)},snippets:{resolver:clip(activity,'function resolveBoxRewardConfig'),operate:clip(activity,'function operateBoxDraw'),route:clip(activity,'activityType === 49')}};
const gate=source['src/services/EventExposureGate.js']?.text||'';
runtime.gate={type49Mentions:(gate.match(/49|49001/g)||[]).length,blockedMarker:gate.includes('EVENT_MAINTENANCE')};
const out={at:new Date(now).toISOString(),readOnly:true,directPlayerWrites:0,authenticatedRpc:0,runtime,nodes:[],totals:{players49001:0,active49001:0,expired49001:0,disabled49001:0,nonBot:0,withRecords:0,withExtra:0}};
function summarize(p,sid){const info=p.activityInfo||{}, rows=Array.isArray(info.datas)?info.datas:[], row=rows.find(x=>num(x?.id)===49001)||null;const dis=(info.disabledEntryIds||[]).map(Number).includes(49001);const isActive=active(row,now);return {serverId:sid,userId:String(p.userId||''),identityDigest:digest(p.userId||p.playerId),playerId:String(p.playerId||''),name:String(p.name||''),level:num(p.level),isBot:!!(p.isBot||p.managedBot),row:row?{id:num(row.id),startTime:num(row.startTime),endTime:num(row.endTime),status:row.status,state:row.state,running:row.running,module:num(row.module),index:num(row.index),param:num(row.param),record:row.record,records:row.records||{},extra:row.extra||null,task:row.task||null}:null,active:isActive,disabled:dis};}
function logHits(p){const hits=[];for(const key of ['pm_err_log_path','pm_out_log_path']){const f=p.pm2_env?.[key];if(!f||!fs.existsSync(f))continue;const st=fs.statSync(f),len=Math.min(st.size,524288),fd=fs.openSync(f,'r'),b=Buffer.alloc(len);fs.readSync(fd,b,0,len,Math.max(0,st.size-len));fs.closeSync(fd);for(const line of b.toString('utf8').split('\n'))if(/49001|12010|Activity49|BoxDraw|box.?draw|EVENT_MAINTENANCE|ACTIVITY_|TypeError|SAVE_NOT_CONFIRMED|uncaught|unhandled/i.test(line))hits.push(line.slice(0,500));}return hits.slice(-40)}
(async()=>{for(const pm of pms){const e=env(pm),sid=num(e.SERVER_ID||pm.name.slice(-4)),node={serverId:sid,name:pm.name,status:pm.pm2_env.status,pid:pm.pid,port:num(e.HTTP_PORT),ready:null,flags:Object.fromEntries(['EVENT_ROTATION_ENABLED','EVENT_ROTATION_NATIVE_ENABLED','EVENT_SETTLEMENT_ENABLED'].map(k=>[k,e[k]??null])),logs:logHits(pm)};try{const rr=await fetch('http://127.0.0.1:'+node.port+'/ready',{signal:AbortSignal.timeout(4000)});node.ready={http:rr.status,body:await rr.json()}}catch(x){node.ready={error:x.name+':'+x.message}}const client=new MongoClient(e.MONGO_URI,{serverSelectionMS:5000,serverSelectionTimeoutMS:5000,connectTimeoutMS:5000,socketTimeoutMS:15000,maxPoolSize:1});try{await client.connect();const db=client.db(e.IDENTITY_MONGO_DB||('lhs_s'+sid));const col=db.collection('players');const rows=await col.find({isBot:{$ne:true},'activityInfo.datas.id':49001},{projection:{_id:0,userId:1,playerId:1,name:1,level:1,isBot:1,managedBot:1,'activityInfo.datas':1,'activityInfo.disabledEntryIds':1},maxTimeMS:15000}).toArray();const summary=rows.map(p=>summarize(p,sid));node.counts={players:summary.length,active:summary.filter(x=>x.active).length,expired:summary.filter(x=>x.row&&!x.active).length,disabled:summary.filter(x=>x.disabled).length,records:summary.filter(x=>x.row&&Object.keys(x.row.records||{}).length).length,extra:summary.filter(x=>x.row&&x.row.extra&&Object.keys(x.row.extra).length).length};node.players=summary;out.totals.players49001+=summary.length;out.totals.active49001+=node.counts.active;out.totals.expired49001+=node.counts.expired;out.totals.disabled49001+=node.counts.disabled;out.totals.nonBot+=summary.length;out.totals.withRecords+=node.counts.records;out.totals.withExtra+=node.counts.extra;const tables={};for(const name of ['ActivityConfig','Activity49Config','Activity49RewardConfig','Activity49TaskConfig','Activity49ShopConfig']){try{tables[name]=require(app+'/src/services/ConfigService').get(name)}catch(err){tables[name]={error:err.message}}}if(sid===1001)node.tables=tables}catch(err){node.dbError=err.name+':'+err.message}finally{await client.close()}out.nodes.push(node)}console.log(JSON.stringify(out))})().catch(e=>{console.error(e.stack);process.exitCode=1})
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
        stdin, stdout, stderr = client.exec_command(f"cd {APP} && node -", timeout=240)
        stdin.write(NODE.replace("serverSelectionMS:5000,", "")
                         .replace("e.IDENTITY_MONGO_DB||('lhs_s'+sid)", "'lhs_s'+sid")
                         .replace("isBot:{$ne:true},'activityInfo.datas.id':49001", "isBot:{$ne:true},managedBot:{$ne:true},'activityInfo.datas.id':49001"))
        stdin.channel.shutdown_write()
        raw = stdout.read().decode("utf-8", "replace")
        error = stderr.read().decode("utf-8", "replace")
        rc = stdout.channel.recv_exit_status()
        if rc:
            raise RuntimeError(f"REMOTE({rc}):{error[-1500:]}")
        result = json.loads(next(line for line in reversed(raw.splitlines()) if line.startswith("{")))
        (OUT / "live.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        summary = {
            "at": result["at"],
            "readOnly": result["readOnly"],
            "directPlayerWrites": result["directPlayerWrites"],
            "authenticatedRpc": result["authenticatedRpc"],
            "totals": result["totals"],
            "runtime": result["runtime"],
            "nodes": [
                {k: n.get(k) for k in ["serverId", "name", "status", "ready", "flags", "counts", "dbError", "logs", "players", "tables"] if k in n}
                for n in result["nodes"]
            ],
        }
        (OUT / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(summary, ensure_ascii=False, indent=2))
    finally:
        client.close()


if __name__ == "__main__":
    main()
