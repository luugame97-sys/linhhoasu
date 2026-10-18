import paramiko, sys
sys.stdout.reconfigure(encoding='utf-8')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('103.116.104.165', username='root', password='anhduc11')

# Read-only SELECTs executed through the WebGM's own PDO connection (no secrets printed).
php = r'''<?php
error_reporting(0);
$_SERVER['REQUEST_METHOD']='GET'; $_SERVER['HTTP_HOST']='localhost';
chdir('/linhhoasu/webgame/gm');
ob_start(); require 'config.php'; ob_end_clean();
$qs = array(
 'Giftcode giao theo server/trang thai (7 ngay)' => "SELECT server_id,status,COUNT(*) n FROM web_reward_deliveries WHERE kind='giftcode' AND created_at>=NOW()-INTERVAL 7 DAY GROUP BY server_id,status ORDER BY server_id,status",
 'Tai khoan nhan cung 1 code o >=2 server (7 ngay)' => "SELECT COUNT(*) n FROM (SELECT account_name,source_id FROM web_reward_deliveries WHERE kind='giftcode' AND created_at>=NOW()-INTERVAL 7 DAY GROUP BY account_name,source_id HAVING COUNT(DISTINCT server_id)>=2) t",
 'Tong tai khoan nhan giftcode (7 ngay)' => "SELECT COUNT(DISTINCT account_name) n FROM web_reward_deliveries WHERE kind='giftcode' AND created_at>=NOW()-INTERVAL 7 DAY",
 'Dang nhap web gan nhat theo server (7 ngay)' => "SELECT server_id,COUNT(DISTINCT account_name) accounts FROM login_attempts WHERE success=1 AND created_at>=NOW()-INTERVAL 7 DAY GROUP BY server_id",
);
foreach ($qs as $t=>$q) {
  echo "=== $t\n";
  try { foreach ($conn_web->query($q)->fetchAll(PDO::FETCH_ASSOC) as $r) echo json_encode($r, JSON_UNESCAPED_UNICODE), "\n"; }
  catch (Exception $e) { echo 'ERR: ', $e->getMessage(), "\n"; }
}
'''
sftp = c.open_sftp()
with sftp.file('/linhhoasu/_ai_workbench/tools/giftcode_stats_ro.php', 'w') as f:
    f.write(php)
sftp.close()
_, o, e = c.exec_command('php /linhhoasu/_ai_workbench/tools/giftcode_stats_ro.php')
print(o.read().decode('utf-8', 'replace'))
print(e.read().decode('utf-8', 'replace'))
c.close()
