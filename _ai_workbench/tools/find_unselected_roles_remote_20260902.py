#!/usr/bin/env python3
from __future__ import annotations
import getpass, json, paramiko
HOST='103.116.105.154'
NODE=r'''const mongo=require('/linhhoasu/lhs/newServer/src/db/mongo');const Account=require('/linhhoasu/lhs/newServer/src/db/models/Account');const Player=require('/linhhoasu/lhs/newServer/src/db/models/Player');(async()=>{await mongo.connect();const rows=await Player.find({'roleInfo.kungfuId':{$lte:0}},{accountId:1,userId:1,playerId:1,name:1,serverId:1,'roleInfo.kungfuId':1,'roleInfo.subJob':1,createdAt:1}).sort({createdAt:-1}).limit(50).lean();console.log(JSON.stringify({count:rows.length,rows},null,2));await mongo.disconnect()})().catch(e=>{console.error(e.stack||e);process.exit(1)});'''
import base64
ssh=paramiko.SSHClient();ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy());ssh.connect(HOST,username='root',password=getpass.getpass('VPS password (not logged): '),look_for_keys=False,allow_agent=False,timeout=15)
try:
 cmd="pid=$(pm2 pid lhs-s1001|tail -1); export MONGO_URI=$(tr '\\0' '\\n' </proc/$pid/environ|sed -n 's/^MONGO_URI=//p'); cd /linhhoasu/lhs/newServer; node -e \"eval(Buffer.from('"+base64.b64encode(NODE.encode()).decode()+"','base64').toString('utf8'))\""
 _,o,e=ssh.exec_command(cmd); out=o.read().decode('utf-8','replace'); code=o.channel.recv_exit_status(); err=e.read().decode('utf-8','replace')
 if code: raise RuntimeError(err[-4000:] or out[-4000:])
 print(out)
finally: ssh.close()
