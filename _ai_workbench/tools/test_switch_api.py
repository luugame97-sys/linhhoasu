import paramiko, sys
sys.stdout.reconfigure(encoding='utf-8')

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('103.116.104.165', username='root', password='anhduc11')

php_test = """<?php
session_start();
chdir('/linhhoasu/webgame/gm');
require_once 'config.php';
$acc_row = $conn_web->query('SELECT * FROM account LIMIT 1')->fetch(PDO::FETCH_ASSOC);
$_SESSION['logged_in'] = true;
$_SESSION['username'] = $acc_row['account'];
$_SESSION['uin'] = isset($acc_row['uin']) ? $acc_row['uin'] : $acc_row['account'];
$_SESSION['server_id'] = '1001';
$_SESSION['server_name'] = 'Linh Họa Sư - S1001';

// Test switch_server API
chdir('/linhhoasu/webgame/gm/api');
$_SERVER['REQUEST_METHOD'] = 'POST';
$_POST['action'] = 'switch_server';
$_POST['server_id'] = '1006';
$_POST['csrf_token'] = csrf_token();
$_POST['web_context_token'] = lhs_web_context_token();

ob_start();
require 'user_api.php';
$res = ob_get_clean();

echo "API Response switch_server: " . $res . "\\n";
echo "SESSION server_id: " . $_SESSION['server_id'] . "\\n";
"""

sftp = c.open_sftp()
with sftp.file('/linhhoasu/_ai_workbench/tools/test_switch_api.php', 'w') as f:
    f.write(php_test)
sftp.close()

_, out, err = c.exec_command('php /linhhoasu/_ai_workbench/tools/test_switch_api.php')
print(out.read().decode('utf-8', 'replace'))
print(err.read().decode('utf-8', 'replace'))
c.close()
