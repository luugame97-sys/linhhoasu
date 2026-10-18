import getpass, json, os, paramiko

ssh=paramiko.SSHClient(); ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('103.116.105.154',username='root',password=getpass.getpass('VPS password (not logged): '),look_for_keys=False,allow_agent=False,timeout=15)
try:
    sftp=ssh.open_sftp()
    paths=['/linhhoasu/lhs/LHS-file/src/data/player_template.json','/linhhoasu/lhs/newServer/LHS-file/src/data/player_template.json']
    for path in paths:
        try:
            with sftp.open(path,'rb') as fh: raw=fh.read()
        except Exception as exc:
            print('MISSING',path,type(exc).__name__); continue
        data=json.loads(raw.decode('utf-8'))
        print('FOUND',path,'bytes',len(raw))
        for key in ['_id','__v','userId','playerId','name','accountId','roleId','createdAt','updatedAt']:
            print(key,repr(data.get(key)))
        print('TOP_KEYS',sorted(data.keys())[:80])
    sftp.close()
finally: ssh.close()
