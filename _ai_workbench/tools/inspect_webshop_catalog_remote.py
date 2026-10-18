import getpass,json,paramiko
ssh=paramiko.SSHClient();ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy());ssh.connect('103.116.105.154',username='root',password=getpass.getpass('VPS password (not logged): '),look_for_keys=False,allow_agent=False,timeout=15)
try:
 s=ssh.open_sftp(); paths=['/linhhoasu/webgame/gm/assets/item/webshop_catalog.json','/linhhoasu/webgame/gm/api/user_api.php','/linhhoasu/webgame/gm/tools/sync_webshop_catalog.php']
 for p in paths:
  try:
   with s.open(p,'rb') as f: d=f.read()
  except Exception as e: print('MISSING',p,e); continue
  print('FOUND',p,'bytes',len(d))
  if p.endswith('.json'):
   try:
    obj=json.loads(d.decode('utf-8')); rows=obj.get('items',obj.get('products',obj if isinstance(obj,list) else [])); print('COUNT',len(rows) if isinstance(rows,list) else 'non-list');
    if isinstance(rows,list):
     for row in rows:
      txt=json.dumps(row,ensure_ascii=False)
      if any(x in txt.lower() for x in ['cánh','pháp tướng','wing','1101','1201','21001','21107','21101']): print(txt)
   except Exception as e: print('JSON_ERROR',e)
  else:
   text=d.decode('utf-8','replace')
   for i,line in enumerate(text.splitlines(),1):
    if any(x in line.lower() for x in ['reward','item','webshop','mail','1101','1201','21107','21001']): print(f'{i}: {line[:500]}')
 s.close()
finally:ssh.close()
