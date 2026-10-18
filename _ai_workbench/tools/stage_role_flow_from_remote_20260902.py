#!/usr/bin/env python3
from __future__ import annotations
import getpass, hashlib, json
from pathlib import Path
import paramiko
HOST='103.116.105.154'; ROOT=Path(r'I:\Linhhoasu\server\server'); DEST=ROOT/'_ai_workbench/temp/role_flow_candidate_live_20260902'
FILES=[('lhs/newServer/src/net/HTTPServer.js','src/net/HTTPServer.js'),('lhs/newServer/src/net/HTTPServer1.js','src/net/HTTPServer1.js'),('lhs/newServer/src/handlers/serverList.js','src/handlers/serverList.js'),('lhs/newServer/src/handlers/serverList1.js','src/handlers/serverList1.js'),('lhs/newServer/src/services/AccountService.js','src/services/AccountService.js')]
ssh=paramiko.SSHClient(); ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy()); ssh.connect(HOST,username='root',password=getpass.getpass('VPS password (not logged): '),look_for_keys=False,allow_agent=False,timeout=15)
try:
 s=ssh.open_sftp(); rows=[]; DEST.mkdir(parents=True,exist_ok=True)
 try:
  for rr,lr in FILES:
   p=DEST/lr; p.parent.mkdir(parents=True,exist_ok=True); s.get('/linhhoasu/'+rr,str(p)); rows.append({'remote':'/linhhoasu/'+rr,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size})
 finally:s.close()
 print(json.dumps({'destination':str(DEST),'files':rows},ensure_ascii=False,indent=2))
finally:ssh.close()
