"""Read-only account/ban state check; never reads password hashes or mutates data."""
from __future__ import annotations

import base64
import getpass
import json

import paramiko

HOST = "103.116.105.154"
ACCOUNTS = ["vanduc97", "Ohokaka12321", "zerovip28n"]
NODE = r'''
require('/linhhoasu/lhs/newServer/node_modules/dotenv').config({path:'/linhhoasu/lhs/newServer/.env'});
const mongoose=require('/linhhoasu/lhs/newServer/node_modules/mongoose');
const cfg=require('/linhhoasu/lhs/newServer/ecosystem.config.js');
const app=(cfg.apps||[]).find(x=>x.name==='lhs-s1001')||{};
if(app.env&&app.env.MONGO_URI) process.env.MONGO_URI=app.env.MONGO_URI;
const Account=require('/linhhoasu/lhs/newServer/src/db/models/Account');
const Player=require('/linhhoasu/lhs/newServer/src/db/models/Player');
const banService=require('/linhhoasu/lhs/newServer/src/services/AccountBanService');
const wanted=JSON.parse(Buffer.from(process.argv[1],'base64').toString('utf8'));
(async()=>{await mongoose.connect(process.env.MONGO_URI||'mongodb://127.0.0.1:27027/lhs_s1001',{serverSelectionTimeoutMS:7000});const rows=[];for(const input of wanted){const accountId=String(input||'').trim().toLowerCase();const a=await Account.findOne({accountId}).lean();let ban=null;try{ban=a?await banService.resolveAccountBanState(a):null}catch(e){ban={error:String(e.message||e)}}const roles=Array.isArray(a&&a.roles)?a.roles.map(r=>({roleId:String(r.roleId||''),userId:String(r.userId||''),serverId:Number(r.serverId)||0,name:String(r.name||''),status:Number(r.status)||0})):[];const uids=roles.map(r=>r.userId).filter(Boolean);const players=uids.length?await Player.find({userId:{$in:uids}}).select({userId:1,playerId:1,name:1,level:1,serverId:1,updatedAt:1}).lean():[];rows.push({input,normalized:accountId,exists:!!a,status:a?Number(a.status):null,authVersion:a?Number(a.authVersion)||1:null,banUntil:a&&a.banUntil||null,banReason:a&&String(a.banReason||''),banCode:a&&String(a.banCode||''),banState:ban?{banned:!!ban.banned,permanent:!!ban.permanent,until:Number(ban.until)||0,remainingSeconds:Number(ban.remainingSeconds)||0,reason:String(ban.reason||''),code:String(ban.code||'')}:null,roles,players});}console.log(JSON.stringify({readOnly:true,db:mongoose.connection.name,accounts:rows},null,2));await mongoose.disconnect()})().catch(async e=>{console.error(e.stack||String(e));try{await mongoose.disconnect()}catch(_){}process.exit(1)});
'''


def main() -> None:
    password = getpass.getpass("Production password (not logged): ")
    encoded_accounts = base64.b64encode(json.dumps(ACCOUNTS).encode()).decode()
    encoded_node = base64.b64encode(NODE.encode()).decode()
    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False,
                allow_agent=False, timeout=20, banner_timeout=20, auth_timeout=20)
    try:
        _, stdout, stderr = ssh.exec_command(
            f"cd /linhhoasu/lhs/newServer && node -e \"eval(Buffer.from('{encoded_node}','base64').toString('utf8'))\" {encoded_accounts}",
            timeout=60,
        )
        out = stdout.read().decode("utf-8", "replace")
        err = stderr.read().decode("utf-8", "replace")
        code = stdout.channel.recv_exit_status()
    finally:
        ssh.close()
    if code:
        raise RuntimeError(err[-4000:] or out[-4000:] or f"remote exit={code}")
    decoder = json.JSONDecoder()
    data = None
    for offset, char in enumerate(out):
        if char != "{":
            continue
        try:
            candidate, _ = decoder.raw_decode(out[offset:])
        except json.JSONDecodeError:
            continue
        if isinstance(candidate, dict) and candidate.get("accounts") is not None:
            data = candidate
            break
    if data is None:
        raise RuntimeError(f"Không đọc được account state: {out[-4000:]}")
    print(json.dumps(data, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
