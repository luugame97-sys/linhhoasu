import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('103.116.104.165', username='root', password='anhduc11')

sftp = client.open_sftp()
with sftp.file('/linhhoasu/lhs/newServer/src/services/PlayerService.js', 'r') as f:
    content = f.read().decode('utf-8')

target = """    reconcileFortuneConsumableSpend(data);
    let state = deferredSaveStates.get(key);"""

replacement = """    markSaveScheduled(data);
    reconcileFortuneConsumableSpend(data);
    let state = deferredSaveStates.get(key);"""

if target in content:
    content = content.replace(target, replacement, 1)
    with sftp.file('/linhhoasu/lhs/newServer/src/services/PlayerService.js', 'w') as f:
        f.write(content.encode('utf-8'))
    print("SUCCESS: PlayerService.js updated with markSaveScheduled")
else:
    print("ERROR: Target block not found in PlayerService.js")

sftp.close()
client.close()
