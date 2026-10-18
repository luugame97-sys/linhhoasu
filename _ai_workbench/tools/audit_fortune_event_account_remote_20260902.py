"""Read-only production snapshot for the Kim Ma Chuc Phuc QA account."""
from __future__ import annotations

import base64
import getpass
import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path

import paramiko


HOST = "103.116.105.154"
ACCOUNT = "vanduc97"
ROOT = Path(__file__).resolve().parents[1]

SCRIPT = r'''
try { require('/linhhoasu/lhs/newServer/node_modules/dotenv').config({path:'/linhhoasu/lhs/newServer/.env'}); } catch (_) {}
const mongoose=require('/linhhoasu/lhs/newServer/node_modules/mongoose');
const Account=require('/linhhoasu/lhs/newServer/src/db/models/Account');
const Player=require('/linhhoasu/lhs/newServer/src/db/models/Player');
const Config=require('/linhhoasu/lhs/newServer/src/services/ConfigService');
const fs=require('fs');const crypto=require('crypto');
function obj(v){return v&&typeof v==='object'&&!Array.isArray(v)?v:{}}
function arr(v){return Array.isArray(v)?v:[]}
function num(v){const n=Number(v);return Number.isFinite(n)?n:0}
function sha(p){return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')}
function itemCount(player,id){if(id===1)return num(player.currencies&&player.currencies.diamond);if(id===2)return num(player.currencies&&player.currencies.silver);if(id===6)return num(player.currencies&&player.currencies.gold);return num(player.items&&player.items[id])}
(async()=>{await mongoose.connect(process.env.MONGO_URI||'mongodb://127.0.0.1:27017/lhs_s1001',{serverSelectionTimeoutMS:7000});
 const account=await Account.findOne({accountId:ACCOUNT}).select({accountId:1,roles:1,status:1}).lean();
 const roles=arr(account&&account.roles);const userIds=roles.map(r=>String(r&&r.userId||'')).filter(Boolean);
 const players=await Player.find({userId:{$in:userIds}}).select({userId:1,playerId:1,name:1,level:1,items:1,currencies:1,activityInfo:1,taskInfo:1,other_attr_info:1,shopInfo:1,rechargeInfo:1,updatedAt:1}).lean();
 const rows=players.map(p=>{const activities=arr(obj(p.activityInfo).datas);const a43=activities.find(r=>num(r&&r.id)===43001)||null;const a44=activities.find(r=>num(r&&r.id)===44001)||null;const tasks=obj(obj(p.taskInfo).tasks);const eventTasks={};for(let id=61001;id<=61009;id++)eventTasks[id]=tasks[id]||null;return{userId:String(p.userId),playerId:String(p.playerId||''),name:String(p.name||''),level:num(p.level),balances:Object.fromEntries([4,6,55,65,176,177,178,179,93092,94411,94412,94413,94414,94415,113114,11548].map(id=>[id,itemCount(p,id)])),activity43:a43,activity44:a44,eventTasks,counters:obj(obj(p.other_attr_info).mainTaskProgress),shopInfo:obj(p.shopInfo),rechargeRecords:arr(obj(p.rechargeInfo).records).filter(r=>{const id=num(r&&r.id);return (id>=11018000&&id<=11018118)}),updatedAt:p.updatedAt||null};});
 const cfg={activity43:Config.get('Activity43Config')[43001],activity44:Config.get('Activity44Config')[44001],activity43Tasks:Config.get('Activity43TaskConfig')[43001],activity43TaskRewards:Config.get('Activity43TaskRewardConfig')[43001],activityScore43:Config.get('ActivityScoreConfig')[43001],activityShop43:Config.get('ActivityShopConfig')[43001]};
 console.log(JSON.stringify({readOnly:true,account:{exists:!!account,accountId:account&&account.accountId,status:num(account&&account.status),roleCount:roles.length},players:rows,config:cfg,hashes:{activity:sha('/linhhoasu/lhs/newServer/src/handlers/activity.js'),item:sha('/linhhoasu/lhs/newServer/src/handlers/item.js'),playerPayload:sha('/linhhoasu/lhs/newServer/src/handlers/playerPayload.js'),box:sha('/linhhoasu/lhs/newServer/src/handlers/box.js'),raid:sha('/linhhoasu/lhs/newServer/src/handlers/raid.js'),progress:sha('/linhhoasu/lhs/newServer/src/services/MainTaskProgressService.js'),playerService:sha('/linhhoasu/lhs/newServer/src/services/PlayerService.js')}},null,2));await mongoose.disconnect();})().catch(async e=>{console.error(e.stack||String(e));try{await mongoose.disconnect()}catch(_){}process.exit(1)});
'''.replace('ACCOUNT', json.dumps(ACCOUNT))


def main() -> None:
    password = os.environ.get("LHS_PROD_PASSWORD") or getpass.getpass("Production password (not logged): ")
    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False, allow_agent=False, timeout=20)
    try:
        encoded = base64.b64encode(SCRIPT.encode()).decode()
        _, stdout, stderr = ssh.exec_command(
            f"cd /linhhoasu/lhs/newServer && node -e \"eval(Buffer.from('{encoded}','base64').toString('utf8'))\"",
            timeout=120,
        )
        output = stdout.read().decode("utf-8", "replace")
        error = stderr.read().decode("utf-8", "replace")
        code = stdout.channel.recv_exit_status()
        if code:
            raise RuntimeError(error[-4000:] or output[-4000:])
    finally:
        ssh.close()
    # ConfigService/Mongoose may print bounded diagnostics before the JSON
    # payload.  Decode the last pretty-printed object instead of assuming the
    # first brace belongs to our result.
    starts = [idx for idx, char in enumerate(output) if char == "{" and (idx == 0 or output[idx - 1] == "\n")]
    if not starts:
        raise RuntimeError("remote audit returned no JSON payload")
    decoder = json.JSONDecoder()
    payload = None
    for start in reversed(starts):
        try:
            payload, _ = decoder.raw_decode(output[start:])
            break
        except json.JSONDecodeError:
            continue
    if payload is None:
        raise RuntimeError("remote audit JSON payload could not be decoded")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    out = ROOT / "temp" / f"fortune_event_account_pre_{stamp}.json"
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(out), "sha256": hashlib.sha256(out.read_bytes()).hexdigest(), "account": payload.get("account"), "players": len(payload.get("players", []))}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
