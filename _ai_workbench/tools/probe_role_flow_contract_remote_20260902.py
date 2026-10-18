#!/usr/bin/env python3
from __future__ import annotations
import base64, getpass, json, paramiko

HOST='103.116.105.154'
NODE=r'''
const {packRequest,unpackResponse}=require('/linhhoasu/lhs/newServer/src/protocol/ReqCodec');
const mongo=require('/linhhoasu/lhs/newServer/src/db/mongo');
const Account=require('/linhhoasu/lhs/newServer/src/db/models/Account');
async function call(cmd,data){const r=await fetch('http://127.0.0.1:8080/gameMsg.do',{method:'POST',headers:{'content-type':'application/octet-stream'},body:packRequest(cmd,data)});return {status:r.status,body:unpackResponse(Buffer.from(await r.arrayBuffer()))};}
(async()=>{await mongo.connect();const marker=Date.now().toString(36);const account=`qa_flow_${marker}`;const password='QaFlowPass9';const reg=await call(2821,{strAccount:account,strPassword:password,confirmPassword:password,inviteCode:'TY7C1A'});const existing=await Account.findOne({accountId:account}).lean();const out={account,registration:{status:reg.status,ret:reg.body&&reg.body.ret,iResult:reg.body&&reg.body.iResult,needCreateRole:reg.body&&reg.body.needCreateRole,roleCount:Array.isArray(reg.body&&reg.body.roles)?reg.body.roles.length:0},dbAfterRegistration:{exists:!!existing,roleCount:Array.isArray(existing&&existing.roles)?existing.roles.length:null}};if(existing)await Account.deleteOne({accountId:account});await mongo.disconnect();console.log(JSON.stringify(out,null,2));})().catch(async e=>{console.error(e.stack||e);try{await mongo.disconnect()}catch(_){}process.exit(1)});
'''
ssh=paramiko.SSHClient();ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy());ssh.connect(HOST,username='root',password=getpass.getpass('VPS password (not logged): '),look_for_keys=False,allow_agent=False,timeout=15)
try:
 enc=base64.b64encode(NODE.encode()).decode(); cmd="pid=$(pm2 pid lhs-s1001|tail -1); export MONGO_URI=$(tr '\\0' '\\n' </proc/$pid/environ|sed -n 's/^MONGO_URI=//p'); cd /linhhoasu/lhs/newServer; node -e \"eval(Buffer.from('"+enc+"','base64').toString('utf8'))\""
 _,o,e=ssh.exec_command(cmd,timeout=120); out=o.read().decode('utf-8','replace'); code=o.channel.recv_exit_status(); err=e.read().decode('utf-8','replace');
 if code: raise RuntimeError(err[-4000:] or out[-4000:])
 print(out)
finally:ssh.close()
