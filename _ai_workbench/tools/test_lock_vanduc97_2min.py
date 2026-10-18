"""Apply an explicitly approved two-minute Game + WebGM test lock."""
from __future__ import annotations

import getpass
import json
import shlex
from datetime import datetime, timezone

import paramiko

HOST = "103.116.105.154"
ACCOUNT = "vanduc97"
DURATION = 120
REASON = "Kiểm tra thông báo khóa tài khoản 2 phút."
ADMIN_MESSAGE = "Phạt người gc_ thời gian 2 phút. Lui về hậu sơn sám hối.\nLý do: Kiểm tra thông báo khóa tài khoản 2 phút."

PHP = r'''require '/linhhoasu/webgame/gm/config.php';
$account='vanduc97';$duration=120;$reason='Kiểm tra thông báo khóa tài khoản 2 phút.';$operator='vanduc97';
$meta=array('source'=>'webgm_test','eventId'=>0,'shopId'=>0,'exploitCount'=>0,'exploitBaozi'=>0,'evidenceId'=>'test_lock_2_minutes','title'=>'Thiên Đạo Ban Lệnh','adminMessage'=>"Phạt người gc_ thời gian 2 phút. Lui về hậu sơn sám hối.\nLý do: Kiểm tra thông báo khóa tài khoản 2 phút.");
$oldGame=lhs_internal_account_ban('/api/internal/account/ban-status',array('accountId'=>$account));
$s=$conn_web->prepare('SELECT * FROM web_account_bans WHERE account_name=? LIMIT 1');$s->execute(array($account));$oldWeb=$s->fetch(PDO::FETCH_ASSOC);
$backupDir=$argv[1];if(!is_dir($backupDir)&&!mkdir($backupDir,0750,true))throw new RuntimeException('BACKUP_FAILED');file_put_contents($backupDir.'/before.json',json_encode(array('game'=>$oldGame,'web'=>$oldWeb),JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT));
$game=lhs_internal_account_ban('/api/internal/account/ban',array('accountId'=>$account,'durationSeconds'=>$duration,'reason'=>$reason,'code'=>'QA_LOCK_2_MINUTES','by'=>$operator,'meta'=>$meta,'dryRun'=>false,'confirm'=>true));if(empty($game['success']))throw new RuntimeException('GAME_BAN_FAILED');
try{$now=(int)round(microtime(true)*1000);$until=$now+$duration*1000;$mj=json_encode($meta,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);$conn_web->beginTransaction();$conn_web->prepare("UPDATE account SET status='locked' WHERE account=?")->execute(array($account));$conn_web->prepare('INSERT INTO web_account_bans(account_name,active,ban_until,reason,ban_code,banned_at,banned_by,metadata_json,updated_at) VALUES(?,?,?,?,?,NOW(),?,?,NOW()) ON DUPLICATE KEY UPDATE active=1,ban_until=VALUES(ban_until),reason=VALUES(reason),ban_code=VALUES(ban_code),banned_at=NOW(),banned_by=VALUES(banned_by),metadata_json=VALUES(metadata_json),updated_at=NOW()')->execute(array($account,1,$until,$reason,'QA_LOCK_2_MINUTES',$operator,$mj));$conn_web->prepare('INSERT INTO web_account_ban_history(account_name,action,ban_until,reason,ban_code,operator_name,metadata_json) VALUES(?,?,?,?,?,?,?)')->execute(array($account,'ban',$until,$reason,'QA_LOCK_2_MINUTES',$operator,$mj));$conn_web->commit();}catch(Exception $e){if($conn_web->inTransaction())$conn_web->rollBack();lhs_internal_account_ban('/api/internal/account/unban',array('accountId'=>$account,'reason'=>'Rollback test lock','dryRun'=>false,'confirm'=>true));throw $e;}
$gameAfter=lhs_internal_account_ban('/api/internal/account/ban-status',array('accountId'=>$account));$s=$conn_web->prepare('SELECT account_name,active,ban_until,reason,ban_code,banned_at,banned_by,metadata_json,updated_at FROM web_account_bans WHERE account_name=? LIMIT 1');$s->execute(array($account));$webAfter=$s->fetch(PDO::FETCH_ASSOC);echo json_encode(array('success'=>true,'durationSeconds'=>$duration,'game'=>$gameAfter,'web'=>$webAfter,'backup'=>$backupDir),JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_PRETTY_PRINT);'''


def main():
    password = getpass.getpass("Production password (not logged): ")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup = f"/linhhoasu/_ai_workbench/backups/test_lock_vanduc97_2min_{stamp}"
    ssh = paramiko.SSHClient(); ssh.load_system_host_keys(); ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False, allow_agent=False, timeout=20, banner_timeout=20, auth_timeout=20)
    try:
        _, stdout, stderr = ssh.exec_command("php -r " + shlex.quote(PHP) + " " + shlex.quote(backup), timeout=120)
        output=stdout.read().decode('utf-8','replace'); error=stderr.read().decode('utf-8','replace'); code=stdout.channel.recv_exit_status()
    finally: ssh.close()
    if code: raise SystemExit(error or output or f"remote exit={code}")
    print(json.dumps(json.loads(output), ensure_ascii=False, indent=2))


if __name__ == '__main__': main()
