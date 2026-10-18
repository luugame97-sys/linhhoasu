#!/usr/bin/env python3
from __future__ import annotations
import getpass, hashlib, json
from pathlib import Path
import paramiko

HOST='103.116.105.154'
ROOT=Path(r'I:\Linhhoasu\server\server')
DEST=ROOT/'_ai_workbench/temp/role_flow_remote_stable_20260902'
FILES=[
 ('lhs/newServer/src/services/AccountService.js','src/services/AccountService.js'),
 ('lhs/newServer/src/net/HTTPServer.js','src/net/HTTPServer.js'),
 ('lhs/newServer/src/net/HTTPServer1.js','src/net/HTTPServer1.js'),
 ('lhs/newServer/src/handlers/serverList.js','src/handlers/serverList.js'),
 ('lhs/newServer/src/handlers/serverList1.js','src/handlers/serverList1.js'),
]
password=getpass.getpass('VPS password (not logged): ')
ssh=paramiko.SSHClient(); ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy()); ssh.connect(HOST,username='root',password=password,look_for_keys=False,allow_agent=False,timeout=15)
try:
 sftp=ssh.open_sftp(); DEST.mkdir(parents=True,exist_ok=True); rows=[]
 try:
  for remote_rel,local_rel in FILES:
   target=DEST/local_rel; target.parent.mkdir(parents=True,exist_ok=True)
   sftp.get('/linhhoasu/'+remote_rel,str(target))
   rows.append({'remote':'/linhhoasu/'+remote_rel,'local':str(target),'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'bytes':target.stat().st_size})
 finally: sftp.close()
 print(json.dumps({'destination':str(DEST),'files':rows},ensure_ascii=False,indent=2))
finally: ssh.close()
