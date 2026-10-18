import getpass,paramiko
ssh=paramiko.SSHClient();ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy());ssh.connect('103.116.105.154',username='root',password=getpass.getpass('VPS password (not logged): '),look_for_keys=False,allow_agent=False,timeout=15)
try:
 ssh.exec_command('mkdir -p /linhhoasu/webgame/gm/_ai_workbench/temp')[1].read(); s=ssh.open_sftp(); path='/linhhoasu/webgame/gm/_ai_workbench/temp/aggregate_buggy_orders.php'; src=r'''<?php
require_once '/linhhoasu/webgame/gm/config.php';
$ids = array(1101,21109,22001,22003,22014,23001,23003,24107,11200,11210,11405,11505,12002,13001,28042,28043,28049,28052,28053,28059);
$marks = implode(',', array_fill(0, count($ids), '?'));
$stmt = $conn_web->prepare("SELECT item_id, COUNT(*) orders, COALESCE(SUM(quantity),0) quantity FROM webshop_orders WHERE item_id IN ($marks) GROUP BY item_id ORDER BY item_id");
$stmt->execute($ids);
echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC), JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT), PHP_EOL;
'''; f=s.open(path,'w');f.write(src);f.close(); _,o,e=ssh.exec_command('php '+path);print(o.read().decode('utf-8','replace'));print(e.read().decode('utf-8','replace'));s.close()
finally:ssh.close()
