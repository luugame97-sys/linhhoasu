import getpass,paramiko
s=paramiko.SSHClient();s.set_missing_host_key_policy(paramiko.AutoAddPolicy());s.connect('103.116.105.154',username='root',password=getpass.getpass('VPS password (not logged): '),look_for_keys=False,allow_agent=False,timeout=15)
try:
 c="cd /linhhoasu/lhs/newServer; echo SIMPLE; grep -RIl --include='*.js' 'await playerService.savePlayer(session.userId, player);' src/handlers | sort; echo COUNTS; grep -Rh --include='*.js' 'await playerService.savePlayer(session.userId, player);' src/handlers | wc -l; grep -Rh --include='*.js' 'await playerService.savePlayer(session.userId, session.player);' src/handlers | wc -l; grep -Rh --include='*.js' 'await playerService.savePlayer(userId, player);' src/handlers | wc -l; echo ASSIGNED; grep -Rn --include='*.js' -E '(const|let|var) .* = await playerService.savePlayer' src/handlers | head -80"
 _,o,e=s.exec_command(c);print(o.read().decode());print(e.read().decode())
finally:s.close()
