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
if (!$acc_row) die('NO ACCOUNT');
$_SESSION['logged_in'] = true;
$_SESSION['username'] = $acc_row['account'];
$_SESSION['uin'] = isset($acc_row['uin']) ? $acc_row['uin'] : $acc_row['account'];
$_SESSION['server_id'] = '1001';
$_SESSION['server_name'] = 'Linh Họa Sư - S1001';
$_GET['server_id'] = '1007'; // Should switch to 1007!
ob_start();
require 'index.php';
$html = ob_get_clean();

echo "SESSION server_id after sync: " . $_SESSION['server_id'] . "\\n";
echo "SESSION server_name after sync: " . $_SESSION['server_name'] . "\\n";
echo "switchServerModal: " . (strpos($html, 'id="switchServerModal"') !== false ? 'FOUND' : 'NOT FOUND') . "\\n";
echo "QUY DINH NHAN GIFTCODE: " . (strpos($html, 'QUY ĐỊNH NHẬN GIFTCODE') !== false ? 'FOUND' : 'NOT FOUND') . "\\n";
echo "Dich nhan qua hien tai: " . (strpos($html, 'Đích nhận quà hiện tại') !== false ? 'FOUND' : 'NOT FOUND') . "\\n";
echo "active_server_display_name: " . (strpos($html, 'id="active_server_display_name"') !== false ? 'FOUND' : 'NOT FOUND') . "\\n";
echo "btnSubmitGiftcode: " . (strpos($html, 'id="btnSubmitGiftcode"') !== false ? 'FOUND' : 'NOT FOUND') . "\\n";
"""

sftp = c.open_sftp()
with sftp.file('/linhhoasu/_ai_workbench/tools/test_index_render.php', 'w') as f:
    f.write(php_test)
sftp.close()

_, out, err = c.exec_command('php /linhhoasu/_ai_workbench/tools/test_index_render.php')
print(out.read().decode('utf-8', 'replace'))
print(err.read().decode('utf-8', 'replace'))
c.close()
