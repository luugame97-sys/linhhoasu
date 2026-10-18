#!/usr/bin/env python3
from __future__ import annotations
import base64, getpass, json, secrets, string
import paramiko, requests

HOST='103.116.105.154'

def remote_cleanup(ssh, account_id):
    node = r'''const b=Buffer.from(process.argv[1],'base64').toString('utf8');const mongo=require('/linhhoasu/lhs/newServer/src/db/mongo');const Account=require('/linhhoasu/lhs/newServer/src/db/models/Account');const Player=require('/linhhoasu/lhs/newServer/src/db/models/Player');const Mail=require('/linhhoasu/lhs/newServer/src/db/models/Mail');(async()=>{await mongo.connect();const a=await Account.findOne({accountId:b}).lean();const ids=Array.isArray(a&&a.roles)?a.roles.map(r=>String(r&&r.userId||'')).filter(Boolean):[];const p=await Player.find({$or:[{accountId:b},{userId:{$in:ids}}]}).select({userId:1}).lean();const all=Array.from(new Set(ids.concat(p.map(x=>String(x.userId||'')).filter(Boolean))));const deletedPlayers=all.length?await Player.deleteMany({userId:{$in:all}}):{deletedCount:0};const deletedMails=all.length?await Mail.deleteMany({userId:{$in:all}}):{deletedCount:0};const deletedAccount=await Account.deleteOne({accountId:b});console.log(JSON.stringify({accountFound:!!a,roleCount:Array.isArray(a&&a.roles)?a.roles.length:0,deletedPlayers:deletedPlayers.deletedCount||0,deletedMails:deletedMails.deletedCount||0,deletedAccounts:deletedAccount.deletedCount||0}));await mongo.disconnect()})().catch(e=>{console.error(e.stack||e);process.exit(1)});'''
    enc=base64.b64encode(node.encode()).decode(); arg=base64.b64encode(account_id.encode()).decode()
    cmd="pid=$(pm2 pid lhs-s1001|tail -1); export MONGO_URI=$(tr '\\0' '\\n' </proc/$pid/environ|sed -n 's/^MONGO_URI=//p'); cd /linhhoasu/lhs/newServer; node -e \"eval(Buffer.from('"+enc+"','base64').toString('utf8'))\" "+arg
    _,o,e=ssh.exec_command(cmd,timeout=120); out=o.read().decode('utf-8','replace'); code=o.channel.recv_exit_status(); err=e.read().decode('utf-8','replace')
    if code: raise RuntimeError(err[-4000:] or out[-4000:])
    return out

def main():
    suffix=secrets.token_hex(6)
    account_id=('qaweb'+suffix)[:20]
    password='QaWebPass9'
    response=requests.post('http://103.116.105.154:81/api/user/register',json={'accountId':account_id,'password':password,'confirmPassword':password,'inviteCode':'TY7C1A'},timeout=20)
    try: body=response.json()
    except Exception: body={}
    data=body.get('data') if isinstance(body,dict) and isinstance(body.get('data'),dict) else {}
    ssh=paramiko.SSHClient(); ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy()); ssh.connect(HOST,username='root',password=getpass.getpass('VPS password (not logged): '),look_for_keys=False,allow_agent=False,timeout=20)
    try:
        cleanup=remote_cleanup(ssh,account_id)
        result={'httpStatus':response.status_code,'success':body.get('success') if isinstance(body,dict) else None,'code':body.get('code') if isinstance(body,dict) else None,'message':body.get('message') if isinstance(body,dict) else None,'responseRoleCount':len(data.get('roles') or []) if isinstance(data.get('roles'),list) else None,'responseNeedCreateRole':data.get('needCreateRole'),'cleanup':cleanup}
    finally: ssh.close()
    print(json.dumps(result,ensure_ascii=False,indent=2))
    if result['httpStatus'] != 201 or result['success'] is not True or result['responseRoleCount'] != 0 or result['responseNeedCreateRole'] is not True: raise SystemExit(1)

if __name__=='__main__': main()
