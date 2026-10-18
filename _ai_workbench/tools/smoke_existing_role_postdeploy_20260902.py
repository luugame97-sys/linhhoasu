#!/usr/bin/env python3
from __future__ import annotations
import base64, getpass, json, paramiko, requests

HOST='103.116.105.154'
user=input('QA account: ').strip()
game_password=getpass.getpass('QA password (not logged): ')
response=requests.post('http://103.116.105.154:81/api/user/login',json={'accountId':user,'password':game_password,'serverId':1001},timeout=20)
try: body=response.json()
except Exception: body={}
data=body.get('data') if isinstance(body,dict) and isinstance(body.get('data'),dict) else {}
token=str(data.get('userToken') or '')
node=r'''const token=Buffer.from(process.argv[1],'base64').toString('utf8');const mongo=require('/linhhoasu/lhs/newServer/src/db/mongo');const auth=require('/linhhoasu/lhs/newServer/src/services/AuthSessionService');(async()=>{await mongo.connect();if(token)await auth.remove(token);await mongo.disconnect();console.log(JSON.stringify({tokenRemoved:!!token}));})().catch(e=>{console.error(e.stack||e);process.exit(1)});'''
enc=base64.b64encode(node.encode()).decode(); arg=base64.b64encode(token.encode()).decode()
ssh=paramiko.SSHClient();ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy());ssh.connect(HOST,username='root',password=getpass.getpass('VPS password (not logged): '),look_for_keys=False,allow_agent=False,timeout=20)
try:
 cmd="pid=$(pm2 pid lhs-s1001|tail -1); export MONGO_URI=$(tr '\\0' '\\n' </proc/$pid/environ|sed -n 's/^MONGO_URI=//p'); cd /linhhoasu/lhs/newServer; node -e \"eval(Buffer.from('"+enc+"','base64').toString('utf8'))\" "+arg
 _,o,e=ssh.exec_command(cmd,timeout=90); cleanup=o.read().decode('utf-8','replace'); code=o.channel.recv_exit_status(); err=e.read().decode('utf-8','replace')
 if code: raise RuntimeError(err[-3000:] or cleanup[-3000:])
finally: ssh.close()
print(json.dumps({'httpStatus':response.status_code,'success':body.get('success') if isinstance(body,dict) else None,'code':body.get('code') if isinstance(body,dict) else None,'roleCount':len(data.get('roles') or []) if isinstance(data.get('roles'),list) else None,'needCreateRole':data.get('needCreateRole'),'activeRolePresent':bool(data.get('activeRoleId')),'userTokenPresent':bool(token),'cleanup':cleanup.strip()},ensure_ascii=False,indent=2))
