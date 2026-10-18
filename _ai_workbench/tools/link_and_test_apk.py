import sys
if hasattr(sys.stdout, 'reconfigure'): sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'): sys.stderr.reconfigure(encoding='utf-8', errors='replace')

import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('103.116.104.165', username='root', password='anhduc11')

# 1. Test web-panel direct link
print(">>> Testing /web-panel/linhhoasulol.apk:")
_, stdout, _ = ssh.exec_command('curl -sI https://linhhoasu.lol/web-panel/linhhoasulol.apk')
print(stdout.read().decode('utf-8', errors='replace').strip())

# 2. Copy/link to /linhhoasu/webgame/game/linhhoasulol.apk so root domain also serves it
print("\n>>> Linking to webgame/game for root domain access:")
ssh.exec_command('cp -p /linhhoasu/webgame/gm/linhhoasulol.apk /linhhoasu/webgame/game/linhhoasulol.apk')
ssh.exec_command('chmod 644 /linhhoasu/webgame/game/linhhoasulol.apk')

# 3. Test root domain link
print("\n>>> Testing https://linhhoasu.lol/linhhoasulol.apk:")
_, stdout2, _ = ssh.exec_command('curl -sI https://linhhoasu.lol/linhhoasulol.apk?v=new')
print(stdout2.read().decode('utf-8', errors='replace').strip())

_, stdout3, _ = ssh.exec_command('curl -sI http://127.0.0.1:81/linhhoasulol.apk')
print("\n>>> Internal 81:")
print(stdout3.read().decode('utf-8', errors='replace').strip())

ssh.close()
