import getpass, shlex, paramiko
p=getpass.getpass('Production password (not logged): ')
s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect('103.116.105.154',username='root',password=p,look_for_keys=False,allow_agent=False,timeout=20)
php="require '/linhhoasu/webgame/gm/config.php'; global $conn_web; $q=$conn_web->query(\"SELECT account,status,last_login_at FROM account WHERE status='locked' ORDER BY account_id\"); echo json_encode($q->fetchAll(PDO::FETCH_ASSOC),JSON_UNESCAPED_UNICODE);"
try:
 _,o,e=s.exec_command('php -r '+shlex.quote(php)); print(o.read().decode('utf8','replace')); print(e.read().decode('utf8','replace'))
finally:s.close()
