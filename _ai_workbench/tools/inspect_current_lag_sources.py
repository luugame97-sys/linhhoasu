import getpass,paramiko
paths=['src/net/WSServer.js','src/services/PlayerService.js','src/handlers/compat.js','src/handlers/farm.js','src/handlers/farm1.js','src/handlers/cross-rival.js','src/handlers/item.js','src/handlers/arena.js','src/handlers/upgrade.js']
s=paramiko.SSHClient();s.set_missing_host_key_policy(paramiko.AutoAddPolicy());s.connect('103.116.105.154',username='root',password=getpass.getpass('VPS password (not logged): '),look_for_keys=False,allow_agent=False,timeout=15)
try:
 cmd='for p in '+' '.join('/linhhoasu/lhs/newServer/'+p for p in paths)+"; do echo ===$p; sha256sum $p; grep -c -E 'HeartbeatFastPath|DEFERRED_SAVE_COALESCE_MS|scheduleFarmPlayerSave|savePlayerDeferred|returnSaved: false|await playerService.savePlayer|await savePlayer\\(' $p || true; done"
 _,o,e=s.exec_command(cmd);print(o.read().decode('utf-8','replace'));print(e.read().decode('utf-8','replace'))
finally:s.close()
