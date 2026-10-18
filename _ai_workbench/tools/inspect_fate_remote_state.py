import getpass
import paramiko

HOST='103.116.105.154';pw=getpass.getpass('VPS password (not logged): ');s=paramiko.SSHClient();s.set_missing_host_key_policy(paramiko.AutoAddPolicy());s.connect(HOST,username='root',password=pw,look_for_keys=False,allow_agent=False,timeout=15)
try:
 cmd="set -eu; echo BACKUP; find /linhhoasu/_ai_workbench/backups/fate_point_fix_20260830_100955 -maxdepth 1 -type f -printf '%f %s\\n' | sort; echo MARKERS; grep -n 'getTalentPoint(player)' /linhhoasu/lhs/newServer/src/handlers/fate.js || true; grep -o '20260830_[A-Za-z0-9_-]*' /linhhoasu/webgame/game/index.html | sort -u | tail -10; grep -o 'GetItemModel.GetItemCount(99)\|ItemModel.GetItemCount(99)' /linhhoasu/webgame/game/js/main.min_a6195824.js | head -3 || true"
 _,o,e=s.exec_command(cmd);print(o.read().decode('utf8','replace'));print(e.read().decode('utf8','replace'))
finally:s.close()
