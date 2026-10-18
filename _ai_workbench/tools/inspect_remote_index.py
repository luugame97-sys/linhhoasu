import paramiko
from pathlib import Path
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('103.116.105.154', username='root', password='anhduc11', timeout=20)
command = "stat -c '%y %s %n' /linhhoasu/webgame/game/index.html; sha256sum /linhhoasu/webgame/game/index.html; grep -o 'freeze_guard[^\\\" ]*\\|fate_point_fix[^\\\" ]*\\|web-panel\\|icon-web' /linhhoasu/webgame/game/index.html | sort -u | head -n 20; find /linhhoasu/_ai_workbench/backups -maxdepth 1 -mindepth 1 -type d -newermt '2026-08-30 17:00:00' -printf '%TY-%Tm-%Td %TH:%TM:%TS %p\\n' | sort"
_, stdout, stderr = client.exec_command(command)
print(stdout.read().decode('utf-8', 'replace'))
print(stderr.read().decode('utf-8', 'replace'))
target = Path(r'I:\Linhhoasu\server\server\_ai_workbench\temp\remote_index_current.html')
sftp = client.open_sftp()
sftp.get('/linhhoasu/webgame/game/index.html', str(target))
sftp.close()
print('downloaded=' + str(target))
client.close()
