"""E2E SDK auth -> tag-1 server selection with mixed-case account input."""
from __future__ import annotations

import base64
import getpass
import json

import paramiko

HOST = "103.116.105.154"
ACCOUNT = "Ohokaka12321"

NODE = r'''
try{require('/linhhoasu/lhs/newServer/node_modules/dotenv').config({path:'/linhhoasu/lhs/newServer/.env'});}catch(_){}
const mongoose=require('/linhhoasu/lhs/newServer/node_modules/mongoose');
const redis=require('/linhhoasu/lhs/newServer/src/db/redis');
const authSession=require('/linhhoasu/lhs/newServer/src/services/AuthSessionService');
const payload=JSON.parse(Buffer.from(process.argv[1],'base64').toString('utf8'));
// Prevent the diagnostic login from touching online/session counters or rank state.
const sessionPath=require.resolve('/linhhoasu/lhs/newServer/src/net/Session');
require.cache[sessionPath]={id:sessionPath,filename:sessionPath,loaded:true,exports:{get:async()=>null,set:async()=>{},remove:async()=>{},renew:async()=>true,isOnline:async()=>false,incrOnline:async()=>{},decrOnline:async()=>{},getOnlineCount:async()=>0,SESSION_TTL:1800}};
const rankPath=require.resolve('/linhhoasu/lhs/newServer/src/services/RankService');
require.cache[rankPath]={id:rankPath,filename:rankPath,loaded:true,exports:{updateScore:async()=>{},getRank:async()=>0,getScore:async()=>0,getTopN:async()=>[],clear:async()=>{}}};
const serverList=require('/linhhoasu/lhs/newServer/src/handlers/serverList');
const accountHandler=require('/linhhoasu/lhs/newServer/src/handlers/account');
(async()=>{await mongoose.connect(process.env.MONGO_URI||'mongodb://127.0.0.1:27017/lhs_s1001',{serverSelectionTimeoutMS:7000});await redis.connect();await authSession.revokeAccount('ohokaka12321');let token='';try{const sdk=await serverList.handleSDKAuth({uid:payload.account,token:payload.password,serverId:1001,firstName:'Yêu Khiếu Thiên'},{headers:{host:'127.0.0.1:81'},protocol:'http',socket:{remoteAddress:'127.0.0.1'}});if(!sdk||sdk.ret!==0||!sdk.userToken)throw new Error('SDK_AUTH_FAILED '+JSON.stringify({ret:sdk&&sdk.ret,errInfo:sdk&&sdk.errInfo}));token=String(sdk.userToken);const session={wsId:987654,_onlineCounted:false,_isBot:false};const batch=await accountHandler.handleLogin({userid:sdk.userId,userToken:token,serverid:1001,platformuid:payload.account,firstName:'Yêu Khiếu Thiên',batchMsgEnabled:true},session,1);const first=Array.isArray(batch)?batch.find(x=>x&&x.tag===1):null;console.log(JSON.stringify({result:'PASS',input:payload.account,canonicalUid:sdk.uid,userId:sdk.userId,roleCount:Array.isArray(sdk.roles)?sdk.roles.length:0,tag1Accepted:Array.isArray(batch),loginResult:first&&first.data&&first.data.result,sessionAccountId:session.accountId,sessionUserId:session.userId,batchPacketCount:Array.isArray(batch)?batch.length:0,authSessionMismatch:false},null,2));}finally{if(token)await authSession.remove(token);await authSession.revokeAccount('ohokaka12321');try{await redis.disconnect()}catch(_){}try{await mongoose.disconnect()}catch(_){}}})().catch(async e=>{console.error(e.stack||String(e));try{await authSession.revokeAccount('ohokaka12321')}catch(_){}try{await redis.disconnect()}catch(_){}try{await mongoose.disconnect()}catch(_){}process.exit(1)});
'''


def main():
    vps_password = getpass.getpass("Production password (not logged): ")
    game_password = getpass.getpass("Game password (not logged): ")
    payload = base64.b64encode(json.dumps({"account": ACCOUNT, "password": game_password}).encode()).decode()
    node = base64.b64encode(NODE.encode()).decode()
    ssh = paramiko.SSHClient(); ssh.load_system_host_keys(); ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", password=vps_password, look_for_keys=False, allow_agent=False,
                timeout=20, banner_timeout=20, auth_timeout=20)
    try:
        command = f"cd /linhhoasu/lhs/newServer && node -e \"eval(Buffer.from('{node}','base64').toString('utf8'))\" {payload}"
        _, stdout, stderr = ssh.exec_command(command, timeout=240)
        output=stdout.read().decode('utf-8','replace');error=stderr.read().decode('utf-8','replace');code=stdout.channel.recv_exit_status()
    finally:
        ssh.close()
    if code:
        raise SystemExit(error or output or f"remote exit={code}")
    # The game handler writes informational logs to stdout in the same
    # diagnostic process.  Parse the first complete JSON object carrying the
    # PASS marker instead of assuming JSON is the final stdout block.
    decoder = json.JSONDecoder()
    data = None
    for offset, char in enumerate(output):
        if char != "{":
            continue
        try:
            candidate, end = decoder.raw_decode(output[offset:])
        except json.JSONDecodeError:
            continue
        if isinstance(candidate, dict) and candidate.get("result") == "PASS":
            data = candidate
            break
    if data is None:
        raise RuntimeError(f"Không tìm thấy kết quả PASS trong output chẩn đoán: {output[-4000:]}")
    print(json.dumps(data, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
