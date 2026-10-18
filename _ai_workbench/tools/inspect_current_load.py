import getpass,paramiko
s=paramiko.SSHClient();s.set_missing_host_key_policy(paramiko.AutoAddPolicy());s.connect('103.116.105.154',username='root',password=getpass.getpass('VPS password (not logged): '),look_for_keys=False,allow_agent=False,timeout=15)
try:
 c="date +%s; stat -c 'OUT_SIZE=%s OUT_MTIME=%y' /root/.pm2/logs/lhs-s1001-out.log; sleep 10; stat -c 'OUT_SIZE2=%s OUT_MTIME2=%y' /root/.pm2/logs/lhs-s1001-out.log; echo CONNECTIONS; ss -tn state established | awk '$4 ~ /:9200$/ {n++} END{print n+0}'; echo QUEUE_TOP; tail -n 30000 /root/.pm2/logs/lhs-s1001-out.log | grep -E 'queue backlog|handler enter' | tail -n 100"
 _,o,e=s.exec_command(c); print(o.read().decode('utf-8','replace')); print(e.read().decode('utf-8','replace'))
finally:s.close()
