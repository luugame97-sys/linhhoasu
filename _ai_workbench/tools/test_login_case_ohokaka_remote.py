"""Verify uppercase/lowercase login equivalence without retaining test tokens."""
from __future__ import annotations

import base64
import getpass
import json

import paramiko

HOST = "103.116.105.154"
# Cover leading, mixed and all-uppercase variants.  The diagnostic removes each
# transient token immediately after the HTTP assertion.
ACCOUNT_INPUTS = [
    "Ohokaka12321",
    "ohokaka12321",
    "oHokaka12321",
    "OHOKAKA12321",
    "ohOKaka12321",
]

NODE = r'''
try{require('/linhhoasu/lhs/newServer/node_modules/dotenv').config({path:'/linhhoasu/lhs/newServer/.env'});}catch(_){}
const payload=JSON.parse(Buffer.from(process.argv[1],'base64').toString('utf8'));
const mongoose=require('/linhhoasu/lhs/newServer/node_modules/mongoose');
const accountService=require('/linhhoasu/lhs/newServer/src/services/AccountService');
const authSession=require('/linhhoasu/lhs/newServer/src/services/AuthSessionService');
const sanitize=data=>{const value=data&&data.data&&typeof data.data==='object'?data.data:(data||{});return{success:data&&data.success===true,code:String(data&&data.code||''),message:String(data&&data.message||''),accountId:String(value.accountId||value.account&&value.account.accountId||''),needCreateRole:!!value.needCreateRole,roleCount:Array.isArray(value.roles)?value.roles.length:0,hasToken:!!(value.userToken||value.token||value.authToken||value.sessionToken)};};
(async()=>{await mongoose.connect(process.env.MONGO_URI||'mongodb://127.0.0.1:27017/lhs_s1001',{serverSelectionTimeoutMS:7000});const out=[];for(const input of payload.accounts){const direct=await accountService.authenticateAccountDetailed(input,payload.password,{autoUnban:true});let httpStatus=0,httpData={};try{const r=await fetch('http://127.0.0.1:8080/api/user/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accountId:input,password:payload.password,serverId:1001})});httpStatus=r.status;httpData=await r.json();}catch(e){httpData={success:false,code:'HTTP_ERROR',message:e.message};}const value=httpData&&httpData.data&&typeof httpData.data==='object'?httpData.data:(httpData||{});const token=value.userToken||value.token||value.authToken||value.sessionToken;if(token)await authSession.remove(token);out.push({input,normalized:accountService.normalizeAccountId(input),direct:{authenticated:!!direct.account,banned:!!direct.ban,code:String(direct.code||'')},http:{status:httpStatus,...sanitize(httpData),testTokenRemoved:!!token}});}await mongoose.disconnect();console.log(JSON.stringify({readOnlyAccountData:true,transientTokensRemoved:true,results:out},null,2));})().catch(async e=>{console.error(e.stack||String(e));try{await mongoose.disconnect()}catch(_){}process.exit(1)});
'''


def main():
    vps_password = getpass.getpass("Production password (not logged): ")
    game_password = getpass.getpass("Game password (not logged): ")
    encoded_payload = base64.b64encode(json.dumps({"accounts": ACCOUNT_INPUTS, "password": game_password}).encode()).decode()
    encoded_node = base64.b64encode(NODE.encode()).decode()
    ssh = paramiko.SSHClient(); ssh.load_system_host_keys(); ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", password=vps_password, look_for_keys=False, allow_agent=False,
                timeout=20, banner_timeout=20, auth_timeout=20)
    try:
        command = f"cd /linhhoasu/lhs/newServer && node -e \"eval(Buffer.from('{encoded_node}','base64').toString('utf8'))\" {encoded_payload}"
        _, stdout, stderr = ssh.exec_command(command, timeout=120)
        output = stdout.read().decode("utf-8", "replace")
        error = stderr.read().decode("utf-8", "replace")
        code = stdout.channel.recv_exit_status()
    finally:
        ssh.close()
    if code:
        raise SystemExit(error or output or f"remote exit={code}")
    data = json.loads(output[output.rfind("\n{") + 1:])
    print(json.dumps(data, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
