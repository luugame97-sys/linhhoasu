import getpass
import paramiko

HOST='103.116.105.154'; pw=getpass.getpass('VPS password (not logged): ')
s=paramiko.SSHClient();s.set_missing_host_key_policy(paramiko.AutoAddPolicy());s.connect(HOST,username='root',password=pw,look_for_keys=False,allow_agent=False,timeout=15)
try:
 cmd="set -eu; echo PM2_ENV; pm2 env 0 | grep '^BOT_' | sort || true; echo ECOSYSTEM_REFS; grep -RIn --include='*.js' --include='*.json' --include='*.config.*' 'BOT_MAP_IDS\|BOT_ENABLED\|BOT_MAX_TOTAL' /linhhoasu/lhs /linhhoasu/_ai_workbench 2>/dev/null | head -120; echo PM2_DUMP; grep -n 'BOT_MAP_IDS\|BOT_MAX_TOTAL\|BOT_COUNT_PER_MAP' /root/.pm2/dump.pm2 | head -50"
 _,o,e=s.exec_command(cmd);print(o.read().decode('utf8','replace'));print(e.read().decode('utf8','replace'))
finally:s.close()
