import getpass
import shlex

import paramiko

password = getpass.getpass("Production password (not logged): ")
ssh = paramiko.SSHClient()
ssh.load_system_host_keys()
ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
ssh.connect("103.116.105.154", username="root", password=password, look_for_keys=False, allow_agent=False, timeout=20)
php = "require '/linhhoasu/webgame/gm/config.php'; global $conn_web; foreach(array('account','web_account_bans','web_account_ban_history') as $t){try{$q=$conn_web->query('SHOW TABLES LIKE '.chr(39).$t.chr(39));echo $t.'='.(($q&&$q->fetchColumn())?'exists':'missing').PHP_EOL;}catch(Exception $e){echo $t.'=error'.PHP_EOL;}}"
try:
    _, stdout, stderr = ssh.exec_command("php -r " + shlex.quote(php), timeout=60)
    print(stdout.read().decode("utf-8", "replace"))
    print(stderr.read().decode("utf-8", "replace"))
finally:
    ssh.close()
