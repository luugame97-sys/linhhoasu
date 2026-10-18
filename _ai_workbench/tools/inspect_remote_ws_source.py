#!/usr/bin/env python3
import getpass, hashlib, paramiko
REMOTE='/linhhoasu/lhs/newServer/src/net/WSServer.js'
LOCAL=r'I:\Linhhoasu\server\server\linhhoasu\lhs\newServer\src\net\WSServer.js'
ssh=paramiko.SSHClient(); ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy()); ssh.connect('103.116.105.154',username='root',password=getpass.getpass('VPS password (not logged): '),look_for_keys=False,allow_agent=False,timeout=15)
try:
 s=ssh.open_sftp()
 try:
  with s.open(REMOTE,'rb') as f: data=f.read()
 finally:s.close()
 local=open(LOCAL,'rb').read()
 print('REMOTE_HASH='+hashlib.sha256(data).hexdigest())
 print('LOCAL_HASH='+hashlib.sha256(local).hexdigest())
 text=data.decode('utf-8','replace')
 print('REMOTE_FASTPATH='+str('_handleHeartbeatFastPath' in text))
 print('REMOTE_TAG11_BRANCH='+str('Number(msg && msg.tag) === 11' in text))
 print('REMOTE_HANDLER_ENTER_TAG11_POSSIBLE=' + str('_handleSingleMessage(ws, msg, session)' in text))
 idx=text.find('_enqueueMessage(ws, msg, session)')
 print(text[idx:idx+2600])
finally:ssh.close()
