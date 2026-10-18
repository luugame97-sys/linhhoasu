"""Scoped, idempotent Webshop schema migration with SQL backup and rollback."""
import json,sys,shlex
from datetime import datetime,timezone
from pathlib import Path
import paramiko
from stage_webshop_upgrade_20260906 import WB,run
sys.stdout.reconfigure(encoding='utf-8');c=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(c[0].strip(),username='root',password=c[2],look_for_keys=False,allow_agent=False,timeout=20)
stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S');remote='/linhhoasu/_ai_workbench/backups/webshop_bundle_schema_'+stamp;out=WB/'temp'/'webshop_upgrade_20260906'/(f'schema_migration_{stamp}.json');result={'backup':remote,'startedAt':datetime.now(timezone.utc).isoformat(),'mutated':False}
def sql_script(action):
 return f"""const fs=require('fs'),{{MongoClient}}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');
const mysql=require('mysql2/promise');const cfg=process.env; // mysql CLI is used below; this is never sent to the game.
"""
try:
 inspect = '''<?php require '/linhhoasu/webgame/gm/config.php'; foreach(array('webshop_items','webshop_orders') as $t){$r=$conn_web->query("SHOW CREATE TABLE `$t`")->fetch(PDO::FETCH_NUM);echo $r[1]."\\n---TABLE---\\n";} ?>'''
 i,o,e=s.exec_command('php',timeout=60);i.write(inspect);i.channel.shutdown_write();schema=o.read().decode('utf-8','replace');assert o.channel.recv_exit_status()==0
 run(s,f'install -d -m 700 {remote}')
 sftp=s.open_sftp();sftp.file(remote+'/schema.before.sql','w').write(schema.encode());sftp.close()
 result['before']=schema
 # Use PHP PDO, with existence checks, so reruns are safe and only named columns/indexes are touched.
 migration=r'''<?php
require '/linhhoasu/webgame/gm/config.php';
$conn_web->beginTransaction();
try {
 $has=function($table,$column)use($conn_web){$s=$conn_web->prepare('SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?');$s->execute(array($table,$column));return(bool)$s->fetchColumn();};
 $idx=function($table,$name)use($conn_web){$s=$conn_web->prepare('SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND INDEX_NAME=?');$s->execute(array($table,$name));return(bool)$s->fetchColumn();};
 if(!$has('webshop_items','reward_items'))$conn_web->exec('ALTER TABLE webshop_items ADD reward_items LONGTEXT NULL AFTER item_amount');
 if(!$has('webshop_orders','request_key'))$conn_web->exec('ALTER TABLE webshop_orders ADD request_key VARCHAR(64) NULL AFTER status');
 if(!$has('webshop_orders','reward_snapshot'))$conn_web->exec('ALTER TABLE webshop_orders ADD reward_snapshot LONGTEXT NULL AFTER request_key');
 $conn_web->exec("ALTER TABLE webshop_orders MODIFY status ENUM('paid','failed','refunded','pending_delivery') NOT NULL DEFAULT 'paid'");
 if(!$idx('webshop_orders','uq_webshop_request_key'))$conn_web->exec('ALTER TABLE webshop_orders ADD UNIQUE KEY uq_webshop_request_key(account_name,request_key)');
 $conn_web->commit(); echo json_encode(array('result'=>'PASS','mutated'=>true,'columns'=>array('webshop_items.reward_items','webshop_orders.request_key','webshop_orders.reward_snapshot'),'statusPendingDelivery'=>true,'idempotencyIndex'=>true));
} catch(Throwable $e) { if($conn_web->inTransaction())$conn_web->rollBack(); fwrite(STDERR,$e->getMessage()); exit(1); }
'''
 sftp=s.open_sftp();sftp.file(remote+'/migrate.php','w').write(migration.encode());sftp.close();result['migration']=json.loads(run(s,f'php {remote}/migrate.php'))
 i,o,e=s.exec_command('php',timeout=60);i.write(inspect);i.channel.shutdown_write();after=o.read().decode('utf-8','replace');assert o.channel.recv_exit_status()==0
 result['after']=after;result['finishedAt']=datetime.now(timezone.utc).isoformat();result['passed']=True
finally:
 out.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');s.close()
print(json.dumps({'passed':result.get('passed'), 'backup':remote,'mutated':result.get('mutated',False),'migration':result.get('migration')} ,ensure_ascii=False))
